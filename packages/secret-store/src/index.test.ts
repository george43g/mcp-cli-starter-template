import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildSources,
  MissingSecretError,
  parseEnvFile,
  resolveSecret,
  type SecretRef,
  saveSecret,
  UnsupportedPlatformError,
  varName,
} from "./index.js";

vi.mock("node:child_process", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:child_process")>();
  return { ...original, execFileSync: vi.fn() };
});

const ref: SecretRef = { toolPrefix: "up-bank", name: "token" };
const VAR = "UP_BANK_TOKEN";

const origPlatform = process.platform;
function setPlatform(p: NodeJS.Platform) {
  Object.defineProperty(process, "platform", { value: p, configurable: true });
}

let tmp: string;

function clearEnv() {
  for (const k of [
    VAR,
    `${VAR}_JSON`,
    `${VAR}_KEYCHAIN`,
    "SECRET_STORE_EXEC_BIN",
    "SECRET_STORE_EXEC_ARGS",
  ]) {
    delete process.env[k];
  }
}

beforeEach(() => {
  clearEnv();
  vi.mocked(execFileSync).mockReset();
  tmp = mkdtempSync(join(tmpdir(), "secret-store-"));
});

afterEach(() => {
  clearEnv();
  vi.mocked(execFileSync).mockReset();
  setPlatform(origPlatform);
  rmSync(tmp, { recursive: true, force: true });
});

describe("varName", () => {
  it("builds an upper-snake var name from the ref", () => {
    expect(varName(ref)).toBe("UP_BANK_TOKEN");
    expect(varName({ toolPrefix: "a-b-c", name: "x-y" })).toBe("A_B_C_X_Y");
  });
});

describe("parseEnvFile", () => {
  it("parses pairs, skips comments/blanks, strips quotes", () => {
    const out = parseEnvFile(["# c", "", "A=1", 'B="two"', "C='three'", "bad"].join("\n"));
    expect(out).toEqual({ A: "1", B: "two", C: "three" });
  });
});

describe("resolve chain", () => {
  it("resolves from process env first", async () => {
    process.env[VAR] = "from-env";
    const r = await resolveSecret(ref, { skipKeychain: true, envFile: { cwd: tmp } });
    expect(r).toEqual({ value: "from-env", source: "env" });
  });

  it("accepts the _JSON alias and returns the raw string", async () => {
    process.env[`${VAR}_JSON`] = '{"token":"abc"}';
    const r = await resolveSecret(ref, { skipKeychain: true, envFile: { cwd: tmp } });
    expect(r).toEqual({ value: '{"token":"abc"}', source: "env" });
  });

  it("falls back to a .env file when env is unset", async () => {
    writeFileSync(join(tmp, ".env"), `${VAR}=from-file\n`);
    const r = await resolveSecret(ref, { skipKeychain: true, envFile: { cwd: tmp } });
    expect(r).toEqual({ value: "from-file", source: "env-file" });
  });

  it("prefers real env over a .env file", async () => {
    process.env[VAR] = "from-env";
    writeFileSync(join(tmp, ".env"), `${VAR}=from-file\n`);
    const r = await resolveSecret(ref, { skipKeychain: true, envFile: { cwd: tmp } });
    expect(r?.value).toBe("from-env");
  });

  it("honors .env.local over .env", async () => {
    writeFileSync(join(tmp, ".env"), `${VAR}=base\n`);
    writeFileSync(join(tmp, ".env.local"), `${VAR}=local\n`);
    const r = await resolveSecret(ref, { skipKeychain: true, envFile: { cwd: tmp } });
    expect(r?.value).toBe("local");
  });

  it("reads the keychain when env and .env miss", async () => {
    setPlatform("darwin");
    vi.mocked(execFileSync).mockReturnValue("kc-token\n");
    const r = await resolveSecret(ref, { envFile: { cwd: tmp } });
    expect(r).toEqual({ value: "kc-token", source: "keychain" });
    expect(execFileSync).toHaveBeenCalledWith(
      "/usr/bin/security",
      ["find-generic-password", "-s", "up-bank", "-a", VAR, "-w"],
      expect.any(Object),
    );
  });

  it("honors a {VAR}_KEYCHAIN service/account override", async () => {
    setPlatform("darwin");
    process.env[`${VAR}_KEYCHAIN`] = "svc/ACCT";
    vi.mocked(execFileSync).mockReturnValue("v\n");
    await resolveSecret(ref, { envFile: { cwd: tmp } });
    expect(execFileSync).toHaveBeenCalledWith(
      "/usr/bin/security",
      ["find-generic-password", "-s", "svc", "-a", "ACCT", "-w"],
      expect.any(Object),
    );
  });

  it("skips the keychain off macOS without shelling out", async () => {
    setPlatform("linux");
    const r = await resolveSecret(ref, { envFile: { cwd: tmp } });
    expect(r).toBeNull();
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it("does not include an exec layer unless configured", async () => {
    setPlatform("linux"); // keychain out of the way
    const names = buildSources({ envFile: { cwd: tmp } }).map((s) => s.name);
    expect(names).toEqual(["env", "env-file", "keychain"]);
  });

  it("uses the exec layer last, substituting {VAR}", async () => {
    setPlatform("linux");
    vi.mocked(execFileSync).mockReturnValue("exec-token\n");
    const r = await resolveSecret(ref, {
      envFile: { cwd: tmp },
      exec: { bin: "/abs/mgr", args: ["get", "{VAR}", "--cached-only"] },
    });
    expect(r).toEqual({ value: "exec-token", source: "exec" });
    expect(execFileSync).toHaveBeenCalledWith(
      "/abs/mgr",
      ["get", VAR, "--cached-only"],
      expect.any(Object),
    );
  });

  it("configures the exec layer from SECRET_STORE_EXEC_* env", async () => {
    setPlatform("linux");
    process.env.SECRET_STORE_EXEC_BIN = "/abs/mgr";
    process.env.SECRET_STORE_EXEC_ARGS = "get {VAR} --cached-only";
    vi.mocked(execFileSync).mockReturnValue("env-cfg-token\n");
    const r = await resolveSecret(ref, { envFile: { cwd: tmp } });
    expect(r?.source).toBe("exec");
    expect(execFileSync).toHaveBeenCalledWith(
      "/abs/mgr",
      ["get", VAR, "--cached-only"],
      expect.any(Object),
    );
  });

  it("returns null when nothing resolves, and throws with required:true", async () => {
    setPlatform("linux");
    expect(await resolveSecret(ref, { envFile: { cwd: tmp } })).toBeNull();
    await expect(
      resolveSecret(ref, { envFile: { cwd: tmp }, required: true }),
    ).rejects.toBeInstanceOf(MissingSecretError);
  });

  it("degrades to the next source when a layer throws", async () => {
    setPlatform("darwin");
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error("no item");
    });
    writeFileSync(join(tmp, ".env"), `${VAR}=file-wins\n`);
    const r = await resolveSecret(ref, { envFile: { cwd: tmp } });
    expect(r).toEqual({ value: "file-wins", source: "env-file" });
  });
});

describe("write surface", () => {
  it("saves to the keychain with -U and without -A by default", async () => {
    setPlatform("darwin");
    vi.mocked(execFileSync).mockReturnValue("");
    await saveSecret(ref, "new-value");
    const args = vi.mocked(execFileSync).mock.calls[0]?.[1] as string[];
    expect(args.slice(0, 7)).toEqual([
      "add-generic-password",
      "-U",
      "-s",
      "up-bank",
      "-a",
      VAR,
      "-w",
    ]);
    expect(args).not.toContain("-A");
  });

  it("adds -A only when allowAnyApp is set", async () => {
    setPlatform("darwin");
    vi.mocked(execFileSync).mockReturnValue("");
    await saveSecret(ref, "v", { allowAnyApp: true });
    expect(vi.mocked(execFileSync).mock.calls[0]?.[1] as string[]).toContain("-A");
  });

  it("refuses to store an empty value", async () => {
    setPlatform("darwin");
    await expect(saveSecret(ref, "")).rejects.toThrow(/empty value/);
  });

  it("throws UnsupportedPlatformError when saving off macOS", async () => {
    setPlatform("linux");
    await expect(saveSecret(ref, "v")).rejects.toBeInstanceOf(UnsupportedPlatformError);
    expect(execFileSync).not.toHaveBeenCalled();
  });
});

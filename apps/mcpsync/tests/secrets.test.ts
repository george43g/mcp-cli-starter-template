import { chmodSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { normalize } from "../src/core/canonical.js";
import {
  type Credentials,
  readCredentials,
  referencedVars,
  removeCredential,
  resolveRef,
  setCredential,
  writeCredentials,
} from "../src/core/secrets.js";

let dir: string;
let nested: string; // path whose dir must be created (permission test)
let flat: string; // path directly in the tmp dir (read tests)

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "mcpsync-secrets-"));
  nested = join(dir, "vault", "credentials.json");
  flat = join(dir, "credentials.json");
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const mode = (p: string) => statSync(p).mode & 0o777;

describe("credentials vault permissions", () => {
  it("writes the file at 0600 and its dir at 0700", () => {
    writeCredentials({ github: { GITHUB_TOKEN: "s3cr3t" } }, nested);
    expect(mode(nested)).toBe(0o600);
    expect(mode(join(dir, "vault"))).toBe(0o700);
  });

  it("re-tightens a file whose mode drifted (unconditional chmod)", () => {
    writeCredentials({ a: { K: "v" } }, nested);
    chmodSync(nested, 0o644);
    writeCredentials({ a: { K: "v2" } }, nested);
    expect(mode(nested)).toBe(0o600);
  });
});

describe("readCredentials", () => {
  it("returns {} for a missing file (never throws)", () => {
    expect(readCredentials(join(dir, "nope.json"))).toEqual({});
  });

  it("returns {} for unparseable JSON (never throws)", () => {
    writeFileSync(flat, "{ not json");
    expect(readCredentials(flat)).toEqual({});
  });

  it("drops non-string values defensively", () => {
    writeFileSync(flat, JSON.stringify({ a: { K: "ok", N: 5 } }));
    expect(readCredentials(flat)).toEqual({ a: { K: "ok" } });
  });
});

describe("setCredential / removeCredential", () => {
  it("merges keys and round-trips", () => {
    setCredential("gh", "TOKEN", "t1", flat);
    setCredential("gh", "OTHER", "o1", flat);
    expect(readCredentials(flat)).toEqual({ gh: { TOKEN: "t1", OTHER: "o1" } });
  });

  it("removes one key, then the empty server entry", () => {
    setCredential("gh", "TOKEN", "t1", flat);
    setCredential("gh", "OTHER", "o1", flat);
    removeCredential("gh", "TOKEN", flat);
    expect(readCredentials(flat)).toEqual({ gh: { OTHER: "o1" } });
    removeCredential("gh", "OTHER", flat);
    expect(readCredentials(flat)).toEqual({});
  });

  it("removes a whole server entry when key is omitted", () => {
    setCredential("gh", "TOKEN", "t1", flat);
    removeCredential("gh", undefined, flat);
    expect(readCredentials(flat)).toEqual({});
  });
});

describe("referencedVars", () => {
  it("collects ${VAR} names across env, headers, args, command, url (sorted, unique)", () => {
    const s = normalize(
      {
        command: "${BIN}",
        args: ["--flag", "${ARG}"],
        env: { A: "${GITHUB_TOKEN}", B: "literal" },
      },
      "x",
    );
    expect(referencedVars(s)).toEqual(["ARG", "BIN", "GITHUB_TOKEN"]);
  });

  it("reads a Bearer header placeholder", () => {
    const s = normalize(
      { url: "https://x", type: "http", headers: { Authorization: "Bearer ${TOK}" } },
      "r",
    );
    expect(referencedVars(s)).toEqual(["TOK"]);
  });
});

describe("resolveRef", () => {
  const creds: Credentials = { gh: { GITHUB_TOKEN: "x" } };

  it("prefers the per-server vault entry", () => {
    expect(resolveRef("GITHUB_TOKEN", "gh", creds, {})).toBe("credentials");
  });

  it("falls back to the process env", () => {
    expect(resolveRef("GITHUB_TOKEN", "other", creds, { GITHUB_TOKEN: "e" })).toBe("env");
  });

  it("reports unresolved when neither has it (empty env value counts as unset)", () => {
    expect(resolveRef("GITHUB_TOKEN", "other", creds, {})).toBe("unresolved");
    expect(resolveRef("GITHUB_TOKEN", "other", creds, { GITHUB_TOKEN: "" })).toBe("unresolved");
  });
});

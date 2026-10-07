import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runLegendCli, USAGE } from "./legend-cli.js";

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// The built entry, as a real consumer would import it.
const INDEX = pathToFileURL(join(PKG, "dist/index.js")).href;
const BIN = join(PKG, "dist/bin/keymap-legend.js");

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "keymap-legend-"));
  // A consumer module exporting a Keymap as default.
  writeFileSync(
    join(dir, "keys.mjs"),
    `import { defineKeymap, vimScrollOnly } from ${JSON.stringify(INDEX)};
export default defineKeymap(vimScrollOnly, { overrides: { lineUp: "ctrl+k" } });
`,
  );
  // A plain Binding[] under a named export, no default.
  writeFileSync(
    join(dir, "named.mjs"),
    `export const keymap = [{ id: "quit", keys: "q", desc: "Quit", location: "src/app.ts:7" }];
export const other = [{ id: "help", keys: "?", desc: "Help" }];
`,
  );
  writeFileSync(join(dir, "empty.mjs"), "export const nothing = 1;\n");
  writeFileSync(join(dir, "bad.mjs"), `export default [{ id: "x", keys: "KeyD", desc: "" }];\n`);
  writeFileSync(join(dir, "throws.mjs"), `throw new Error("boom");\n`);
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

async function run(...argv: string[]) {
  let stdout = "";
  let stderr = "";
  const code = await runLegendCli(argv, {
    stdout: (t) => (stdout += t),
    stderr: (t) => (stderr += t),
    cwd: dir,
  });
  return { code, stdout, stderr };
}

describe("runLegendCli", () => {
  it("writes the JSON legend of a default-exported Keymap to stdout", async () => {
    const r = await run("keys.mjs", "--owner", "wm-stack");
    expect(r.code).toBe(0);
    const legend = JSON.parse(r.stdout);
    expect(legend).toMatchObject({ version: 1, source: "keys", owner: "wm-stack", style: "vim" });
    expect(legend.bindings).toHaveLength(4);
    expect(legend.bindings[3]).toMatchObject({ id: "lineUp", keys: ["ctrl+k"], isDefault: false });
  });

  it("falls back to a `keymap` export holding a Binding[], and prints TSV", async () => {
    const r = await run("named.mjs", "--format", "tsv", "--source", "app", "--owner", "me");
    expect(r.code).toBe(0);
    expect(r.stdout).toBe("app\tq\tQuit\tme\tsrc/app.ts:7\n");
  });

  it("honours --export and --style", async () => {
    const r = await run("named.mjs", "--export", "other", "--style", "plain", "--format", "tsv");
    expect(r.stdout).toBe("named\t?\tHelp\t\t\n");
  });

  it("writes --out relative to cwd", async () => {
    const r = await run("keys.mjs", "--out", "legend.json");
    expect(r.code).toBe(0);
    expect(r.stdout).toBe("");
    expect(r.stderr).toMatch(/wrote 4 binding\(s\)/);
    expect(JSON.parse(readFileSync(join(dir, "legend.json"), "utf8")).source).toBe("keys");
  });

  it("prints usage for --help", async () => {
    const r = await run("--help");
    expect(r).toEqual({ code: 0, stdout: USAGE, stderr: "" });
  });

  it.each([
    [[]],
    [["a.mjs", "b.mjs"]],
    [["keys.mjs", "--format", "yaml"]],
    [["keys.mjs", "--style", "emacs"]],
    [["keys.mjs", "--bogus"]],
  ])("exits 2 on bad usage %j", async (argv) => {
    const r = await run(...argv);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("usage: keymap-legend");
  });

  it("exits 1 when the module has no usable export", async () => {
    const r = await run("empty.mjs");
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(
      /no Keymap or Binding\[\] export named "default" or "keymap" \(exports: nothing\)/,
    );
  });

  it("exits 1 when the bindings are invalid or the module cannot load", async () => {
    expect((await run("bad.mjs")).stderr).toMatch(/export "default": binding "x"/);
    expect((await run("throws.mjs")).stderr).toMatch(/cannot import .*boom/);
    expect((await run("missing.mjs")).code).toBe(1);
  });
});

describe("keymap-legend bin (built)", () => {
  it("runs end to end from dist", () => {
    const r = spawnSync(process.execPath, [BIN, "named.mjs", "--format", "tsv"], {
      cwd: dir,
      encoding: "utf8",
    });
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("named\tq\tQuit\t\tsrc/app.ts:7\n");
  });

  it("starts with a node shebang", () => {
    expect(readFileSync(BIN, "utf8").startsWith("#!/usr/bin/env node\n")).toBe(true);
  });

  it("exits 2 on bad usage", () => {
    const r = spawnSync(process.execPath, [BIN], { cwd: dir, encoding: "utf8" });
    expect(r.status).toBe(2);
  });
});

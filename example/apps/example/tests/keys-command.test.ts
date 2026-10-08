/**
 * `keys` / `--keys` against the BUILT bin, which is what a cheatsheet
 * collector runs, and `dist/keys.json`, which `pnpm build` writes.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Command } from "commander";
import { describe, expect, it, vi } from "vitest";
import { keysOutput, registerKeysCommand } from "../src/commands/keys.js";
import { APP_NAME, CLI_NAME } from "../src/meta.js";

const APP_ROOT = join(import.meta.dirname, "..");
const bin = (...args: string[]) =>
  execFileSync("node", [join(APP_ROOT, "dist", "cli.js"), ...args], {
    encoding: "utf8",
    timeout: 30_000,
  });

describe("keys", () => {
  it("prints the collector rows: source, key, description, owner, file:line", () => {
    const rows = bin("keys").split("\n");
    expect(rows.slice(0, 3)).toEqual([
      `${CLI_NAME}\tj\tMove down\t${APP_NAME}\t`,
      `${CLI_NAME}\t<Down>\tMove down\t${APP_NAME}\t`,
      `${CLI_NAME}\tk\tMove up\t${APP_NAME}\t`,
    ]);
    expect(rows).toContain(`${CLI_NAME}\td\tToggle dev stats\t${APP_NAME}\t`);
    expect(rows.at(-1)).toBe("");
  });

  it("--keys prints the same rows and exits 0", () => {
    expect(bin("--keys")).toBe(bin("keys"));
  });

  it("keys --json is byte-identical to the dist/keys.json the build writes", () => {
    expect(bin("--json", "keys")).toBe(readFileSync(join(APP_ROOT, "dist", "keys.json"), "utf8"));
  });
});

describe("keys, in process", () => {
  it("prints rows by default and the legend with json", () => {
    expect(keysOutput(false).split("\n")[0]).toBe(`${CLI_NAME}\tj\tMove down\t${APP_NAME}\t`);
    expect(JSON.parse(keysOutput(true))).toMatchObject({
      version: 1,
      source: CLI_NAME,
      owner: APP_NAME,
    });
  });

  it("registers the keys command and a --keys flag that exits 0", async () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("exit");
    }) as never);
    try {
      const sub = new Command();
      registerKeysCommand(sub);
      await sub.parseAsync(["keys"], { from: "user" });
      expect(write).toHaveBeenLastCalledWith(keysOutput(false));

      const flag = new Command();
      registerKeysCommand(flag);
      await expect(flag.parseAsync(["--keys"], { from: "user" })).rejects.toThrow("exit");
      expect(exit).toHaveBeenCalledWith(0);
      expect(write).toHaveBeenLastCalledWith(keysOutput(false));
    } finally {
      write.mockRestore();
      exit.mockRestore();
    }
  });
});

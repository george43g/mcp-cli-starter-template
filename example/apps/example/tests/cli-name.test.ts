/**
 * The command name `--help` prints IS the installed bin — read, never derived.
 *
 * It used to be computed by regex: strip the scope off the package name, then
 * strip a trailing `-mcp`. That agreed with `bin` only while the scaffolder
 * forced every app to be `<name>-mcp` with a bare `<name>` bin. Once app names
 * are taken verbatim, `--name foo-mcp` installs a `foo-mcp` bin, and the strip
 * would have had `--help` advertise a `foo` command that does not exist.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CLI_NAME, cliNameOf } from "../src/meta.js";

const APP_ROOT = join(import.meta.dirname, "..");
const pkg = JSON.parse(readFileSync(join(APP_ROOT, "package.json"), "utf8")) as {
  bin: Record<string, string>;
};

describe("CLI_NAME", () => {
  it("is the package's one bin key", () => {
    expect(Object.keys(pkg.bin)).toEqual([CLI_NAME]);
  });

  it("is what the built bin's --help names as the command", () => {
    const help = execFileSync("node", [join(APP_ROOT, "dist", "cli.js"), "--help"], {
      encoding: "utf8",
      timeout: 30_000,
    });
    expect(help.split("\n")[0]).toBe(`Usage: ${CLI_NAME} [options] [command]`);
  });
});

describe("cliNameOf", () => {
  it("takes the first key of an object bin, whatever the package is called", () => {
    expect(cliNameOf({ name: "@x/foo-mcp", bin: { "foo-mcp": "./dist/cli.js" } })).toBe("foo-mcp");
    expect(cliNameOf({ name: "@x/foo-mcp", bin: { foo: "./dist/cli.js" } })).toBe("foo");
  });

  it("follows npm for a string bin: the unscoped package name, suffix and all", () => {
    expect(cliNameOf({ name: "@x/foo-mcp", bin: "./dist/cli.js" })).toBe("foo-mcp");
  });

  it("falls back to the unscoped package name when there is no bin", () => {
    expect(cliNameOf({ name: "@x/foo" })).toBe("foo");
    expect(cliNameOf({ name: "plain", bin: {} })).toBe("plain");
  });
});

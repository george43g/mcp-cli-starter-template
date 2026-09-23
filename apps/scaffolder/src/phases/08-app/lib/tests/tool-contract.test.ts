/**
 * Contracts between the tool registry, the bin, and the README that describes
 * them. Each list is read from its source — the registry, `package.json` and
 * the built bin's `--help` — never written out here, so a tool or subcommand
 * added tomorrow is checked the day it is registered.
 *
 * - Every registered tool carries a non-empty `annotations.title`. It is
 *   optional in MCP, but hosts show it in their tool UIs, and a tool without
 *   one falls back to its snake_case name there.
 * - README `## Tools` lists exactly the registered tools, and its CLI column
 *   names only subcommands the bin really has.
 * - README `## Bins` lists exactly the `package.json` bin keys, and its
 *   subcommand table lists exactly the bin's subcommands. It once listed three
 *   bins against a one-entry `bin`, and subcommands that did not exist.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeAppRegistry } from "../src/tools/registry.js";

const APP_ROOT = join(import.meta.dirname, "..");
const README = readFileSync(join(APP_ROOT, "README.md"), "utf8");
const pkg = JSON.parse(readFileSync(join(APP_ROOT, "package.json"), "utf8")) as {
  bin: Record<string, string>;
};
const registry = makeAppRegistry();

/** The body of a `## <heading>` section, up to the next `## ` heading. */
function section(heading: string): string {
  const lines = README.split("\n");
  const start = lines.findIndex((l) => l.trim() === `## ${heading}`);
  if (start === -1) return "";
  const end = lines.findIndex((l, i) => i > start && l.startsWith("## "));
  return lines.slice(start + 1, end === -1 ? undefined : end).join("\n");
}

/**
 * Data rows of the markdown table in `body` whose header row starts with
 * `| <firstHeader> |`, as arrays of trimmed cells.
 */
function tableRows(body: string, firstHeader: string): string[][] {
  const lines = body.split("\n");
  const head = lines.findIndex((l) => new RegExp(`^\\|\\s*${firstHeader}\\s*\\|`).test(l));
  if (head === -1) return [];
  const rows: string[][] = [];
  for (const line of lines.slice(head + 2)) {
    if (!line.startsWith("|")) break;
    rows.push(
      line
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim()),
    );
  }
  return rows;
}

/** Every backticked token in a cell, first word only (`noop --input` → `noop`). */
function codeNames(cell: string): string[] {
  return [...cell.matchAll(/`([^`]+)`/g)].map((m) => (m[1] ?? "").split(/\s+/)[0] ?? "");
}

/** Subcommands from the built bin's own `--help`, aliases excluded. */
function subcommands(): string[] {
  const help = execFileSync("node", [join(APP_ROOT, "dist", "cli.js"), "--help"], {
    encoding: "utf8",
    timeout: 30_000,
  });
  const body = help.split(/^Commands:/m)[1] ?? "";
  const names = new Set<string>();
  for (const line of body.split("\n")) {
    const m = /^\s{2}([a-z][a-z0-9-]*)/.exec(line);
    if (m?.[1] && m[1] !== "help") names.add(m[1]);
  }
  return [...names].sort();
}

const sorted = (xs: Iterable<string>) => [...xs].sort();

describe("tool annotations", () => {
  it("the registry is not empty, so the checks below cannot pass vacuously", () => {
    expect(registry.tools.length).toBeGreaterThan(0);
  });

  it.each(registry.tools.map((t) => [t.name, t] as const))(
    "`%s` has a non-empty annotations.title",
    (_name, tool) => {
      expect(tool.annotations.title?.trim() ?? "").not.toBe("");
    },
  );
});

describe("README ## Tools", () => {
  const rows = tableRows(section("Tools"), "Tool");

  it("lists exactly the registered tools", () => {
    expect(sorted(rows.map((r) => codeNames(r[0] ?? "")[0] ?? ""))).toEqual(
      sorted(registry.tools.map((t) => t.name)),
    );
  });

  it("names only real subcommands in its CLI column", () => {
    const real = subcommands();
    const named = rows.flatMap((r) => codeNames(r[1] ?? ""));
    for (const sub of named) expect(real, `README names \`${sub}\``).toContain(sub);
  });
});

describe("README ## Bins", () => {
  const body = section("Bins");

  it("lists exactly the package.json bin keys", () => {
    const bins = tableRows(body, "Bin").map((r) => codeNames(r[0] ?? "")[0] ?? "");
    expect(sorted(bins)).toEqual(sorted(Object.keys(pkg.bin)));
  });

  it("lists exactly the bin's subcommands", () => {
    const subs = tableRows(body, "Subcommand").map((r) => codeNames(r[0] ?? "")[0] ?? "");
    expect(sorted(subs)).toEqual(subcommands());
  });
});

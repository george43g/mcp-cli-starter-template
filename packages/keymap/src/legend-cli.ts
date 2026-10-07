/**
 * `keymap-legend`: write a consumer's legend file at build time.
 *
 *   keymap-legend <module> [--export <name>] [--out <file>] [--format json|tsv]
 *                 [--source <name>] [--owner <name>] [--style vim|plain|symbols]
 *
 * The module's export may be a `Keymap` (from `defineKeymap`) or a plain
 * `Binding[]`. Without `--export`, `default` is tried, then `keymap`. A `.ts`
 * module works on Node ≥ 24 when it uses only erasable TypeScript syntax.
 *
 * Kept out of the package barrel: it imports `node:*`, and the barrel must stay
 * loadable in a browser IIFE.
 */

import { writeFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { type Binding, defineKeymap, type Keymap } from "./keymap.js";
import { formatKeysRows, toLegend } from "./legend.js";
import type { DisplayStyle } from "./notation.js";

export interface CliIo {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  cwd: string;
}

export const USAGE = `usage: keymap-legend <module> [--export <name>] [--out <file>] [--format json|tsv]
                     [--source <name>] [--owner <name>] [--style vim|plain|symbols]

Imports <module>, reads a Keymap or Binding[] export (default: "default", then
"keymap"), and writes its legend as JSON or as --keys TSV rows.
`;

const STYLES = new Set(["vim", "plain", "symbols"]);

const isKeymap = (v: unknown): v is Keymap =>
  typeof v === "object" &&
  v !== null &&
  Array.isArray((v as Keymap).bindings) &&
  typeof (v as Keymap).isDefault === "function";

/** Returns the process exit code: 0 ok, 1 failed, 2 usage error. */
export async function runLegendCli(argv: readonly string[], io: CliIo): Promise<number> {
  let parsed: ReturnType<typeof parse>;
  try {
    parsed = parse(argv);
  } catch (error) {
    io.stderr(`keymap-legend: ${(error as Error).message}\n${USAGE}`);
    return 2;
  }
  const { values, positionals } = parsed;
  if (values.help) {
    io.stdout(USAGE);
    return 0;
  }
  const format = values.format ?? "json";
  const style = values.style ?? "vim";
  if (positionals.length !== 1 || (format !== "json" && format !== "tsv") || !STYLES.has(style)) {
    io.stderr(USAGE);
    return 2;
  }

  const modulePath = resolve(io.cwd, positionals[0]!);
  let mod: Record<string, unknown>;
  try {
    mod = (await import(pathToFileURL(modulePath).href)) as Record<string, unknown>;
  } catch (error) {
    io.stderr(`keymap-legend: cannot import ${modulePath}: ${(error as Error).message}\n`);
    return 1;
  }

  const names = values.export ? [values.export] : ["default", "keymap"];
  const name = names.find((n) => mod[n] !== undefined);
  const value = name === undefined ? undefined : mod[name];
  let keymap: Keymap;
  if (isKeymap(value)) {
    keymap = value;
  } else if (Array.isArray(value)) {
    try {
      keymap = defineKeymap(value as Binding[]);
    } catch (error) {
      io.stderr(`keymap-legend: export "${name}": ${(error as Error).message}\n`);
      return 1;
    }
  } else {
    io.stderr(
      `keymap-legend: ${modulePath} has no Keymap or Binding[] export named ${names
        .map((n) => `"${n}"`)
        .join(" or ")} (exports: ${Object.keys(mod).join(", ") || "none"})\n`,
    );
    return 1;
  }

  const source = values.source ?? basename(modulePath, extname(modulePath));
  const owner = values.owner ?? "";
  const body =
    format === "json"
      ? `${JSON.stringify(toLegend(keymap, { source, owner, style: style as DisplayStyle }), null, 2)}\n`
      : formatKeysRows(keymap, { source, owner, style: style as DisplayStyle })
          .map((row) => `${row}\n`)
          .join("");

  if (values.out) {
    const out = resolve(io.cwd, values.out);
    await writeFile(out, body);
    io.stderr(`keymap-legend: wrote ${keymap.bindings.length} binding(s) to ${out}\n`);
  } else {
    io.stdout(body);
  }
  return 0;
}

function parse(argv: readonly string[]) {
  return parseArgs({
    args: [...argv],
    allowPositionals: true,
    strict: true,
    options: {
      export: { type: "string" },
      out: { type: "string" },
      format: { type: "string" },
      source: { type: "string" },
      owner: { type: "string" },
      style: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
}

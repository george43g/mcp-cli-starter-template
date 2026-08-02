/**
 * `mcpsync secret …` — manage the optional local credentials vault
 * (`~/.mcpsync/credentials.json`, mode 0600). Values are read from stdin by
 * default so they never land in shell history or the process table; `--value`
 * is the explicit (history-leaking) escape hatch for scripting.
 *
 * The vault only ever backs `${VAR}` indirection and `doctor`'s reachability
 * report — mcpsync never inlines a stored value into a host config.
 */

import { color, isInteractive, printJson, resolveOutputMode } from "@george43g/cli-kit";
import {
  type Credentials,
  readCredentials,
  removeCredential,
  setCredential,
} from "../core/secrets.js";

/** Read all of stdin (used when a value is piped in). */
async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

export interface SecretSetOpts {
  value?: string | undefined;
}

/** Store `server.KEY = value`, taking the value from --value, then stdin, then a prompt. */
export async function runSecretSet(
  server: string,
  key: string,
  opts: SecretSetOpts = {},
): Promise<void> {
  let value = opts.value;
  if (value === undefined) {
    if (!process.stdin.isTTY) {
      value = (await readStdin()).replace(/\r?\n$/, "");
    } else if (isInteractive()) {
      const { createInterface } = await import("node:readline/promises");
      const rl = createInterface({ input: process.stdin, output: process.stderr });
      try {
        value = (await rl.question(`Value for ${server}.${key} (input is echoed): `)).trim();
      } finally {
        rl.close();
      }
    }
  }
  if (!value) {
    process.stderr.write("✗ no value provided (pipe it in, or pass --value)\n");
    process.exitCode = 1;
    return;
  }
  setCredential(server, key, value);
  process.stdout.write(`${color.green("✓")} stored ${server}.${key} (vault at mode 0600)\n`);
}

/** List stored credentials — server names and KEY names only, never values. */
export function runSecretList(opts: { json?: boolean | undefined } = {}): void {
  const creds: Credentials = readCredentials();
  if (resolveOutputMode({ json: opts.json ?? false }) === "json") {
    const redacted: Record<string, string[]> = {};
    for (const [name, vars] of Object.entries(creds)) redacted[name] = Object.keys(vars).sort();
    printJson(redacted);
    return;
  }
  const names = Object.keys(creds).sort();
  if (!names.length) {
    process.stdout.write("No credentials stored (~/.mcpsync/credentials.json).\n");
    return;
  }
  for (const name of names) {
    process.stdout.write(`${color.cyan(name)}\n`);
    for (const k of Object.keys(creds[name] ?? {}).sort()) {
      process.stdout.write(`  ${k} ${color.dim("(set)")}\n`);
    }
  }
}

/** Remove one KEY, or a whole server entry when KEY is omitted. */
export function runSecretRemove(server: string, key: string | undefined): void {
  removeCredential(server, key);
  const what = key ? `${server}.${key}` : server;
  process.stdout.write(`${color.green("✓")} removed ${what}\n`);
}

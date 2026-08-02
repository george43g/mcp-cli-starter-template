import { homedir } from "node:os";
import { CANONICAL_DEFAULT, normalize, readCanonical, writeCanonical } from "../core/canonical.js";

export interface AddOpts {
  name: string;
  command?: string | undefined;
  args?: string[] | undefined;
  env?: string[] | undefined; // ["K=V", …]
  transport?: string | undefined; // stdio | http | sse
  url?: string | undefined;
  header?: string[] | undefined; // ["K: V", …]
  config?: string | undefined;
  dryRun?: boolean | undefined;
}

/** Split "K<sep>V" on the FIRST separator only; V may itself contain the sep. */
export function splitOnce(s: string, sep: string): [string, string] {
  const i = s.indexOf(sep);
  return i === -1 ? [s, ""] : [s.slice(0, i), s.slice(i + sep.length)];
}

/** Build a canonical McpServer from `add`-style flags. Pure — unit-tested. */
export function buildServerFromFlags(opts: AddOpts) {
  const env = Object.fromEntries((opts.env ?? []).map((e) => splitOnce(e, "=")));
  const headers = Object.fromEntries(
    (opts.header ?? []).map((h) => {
      const [k, v] = splitOnce(h, ":");
      return [k.trim(), v.trim()];
    }),
  );
  return normalize(
    {
      transport: opts.transport,
      command: opts.command,
      args: opts.args ?? [],
      env,
      url: opts.url,
      headers,
    },
    opts.name,
  );
}

/** Add (or overwrite) a server in the canonical manifest. */
export function runAdd(opts: AddOpts): void {
  if (!opts.command && !opts.url) {
    process.stderr.write("✗ add needs either --command <cmd> or --url <url>\n");
    process.exitCode = 1;
    return;
  }
  const server = buildServerFromFlags(opts);
  const canonical = readCanonical(opts.config);
  canonical[opts.name] = server;
  writeCanonical(canonical, opts.config, { dryRun: opts.dryRun ?? false });
  const where = (opts.config ?? CANONICAL_DEFAULT).replace(homedir(), "~");
  process.stdout.write(
    `Added "${opts.name}" → ${where}${opts.dryRun ? " (dry-run)" : ""}. Run \`mcpsync apply\` to push to hosts.\n`,
  );
}

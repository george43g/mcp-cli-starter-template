import { homedir } from "node:os";
import { color, printJson, printTable, resolveOutputMode } from "@george43g/cli-kit";
import { readCanonical } from "../core/canonical.js";
import { detectedHosts, hostList } from "../core/hosts/index.js";
import { scanHostsForSecrets } from "../core/secret-scan.js";
import { type Credentials, readCredentials, referencedVars, resolveRef } from "../core/secrets.js";

export interface DoctorOpts {
  json?: boolean | undefined;
  config?: string | undefined;
}

interface HostRow {
  host: string;
  label: string;
  mechanism: string;
  detected: boolean;
  config: string;
  restart: string;
}

interface DoctorReport {
  hosts: HostRow[];
  /** Redacted plaintext-secret warnings per host (only hosts with hits). */
  secrets: { host: string; warnings: string[] }[];
  /** Per server, each `${VAR}` it references and where it would resolve from. */
  resolution: { server: string; var: string; source: string }[];
}

/**
 * Diagnose the local MCP setup, read-only: which hosts are present, any inlined
 * plaintext secrets (redacted — never the value), and whether every `${VAR}` the
 * canonical servers reference is reachable (from the credentials vault or the
 * shell env). Never mutates anything.
 */
export function runDoctor(opts: DoctorOpts = {}): void {
  const home = homedir();
  const hosts: HostRow[] = hostList().map((h) => ({
    host: h.id,
    label: h.label,
    mechanism: h.capabilities.mechanism,
    detected: h.detect(),
    config: h.configPath.replace(home, "~"),
    restart: h.restart,
  }));

  const secrets = scanHostsForSecrets(detectedHosts());

  const canonical = readCanonical(opts.config);
  const creds: Credentials = readCredentials();
  const resolution: DoctorReport["resolution"] = [];
  for (const server of Object.values(canonical)) {
    for (const v of referencedVars(server)) {
      resolution.push({ server: server.name, var: v, source: resolveRef(v, server.name, creds) });
    }
  }

  // Resolve mode once (cli-kit auto-selects JSON when piped / CI) so the human
  // sections below never leak out after an auto-JSON blob.
  if (resolveOutputMode({ json: opts.json ?? false }) === "json") {
    const report: DoctorReport = { hosts, secrets, resolution };
    printJson(report);
    return;
  }

  printTable(hosts, {
    head: ["Host", "Mechanism", "Detected", "Config"],
    rows: (r) => [r.label, r.mechanism, r.detected ? "yes" : "no", r.config],
  });

  process.stdout.write("\nPlaintext secrets (should be none — use ${VAR}):\n");
  if (!secrets.length) {
    process.stdout.write(`  ${color.green("none detected ✓")}\n`);
  } else {
    for (const { warnings } of secrets) {
      for (const w of warnings) process.stdout.write(`  ${color.yellow("⚠")}  ${w}\n`);
    }
  }

  if (resolution.length) {
    process.stdout.write("\n${VAR} resolution:\n");
    for (const r of resolution) {
      const tag =
        r.source === "unresolved" ? color.red("UNRESOLVED") : color.dim(`from ${r.source}`);
      process.stdout.write(`  ${`${r.server}.${r.var}`.padEnd(36)} ${tag}\n`);
    }
  }
}

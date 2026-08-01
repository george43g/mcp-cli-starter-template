import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { color, printJson, printTable, resolveOutputMode } from "@george43g/cli-kit";
import { CANONICAL_DEFAULT, readCanonical, readRawJson } from "../core/canonical.js";
import { detectedHosts, HOSTS, hostList } from "../core/hosts/index.js";
import {
  type HostSecretReport,
  scanHostSecrets,
  scanHostsForSecrets,
} from "../core/secret-scan.js";
import { type Credentials, readCredentials, referencedVars, resolveRef } from "../core/secrets.js";
import { namesOutsideBlock } from "../core/toml.js";

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
  /** Resolved target when the config path is a symlink (status.js chain check). */
  link?: string;
}

interface DoctorReport {
  hosts: HostRow[];
  /** Redacted plaintext-secret warnings per surface (only surfaces with hits). */
  secrets: HostSecretReport[];
  /** Per server, each `${VAR}` it references and where it would resolve from. */
  resolution: { server: string; var: string; source: string }[];
  /** Advisory notes (codex out-of-block servers, missing Desktop marker, …). */
  notes: string[];
}

/** Resolved symlink target for a config path, or undefined (never throws). */
function linkTarget(configPath: string): string | undefined {
  try {
    return existsSync(configPath) && lstatSync(configPath).isSymbolicLink()
      ? realpathSync(configPath)
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Diagnose the local MCP setup, read-only: which hosts are present (and where
 * their configs really live through symlinks), any inlined plaintext secrets
 * (redacted — never the value; the canonical manifest and codex OUT-OF-BLOCK
 * tables included), whether every `${VAR}` the canonical servers reference is
 * reachable (vault or shell env), plus coexistence advisories. Never mutates.
 */
export function runDoctor(opts: DoctorOpts = {}): void {
  const home = homedir();
  const hosts: HostRow[] = hostList().map((h) => {
    const link = linkTarget(h.configPath);
    return {
      host: h.id,
      label: h.label,
      mechanism: h.capabilities.mechanism,
      detected: h.detect(),
      config: h.configPath.replace(home, "~"),
      restart: h.restart,
      ...(link !== undefined ? { link: link.replace(home, "~") } : {}),
    };
  });

  // Secret scan: the canonical manifest itself first (status.js scanned it too),
  // then every detected host.
  const canonicalPath = opts.config ?? CANONICAL_DEFAULT;
  const secrets: HostSecretReport[] = [];
  const rawCanonical = readRawJson(canonicalPath);
  const canonicalWarnings = scanHostSecrets(
    "canonical",
    (rawCanonical.mcpServers && typeof rawCanonical.mcpServers === "object"
      ? rawCanonical.mcpServers
      : {}) as Record<string, unknown>,
  );
  if (canonicalWarnings.length) secrets.push({ host: "canonical", warnings: canonicalWarnings });
  secrets.push(...scanHostsForSecrets(detectedHosts()));

  const canonical = readCanonical(opts.config);
  const creds: Credentials = readCredentials();
  const resolution: DoctorReport["resolution"] = [];
  for (const server of Object.values(canonical)) {
    for (const v of referencedVars(server)) {
      resolution.push({ server: server.name, var: v, source: resolveRef(v, server.name, creds) });
    }
  }

  // Advisories (ported from status.js's doctor).
  const notes: string[] = [];
  const codex = HOSTS.codex;
  if (codex?.detect() && existsSync(codex.configPath)) {
    const outside = [...namesOutsideBlock(readFileSync(codex.configPath, "utf8"))].sort();
    if (outside.length) {
      notes.push(
        `codex: servers defined outside the managed block (mcpsync skips them): ${outside.join(", ")}`,
      );
    }
  }
  const desktop = HOSTS["claude-desktop"];
  if (desktop?.detect()) {
    const doc = readRawJson(desktop.configPath);
    const hasServers =
      doc.mcpServers &&
      typeof doc.mcpServers === "object" &&
      Object.keys(doc.mcpServers as Record<string, unknown>).length > 0;
    if (hasServers && !Array.isArray(doc._mcpManagedByDotfiles)) {
      notes.push(
        'claude-desktop: no "_mcpManagedByDotfiles" marker yet — existing servers count as hand-added (always preserved); a full apply/sync establishes the managed set.',
      );
    }
  }

  // Resolve mode once (cli-kit auto-selects JSON when piped / CI) so the human
  // sections below never leak out after an auto-JSON blob.
  if (resolveOutputMode({ json: opts.json ?? false }) === "json") {
    const report: DoctorReport = { hosts, secrets, resolution, notes };
    printJson(report);
    return;
  }

  printTable(hosts, {
    head: ["Host", "Mechanism", "Detected", "Config"],
    rows: (r) => [r.label, r.mechanism, r.detected ? "yes" : "no", r.config],
  });

  const linked = hosts.filter((h) => h.link !== undefined);
  if (linked.length) {
    process.stdout.write("\nSymlinked configs:\n");
    for (const h of linked) {
      process.stdout.write(`  ${h.config} ${color.dim("→")} ${h.link}\n`);
    }
  }

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

  if (notes.length) {
    process.stdout.write("\nNotes:\n");
    for (const n of notes) process.stdout.write(`  ${color.dim("•")} ${n}\n`);
  }
}

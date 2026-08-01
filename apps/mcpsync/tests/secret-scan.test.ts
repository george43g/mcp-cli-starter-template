import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { HostAdapter } from "../src/core/hosts/types.js";
import {
  isPlaceholder,
  looksSecret,
  scanCodexText,
  scanHostSecrets,
  scanHostsForSecrets,
} from "../src/core/secret-scan.js";

describe("looksSecret", () => {
  it("flags a known secret shape (sk-…)", () => {
    expect(looksSecret("apiKey", "sk-ABCDEFghijkl0123456789")).toBe(true);
  });

  it("flags a long value in a secret-hinted field", () => {
    expect(looksSecret("authorization", "abcdef0123456789abcdef0123")).toBe(true);
  });

  it("does NOT flag a ${VAR} placeholder", () => {
    expect(looksSecret("apiKey", "${OPENAI_API_KEY}")).toBe(false);
  });

  it("does NOT flag a {env:VAR} (opencode) placeholder", () => {
    expect(looksSecret("apiKey", "{env:OPENAI_API_KEY}")).toBe(false);
  });

  it("does NOT flag a SCREAMING_SNAKE env-var name reference", () => {
    expect(looksSecret("apiKey", "OPENAI_API_KEY")).toBe(false);
  });

  it("does NOT flag env-var-NAME fields (codex bearer_token_env_var / env_vars)", () => {
    expect(looksSecret("bearer_token_env_var", "GITHUB_TOKEN")).toBe(false);
    expect(looksSecret("env_vars", "SOME_LONG_LOOKING_TOKEN_NAME")).toBe(false);
  });

  it("does NOT flag a short innocuous value", () => {
    expect(looksSecret("command", "node")).toBe(false);
  });
});

describe("isPlaceholder", () => {
  it("recognizes ${VAR} and {env:VAR}", () => {
    expect(isPlaceholder("${X}")).toBe(true);
    expect(isPlaceholder("{env:X}")).toBe(true);
    expect(isPlaceholder("literal")).toBe(false);
  });
});

describe("scanHostSecrets", () => {
  it("flags an inlined key in env and a value after a secret flag in args (redacted)", () => {
    const secret = "sk-ABCDEFghijkl0123456789";
    const argSecret = "abcdefLITERALtoken123";
    const warnings = scanHostSecrets("cursor", {
      good: { command: "node", env: { OPENAI_API_KEY: "${OPENAI_API_KEY}" } },
      leaky: { command: "node", env: { OPENAI_API_KEY: secret } },
      argsy: { command: "svc", args: ["--api-key", argSecret] },
    });
    expect(warnings.length).toBe(2);
    // location is reported…
    expect(warnings.join("\n")).toContain("cursor:leaky");
    expect(warnings.join("\n")).toContain("cursor:argsy");
    // …but the secret value itself is never printed.
    expect(warnings.join("\n")).not.toContain(secret);
    expect(warnings.join("\n")).not.toContain(argSecret);
  });

  it("returns nothing for an all-${VAR} host", () => {
    const warnings = scanHostSecrets("warp", {
      a: { command: "node", env: { TOKEN: "${TOKEN}" } },
      b: { type: "http", url: "https://x", headers: { Authorization: "Bearer ${TOK}" } },
    });
    expect(warnings).toEqual([]);
  });

  it("does not flag codex env-var-name fields", () => {
    const warnings = scanHostSecrets("codex", {
      remote: { url: "https://x", bearer_token_env_var: "GITHUB_TOKEN" },
      stdio: { command: "svc", env_vars: ["GITHUB_TOKEN"] },
    });
    expect(warnings).toEqual([]);
  });
});

// The regression this scanner exists for: the real-world leak was a context7
// --api-key literal in a codex table OUTSIDE the managed block — which the
// codex adapter's readRaw() (managed-block-only) can never see.
describe("scanCodexText (full-file, managed + out-of-block)", () => {
  const secret = "ctx7sk-0123456789abcdef";
  const toml = [
    "# >>> dotfiles-mcp",
    "[mcp_servers.memory]",
    'command = "npx"',
    'args = ["-y", "@modelcontextprotocol/server-memory"]',
    "# <<< dotfiles-mcp",
    "",
    "# legacy table outside the managed block:",
    "[mcp_servers.context7]",
    'command = "npx"',
    `args = ["-y", "@upstash/context7-mcp", "--api-key", "${secret}"]`,
    "",
    "[mcp_servers.remote]",
    'url = "https://x"',
    'bearer_token_env_var = "HUGGINGFACE_API_TOKEN"',
  ].join("\n");

  it("flags the out-of-block --api-key literal (redacted) and nothing else", () => {
    const warnings = scanCodexText(toml);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("codex:context7");
    expect(warnings[0]).toContain("after --api-key");
    expect(warnings[0]).not.toContain(secret); // never the value
  });

  it("flags an in-block scalar secret field, skips env-var-name fields", () => {
    const t =
      '# >>> dotfiles-mcp\n[mcp_servers.bad]\nbearer_token = "xoxb-0123456789abcdef"\n# <<< dotfiles-mcp\n';
    const w = scanCodexText(t);
    expect(w.length).toBe(1);
    expect(w[0]).toContain("codex:bad");
    expect(scanCodexText(toml.replace("--api-key", "--flag"))).toHaveLength(1); // ctx7sk shape still caught
  });

  it("does not flag ${VAR} placeholders in args", () => {
    expect(
      scanCodexText('[mcp_servers.ok]\nargs = ["--api-key", "${CONTEXT7_API_KEY}"]\n'),
    ).toEqual([]);
  });
});

describe("scanHostsForSecrets", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "mcpsync-scan-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const stubHost = (id: string, configPath: string, raw: Record<string, unknown>): HostAdapter =>
    ({ id, label: id, configPath, readRaw: () => raw }) as unknown as HostAdapter;

  it("routes codex through the full-file text scan (out-of-block covered)", () => {
    const p = join(dir, "config.toml");
    writeFileSync(p, '[mcp_servers.leaky]\nargs = ["--api-key", "sk-LITERALLITERAL123"]\n');
    // readRaw (managed-block-only) sees nothing — the file scan must still hit.
    const reports = scanHostsForSecrets([stubHost("codex", p, {})]);
    expect(reports).toHaveLength(1);
    expect(reports[0]?.warnings[0]).toContain("codex:leaky");
  });

  it("scans other hosts via readRaw and drops clean hosts from the report", () => {
    const reports = scanHostsForSecrets([
      stubHost("cursor", join(dir, "x.json"), {
        leaky: { command: "n", env: { K: "sk-LITERALLITERAL123" } },
      }),
      stubHost("warp", join(dir, "y.json"), { ok: { command: "n", env: { K: "${K}" } } }),
    ]);
    expect(reports.map((r) => r.host)).toEqual(["cursor"]);
  });
});

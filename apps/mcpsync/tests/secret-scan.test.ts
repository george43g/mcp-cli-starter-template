import { describe, expect, it } from "vitest";
import { isPlaceholder, looksSecret, scanHostSecrets } from "../src/core/secret-scan.js";

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

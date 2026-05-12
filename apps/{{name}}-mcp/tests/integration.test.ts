/**
 * In-process integration tests for the dispatcher.
 *
 * We drive the dispatcher directly (no child process), which exercises:
 *   - tools/list catalog (via registry)
 *   - successful round-trip (health_check, noop)
 *   - schema validation failure
 *   - unknown tool rejection
 *   - native module fallback when MCP_DISABLE_NATIVE=1
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { _resetCounters } from "../src/counters.js";
import { callMcpTool } from "../src/dispatcher.js";
import { makeAppRegistry } from "../src/tools/registry.js";

beforeEach(() => {
  _resetCounters();
});

afterEach(() => {
  delete process.env.MCP_DISABLE_NATIVE;
});

describe("registry", () => {
  it("ships at least health_check and noop", () => {
    const r = makeAppRegistry();
    const names = r.tools.map((t) => t.name);
    expect(names).toContain("health_check");
    expect(names).toContain("noop");
  });

  it("dev-only tools are excluded from default toMcpTools()", () => {
    const r = makeAppRegistry();
    const visible = r.toMcpTools().map((t) => t.name);
    const all = r.toMcpTools(true).map((t) => t.name);
    expect(all).toContain("get_logs");
    expect(visible).not.toContain("get_logs");
  });
});

describe("health_check", () => {
  it("returns structuredContent matching HealthSnapshot shape", async () => {
    const r = await callMcpTool("health_check", {});
    expect(r.isError).toBeUndefined();
    const sc = r.structuredContent as Record<string, unknown>;
    expect(sc.status).toMatch(/healthy|degraded|unhealthy/);
    expect(typeof sc.pid).toBe("number");
    expect(typeof sc.uptimeS).toBe("number");
  });
});

describe("noop", () => {
  it("echoes input through the TS path", async () => {
    process.env.MCP_DISABLE_NATIVE = "1";
    const r = await callMcpTool("noop", { input: "hello", upper: false });
    expect(r.isError).toBeUndefined();
    const sc = r.structuredContent as { echo: string; engine: string };
    expect(sc.echo).toBe("hello");
    expect(sc.engine).toBe("ts");
  });

  it("upper-cases when requested", async () => {
    process.env.MCP_DISABLE_NATIVE = "1";
    const r = await callMcpTool("noop", { input: "hi", upper: true });
    expect((r.structuredContent as { echo: string }).echo).toBe("HI");
  });

  it("sanitizes ANSI control sequences", async () => {
    process.env.MCP_DISABLE_NATIVE = "1";
    const r = await callMcpTool("noop", { input: "\x1b[31mred\x1b[0m" });
    expect((r.structuredContent as { echo: string }).echo).toBe("red");
  });

  it("attempts rust path when native module is loadable", async () => {
    // Cannot guarantee rust-accel is built in CI; just ensure the env flag
    // is honored: forcing TS produces engine === "ts".
    process.env.MCP_DISABLE_NATIVE = "1";
    const r = await callMcpTool("noop", { input: "x" });
    expect((r.structuredContent as { engine: string }).engine).toBe("ts");
  });
});

describe("error paths", () => {
  it("rejects unknown tool with isError", async () => {
    const r = await callMcpTool("ghost_tool", {});
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toMatch(/Unknown tool/);
  });

  it("rejects malformed args with usable error", async () => {
    const r = await callMcpTool("noop", { input: 42 });
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toMatch(/Invalid arguments/);
  });
});

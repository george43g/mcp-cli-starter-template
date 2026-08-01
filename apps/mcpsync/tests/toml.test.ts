import { describe, expect, it } from "vitest";
import {
  BLOCK_BEGIN,
  BLOCK_END,
  extractBlock,
  namesOutsideBlock,
  parseManagedTables,
  spliceBlock,
  stripBlock,
} from "../src/core/toml.js";

const sample = `[profile]
key = "v"

${BLOCK_BEGIN}
# GENERATED — do not hand-edit

[mcp_servers.memory]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-memory"]

[mcp_servers.firecrawl]
command = "npx"
args = ["-y", "firecrawl-mcp"]
env_vars = ["FIRECRAWL_API_KEY"]

[mcp_servers.github]
url = "https://api.githubcopilot.com/mcp/"
bearer_token_env_var = "GH_TOKEN"
${BLOCK_END}

[mcp_servers.context7]
url = "https://mcp.context7.com/mcp"
`;

describe("block extraction", () => {
  it("extracts the managed block with its markers", () => {
    const block = extractBlock(sample);
    expect(block.startsWith(BLOCK_BEGIN)).toBe(true);
    expect(block.endsWith(BLOCK_END)).toBe(true);
    expect(block).toContain("[mcp_servers.memory]");
    expect(block).not.toContain("context7");
  });

  it("returns empty string when there is no block", () => {
    expect(extractBlock("[a]\nb = 1\n")).toBe("");
  });

  it("stripBlock removes the managed region", () => {
    expect(stripBlock(sample)).not.toContain("[mcp_servers.memory]");
    expect(stripBlock(sample)).toContain("[mcp_servers.context7]");
  });

  it("namesOutsideBlock finds only out-of-block tables", () => {
    expect(namesOutsideBlock(sample)).toEqual(new Set(["context7"]));
  });
});

describe("parseManagedTables", () => {
  it("parses commands, args, env_vars, url and bearer_token_env_var", () => {
    const tables = parseManagedTables(sample);
    expect(tables.memory).toEqual({
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-memory"],
    });
    expect(tables.firecrawl).toEqual({
      command: "npx",
      args: ["-y", "firecrawl-mcp"],
      env_vars: ["FIRECRAWL_API_KEY"],
    });
    expect(tables.github).toEqual({
      url: "https://api.githubcopilot.com/mcp/",
      bearer_token_env_var: "GH_TOKEN",
    });
  });

  it("ignores out-of-block tables", () => {
    expect(parseManagedTables(sample).context7).toBeUndefined();
  });
});

describe("spliceBlock", () => {
  it("replaces an existing block, leaving surrounding content intact", () => {
    const next = spliceBlock(
      sample,
      `${BLOCK_BEGIN}\n[mcp_servers.only]\ncommand = "x"\n${BLOCK_END}\n`,
    );
    expect(next).toContain("[profile]");
    expect(next).toContain("[mcp_servers.context7]");
    expect(next).toContain("[mcp_servers.only]");
    expect(next).not.toContain("[mcp_servers.memory]");
  });

  it("appends when no block exists", () => {
    const next = spliceBlock("[a]\nb = 1\n", `${BLOCK_BEGIN}\n[mcp_servers.x]\n${BLOCK_END}\n`);
    expect(next).toContain("[a]");
    expect(next).toContain(BLOCK_BEGIN);
    expect(next.indexOf("[a]")).toBeLessThan(next.indexOf(BLOCK_BEGIN));
  });
});

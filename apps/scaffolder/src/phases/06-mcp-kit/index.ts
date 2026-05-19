import type { Phase } from "../../core/migration.js";
import M1McpKit from "./m1-mcp-kit.js";

export const phase: Phase = {
  order: 6,
  id: "06-mcp-kit",
  title: "Port packages/mcp-kit/ (registry, dispatcher, transports, guardrails)",
  migrations: [new M1McpKit()],
};

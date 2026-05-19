import type { Phase } from "../../core/migration.js";
import M1AgentFiles from "./m1-agent-files.js";

export const phase: Phase = {
  order: 11,
  id: "11-agent-files",
  title: "Port agent files (AGENTS.md + symlinks + .mcp.json + .cursor + skills)",
  migrations: [new M1AgentFiles()],
};

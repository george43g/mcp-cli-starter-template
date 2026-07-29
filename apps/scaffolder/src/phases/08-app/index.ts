import type { Phase } from "../../core/migration.js";
import M1AppPort from "./m1-app-port.js";
import M2CliArtifacts from "./m2-cli-artifacts.js";

export const phase: Phase = {
  order: 8,
  id: "08-app",
  title: "Port apps/example-repo-mcp/ (the user-facing tool — single bin, MCP/CLI/TUI)",
  migrations: [new M1AppPort(), new M2CliArtifacts()],
};

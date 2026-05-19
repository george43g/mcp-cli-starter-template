import type { Phase } from "../../core/migration.js";
import M1Mode from "./m1-mode.js";
import M2PkgManager from "./m2-pkg-manager.js";
import M3ToolName from "./m3-tool-name.js";
import M4Monorepo from "./m4-monorepo.js";

export const phase: Phase = {
  order: 1,
  id: "01-bootstrap",
  title: "Bootstrap — mode, package manager, name, monorepo skeleton",
  migrations: [new M1Mode(), new M2PkgManager(), new M3ToolName(), new M4Monorepo()],
};

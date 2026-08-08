import type { Phase } from "../../core/migration.js";
import M3CliKit from "./m3-cli-kit.js";
import M4TuiKit from "./m4-tui-kit.js";

// m1-env-loader and m2-secrets were removed when those packages were retired
// (DEFERRED #11 — superseded by the published @george43g/secret-store). m3/m4
// keep their numbers on purpose: the migration id is user-facing via
// `mcp-scaffold migrate <id>`, so renumbering would silently break saved
// commands and the generated CLI docs for no benefit.
export const phase: Phase = {
  order: 5,
  id: "05-utility-pkgs",
  title: "Utility packages (cli-kit, tui-kit)",
  migrations: [new M3CliKit(), new M4TuiKit()],
};

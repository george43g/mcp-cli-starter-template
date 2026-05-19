import type { Phase } from "../../core/migration.js";
import M1EnvLoader from "./m1-env-loader.js";
import M2Secrets from "./m2-secrets.js";
import M3CliKit from "./m3-cli-kit.js";
import M4TuiKit from "./m4-tui-kit.js";

export const phase: Phase = {
  order: 5,
  id: "05-utility-pkgs",
  title: "Utility packages (env-loader, secrets, cli-kit, tui-kit)",
  migrations: [new M1EnvLoader(), new M2Secrets(), new M3CliKit(), new M4TuiKit()],
};

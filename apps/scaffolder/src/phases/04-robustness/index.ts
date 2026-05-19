import type { Phase } from "../../core/migration.js";
import M1RobustnessPkg from "./m1-robustness-pkg.js";

export const phase: Phase = {
  order: 4,
  id: "04-robustness",
  title: "Port packages/robustness/ (logger, watchdog, shutdown, env, …)",
  migrations: [new M1RobustnessPkg()],
};

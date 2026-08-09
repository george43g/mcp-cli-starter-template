import type { Phase } from "../../core/migration.js";
import M1TsconfigPkg from "./m1-tsconfig-pkg.js";
import M2BiomePkg from "./m2-biome-pkg.js";
import M3VitestPkg from "./m3-vitest-pkg.js";
import M4TurboFull from "./m4-turbo-full.js";
import M5BuildConfigPkg from "./m5-build-config-pkg.js";

export const phase: Phase = {
  order: 3,
  id: "03-configs",
  title: "Shared configs — tsconfig, biome, vitest, turbo, build identity (full)",
  migrations: [
    new M1TsconfigPkg(),
    new M2BiomePkg(),
    new M3VitestPkg(),
    new M4TurboFull(),
    new M5BuildConfigPkg(),
  ],
};

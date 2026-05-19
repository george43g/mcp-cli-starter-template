import type { Phase } from "../../core/migration.js";
import M1Mise from "./m1-mise.js";
import M2NodeVersion from "./m2-node-version.js";
import M3GitInit from "./m3-git-init.js";
import M4Gitignore from "./m4-gitignore.js";
import M5Gitattributes from "./m5-gitattributes.js";

export const phase: Phase = {
  order: 2,
  id: "02-toolchain",
  title: "Toolchain — mise, node version, git, .gitignore, .gitattributes",
  migrations: [
    new M1Mise(),
    new M2NodeVersion(),
    new M3GitInit(),
    new M4Gitignore(),
    new M5Gitattributes(),
  ],
};

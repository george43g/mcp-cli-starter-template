import type { Phase } from "../../core/migration.js";
import M1CiRelease from "./m1-ci-release.js";

export const phase: Phase = {
  order: 12,
  id: "12-ci-release",
  title: "Port .github/workflows + .releaserc.json + .npmignore",
  migrations: [new M1CiRelease()],
};

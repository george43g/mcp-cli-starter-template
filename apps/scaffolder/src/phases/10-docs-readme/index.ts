import type { Phase } from "../../core/migration.js";
import M1DocsReadme from "./m1-docs-readme.js";

export const phase: Phase = {
  order: 10,
  id: "10-docs-readme",
  title: "Port docs/ + README + LICENSE + llms-install.md",
  migrations: [new M1DocsReadme()],
};

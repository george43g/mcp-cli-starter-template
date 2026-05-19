import type { Phase } from "../../core/migration.js";
import M1SharedTypes from "./m1-shared-types.js";

export const phase: Phase = {
  order: 7,
  id: "07-shared-types",
  title: "Port packages/shared-types/ (Zod schemas + Rust drift-check)",
  migrations: [new M1SharedTypes()],
};

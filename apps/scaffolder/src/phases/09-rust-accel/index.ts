import type { Phase } from "../../core/migration.js";
import M1RustAccel from "./m1-rust-accel.js";

export const phase: Phase = {
  order: 9,
  id: "09-rust-accel",
  title: "Port apps/rust-accel/ (optional napi-rs v3 crate)",
  migrations: [new M1RustAccel()],
};

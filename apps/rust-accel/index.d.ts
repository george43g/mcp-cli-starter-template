// Placeholder typings — replaced at build time by `napi build` with the
// generated declarations. Hand-mirrored here so TS callers compile even
// when the native binary hasn't been built.
//
// Keep these aligned with apps/rust-accel/src/types.rs and the Zod
// counterparts in @george43g/shared-types. CI's drift-check enforces it.

export interface NoopInput {
  input: string;
  upper: boolean;
}

export interface NoopOutput {
  echo: string;
  engine: string;
  durationMicros: number;
}

export declare function hello(name: string): string;
export declare function noopAccel(input: NoopInput): NoopOutput;

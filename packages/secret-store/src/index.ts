/**
 * Public entrypoint for @george43g/secret-store.
 *
 * Default chain: env → .env files → OS keychain → external command (opt-in).
 *
 * This package is a MECHANISM, not a policy. It reads the places a secret may
 * already have been put and offers a keychain CRUD surface for tools that
 * store their own — it never talks to a secret vault. Pulling secrets out of a
 * vault, keeping a cache warm, and exporting them into your shell is a secret
 * *manager's* job (mise/direnv/opkeep/systemd); this package is the thin,
 * portable read side that every tool would otherwise rewrite.
 *
 * Ordering is descending explicitness: an exported env var (deployment) beats a
 * project-local .env, which beats a machine-local keychain item, which beats
 * shelling out to an external manager.
 *
 * Usage:
 *   const secret = await resolveSecret({ toolPrefix: "up-bank", name: "token" });
 *   // → { value, source } | null
 *
 *   await saveSecret({ toolPrefix: "up-bank", name: "token" }, value); // setup flow
 */

import { envFileSource, envSource, type LoadEnvOptions } from "./env.js";
import { type ExecSourceConfig, execConfigFromEnv, execSource } from "./exec.js";
import { deleteKeychain, keychainSource, saveKeychain } from "./keychain.js";
import {
  MissingSecretError,
  type ResolvedSecret,
  type SecretRef,
  type SecretSource,
} from "./types.js";

export type { LoadEnvOptions, LoadedEnv } from "./env.js";
export { envFileSource, envSource, loadEnv, parseEnvFile } from "./env.js";
export type { ExecSourceConfig } from "./exec.js";
export { execConfigFromEnv, execSource } from "./exec.js";
export type { KeychainTarget } from "./keychain.js";
export {
  deleteKeychain,
  keychainAvailable,
  keychainSource,
  keychainTarget,
  readKeychain,
  saveKeychain,
} from "./keychain.js";
export type { ResolvedSecret, SecretRef, SecretSource, SecretSourceName } from "./types.js";
export { MissingSecretError, UnsupportedPlatformError, varName } from "./types.js";

export interface ResolveSecretOptions {
  /** Replace the whole chain. When set, every other option is ignored. */
  sources?: SecretSource[];
  /** Throw MissingSecretError when nothing resolves. Defaults to false (returns null). */
  required?: boolean;
  /** Options for the .env file layer (cwd, mode). */
  envFile?: LoadEnvOptions;
  /** Enable the external-command layer. Falls back to SECRET_STORE_EXEC_* when omitted. */
  exec?: ExecSourceConfig;
  /** Skip the keychain layer (e.g. to avoid it in tests). */
  skipKeychain?: boolean;
}

/**
 * Build the ordered source chain. The exec layer is appended only when
 * explicitly configured (argument or SECRET_STORE_EXEC_* env), so the default
 * chain never shells out to anything.
 */
export function buildSources(opts: ResolveSecretOptions = {}): SecretSource[] {
  if (opts.sources) return opts.sources;
  const sources: SecretSource[] = [envSource, envFileSource(opts.envFile ?? {})];
  if (!opts.skipKeychain) sources.push(keychainSource);
  const exec = opts.exec ?? execConfigFromEnv();
  if (exec) sources.push(execSource(exec));
  return sources;
}

/**
 * Resolve a secret through the chain, returning the value and which source
 * produced it. Returns null when nothing resolves, unless `required: true`.
 */
export async function resolveSecret(
  ref: SecretRef,
  opts: ResolveSecretOptions = {},
): Promise<ResolvedSecret | null> {
  for (const source of buildSources(opts)) {
    const value = await source.resolve(ref);
    if (value !== null) return { value, source: source.name };
  }
  if (opts.required) throw new MissingSecretError(ref);
  return null;
}

/**
 * Store a secret in the OS keychain — the setup/configure path. Throws on a
 * platform with no keychain backend rather than silently dropping the write.
 */
export async function saveSecret(
  ref: SecretRef,
  value: string,
  opts: { allowAnyApp?: boolean; comment?: string } = {},
): Promise<void> {
  saveKeychain(ref, value, opts);
}

/** Remove a secret from the OS keychain. Returns false if there was none. */
export async function deleteSecret(ref: SecretRef): Promise<boolean> {
  return deleteKeychain(ref);
}

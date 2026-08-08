/**
 * Public types for secret-store.
 *
 * A SecretSource resolves a SecretRef into a string, or null when it can't.
 * The library composes an ordered chain and returns the first hit.
 *
 * Deliberately vendor-neutral: there is NO source that talks to a secret
 * vault (1Password, Vault, AWS SM, …). Getting secrets *out of* a vault is a
 * secret-manager's job; this package only reads the places a manager (or the
 * user) has already put them — env, .env, the OS keychain — plus an optional
 * escape hatch to shell out to whatever manager the user actually runs.
 */

export interface SecretRef {
  /** Logical name — used as the env-var stem and keychain account. */
  name: string;
  /** Tool namespace, e.g. "up-bank". Namespaces env vars and the keychain service. */
  toolPrefix: string;
}

export type SecretSourceName = "env" | "env-file" | "keychain" | "exec";

export interface ResolvedSecret {
  value: string;
  source: SecretSourceName;
}

export interface SecretSource {
  name: SecretSourceName;
  resolve(ref: SecretRef): Promise<string | null>;
}

/**
 * Canonical env-var / keychain-account name for a ref:
 * `{TOOL_PREFIX}_{NAME}`, upper-snake (e.g. up-bank + token → UP_BANK_TOKEN).
 */
export function varName(ref: SecretRef): string {
  const prefix = ref.toolPrefix.toUpperCase().replace(/-/g, "_");
  const name = ref.name.toUpperCase().replace(/-/g, "_");
  return `${prefix}_${name}`;
}

export class MissingSecretError extends Error {
  constructor(public readonly ref: SecretRef) {
    const v = varName(ref);
    super(
      `Secret "${ref.name}" not found in any configured source. ` +
        `Set ${v} (or ${v}_JSON), add it to a .env file, ` +
        `or store it in the OS keychain (service "${ref.toolPrefix}", account ${v}).`,
    );
    this.name = "MissingSecretError";
  }
}

/** Thrown by write operations on a platform with no supported keychain. */
export class UnsupportedPlatformError extends Error {
  constructor(operation: string) {
    super(
      `secret-store: ${operation} is not supported on platform "${process.platform}" ` +
        "(the OS keychain backend is macOS-only). Reads degrade to null; writes throw.",
    );
    this.name = "UnsupportedPlatformError";
  }
}

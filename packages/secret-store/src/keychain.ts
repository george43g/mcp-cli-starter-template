/**
 * OS keychain backend — read AND write.
 *
 * Convention: service = `{toolPrefix}` (e.g. "up-bank"), account =
 * `{TOOL_PREFIX}_{NAME}` (e.g. "UP_BANK_TOKEN"). A tool that saves its own
 * secret during setup and a secret manager that provisions one for it land on
 * the SAME item, so either path is readable by the same code. Override the
 * target with `{VAR}_KEYCHAIN=service[/account]`.
 *
 * Platform: macOS only, via `/usr/bin/security` (absolute path — a stripped
 * PATH must not silently break resolution). Elsewhere, READS return null so
 * the chain falls through, while WRITES throw UnsupportedPlatformError: a
 * failed read has a fallback, a silently-dropped write is data loss.
 *
 * Adding Linux (libsecret) or Windows (DPAPI) means implementing this module's
 * three functions for that platform; nothing else in the package changes.
 */

import { execFileSync } from "node:child_process";
import { type SecretRef, type SecretSource, UnsupportedPlatformError, varName } from "./types.js";

const SECURITY_BIN = "/usr/bin/security";
const DEFAULT_TIMEOUT_MS = 5_000;

export interface KeychainTarget {
  service: string;
  account: string;
}

/** Is an OS keychain backend available on this platform? */
export function keychainAvailable(): boolean {
  return process.platform === "darwin";
}

/**
 * Resolve which keychain item a ref maps to, honoring a
 * `{VAR}_KEYCHAIN=service[/account]` override.
 */
export function keychainTarget(ref: SecretRef): KeychainTarget {
  const account = varName(ref);
  const override = process.env[`${account}_KEYCHAIN`];
  if (override && override.length > 0) {
    const slash = override.indexOf("/");
    if (slash === -1) return { service: override, account };
    return {
      service: override.slice(0, slash),
      account: override.slice(slash + 1) || account,
    };
  }
  return { service: ref.toolPrefix, account };
}

/** Read a secret from the keychain. Returns null on any failure. */
export function readKeychain(ref: SecretRef): string | null {
  if (!keychainAvailable()) return null;
  const { service, account } = keychainTarget(ref);
  try {
    const out = execFileSync(
      SECURITY_BIN,
      ["find-generic-password", "-s", service, "-a", account, "-w"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: DEFAULT_TIMEOUT_MS },
    );
    const trimmed = out.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    // Item absent, keychain locked, security unavailable — fall through.
    return null;
  }
}

/**
 * Create or update the keychain item for a ref. This is the "tool stores its
 * own secret during setup" path.
 *
 * `-U` updates in place if the item exists. `-A` (allow any application) is
 * OPT-IN via `allowAnyApp`: it removes the per-binary ACL prompt, which is
 * what makes a secret readable by a GUI/launchd-spawned process without a
 * dialog — convenient, but a real widening of access. Default is false.
 *
 * The value is passed as an argv element, so it is visible in the process
 * table for the lifetime of the call. That is the documented tradeoff of the
 * `security` CLI; use a shorter-lived secret if this matters to you.
 */
export function saveKeychain(
  ref: SecretRef,
  value: string,
  opts: { allowAnyApp?: boolean; comment?: string } = {},
): void {
  if (!keychainAvailable()) throw new UnsupportedPlatformError("saveSecret");
  if (value.length === 0) throw new Error("secret-store: refusing to store an empty value");
  const { service, account } = keychainTarget(ref);
  const args = ["add-generic-password", "-U", "-s", service, "-a", account, "-w", value];
  if (opts.allowAnyApp) args.push("-A");
  if (opts.comment) args.push("-j", opts.comment);
  try {
    execFileSync(SECURITY_BIN, args, {
      stdio: ["ignore", "ignore", "pipe"],
      timeout: DEFAULT_TIMEOUT_MS,
    });
  } catch (err) {
    throw new Error(
      `secret-store: failed to write keychain item (service "${service}", account "${account}"): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

/** Delete the keychain item for a ref. Returns false if there was nothing to delete. */
export function deleteKeychain(ref: SecretRef): boolean {
  if (!keychainAvailable()) throw new UnsupportedPlatformError("deleteSecret");
  const { service, account } = keychainTarget(ref);
  try {
    execFileSync(SECURITY_BIN, ["delete-generic-password", "-s", service, "-a", account], {
      stdio: ["ignore", "ignore", "ignore"],
      timeout: DEFAULT_TIMEOUT_MS,
    });
    return true;
  } catch {
    return false;
  }
}

/** Source: the OS keychain. Third in the default chain. */
export const keychainSource: SecretSource = {
  name: "keychain",
  async resolve(ref: SecretRef): Promise<string | null> {
    return readKeychain(ref);
  },
};

# @george43g/secret-store

Vendor-neutral secret **mechanism** for local tools.

```
env  →  .env files  →  OS keychain  →  external command (opt-in)
```

It reads the places a secret may already have been put, and gives tools a
keychain read/write surface so each one doesn't reinvent it.

## What it deliberately does NOT do

**It never talks to a secret vault** — no 1Password, Vault, AWS Secrets
Manager. Pulling secrets out of a vault, keeping a cache warm, and exporting
them into your environment is a secret *manager's* job (mise, direnv, a
systemd unit, your own CLI). A tool should do what you'd expect a tool to do:
read its config from the environment, from a `.env` file, or from the OS
keychain if it knowingly put it there.

That boundary is the whole point. It keeps this package portable, keeps vault
credentials out of every tool's dependency tree, and means one manager change
doesn't ripple through N tools.

If you *do* run a manager, the opt-in `exec` layer lets a tool ask it directly
— without this package knowing which one you use.

## Install

```sh
pnpm add @george43g/secret-store
```

## Resolve

```ts
import { resolveSecret } from "@george43g/secret-store";

const secret = await resolveSecret({ toolPrefix: "up-bank", name: "token" });
// → { value: "...", source: "env" | "env-file" | "keychain" | "exec" } | null
```

`{ toolPrefix: "up-bank", name: "token" }` maps to the canonical name
`UP_BANK_TOKEN`, which is used as the env var, the `.env` key, and the keychain
account. Pass `{ required: true }` to throw `MissingSecretError` instead of
returning `null`.

| Layer | Looks at | Notes |
|---|---|---|
| `env` | `UP_BANK_TOKEN`, `UP_BANK_TOKEN_JSON` | Most explicit, so it wins |
| `env-file` | `.env` → `.env.local` → `.env.[mode]` → `.env.[mode].local` | Vite precedence; never overrides real env |
| `keychain` | service `up-bank`, account `UP_BANK_TOKEN` | macOS only; `null` elsewhere |
| `exec` | your manager's stdout | Opt-in; see below |

Values are returned **raw**. `_JSON` is accepted as an alias for convenience,
but parsing (and deciding which field is the token) is the caller's policy.

## Store (setup flows)

```ts
import { saveSecret, deleteSecret } from "@george43g/secret-store";

await saveSecret({ toolPrefix: "up-bank", name: "token" }, value);
await deleteSecret({ toolPrefix: "up-bank", name: "token" });
```

Reads degrade silently (there's a fallback); **writes throw** on a platform
with no keychain backend, because a silently-dropped write is data loss.

`saveSecret` passes `-U` (update in place). `-A` (allow any application to read
without a prompt) is **opt-in** via `{ allowAnyApp: true }` — it's what lets a
GUI- or launchd-spawned process read without a dialog, but it is a real
widening of access. Note the value is passed as an argv element and is
therefore visible in the process table for the duration of the call; that's
inherent to the `security` CLI.

Override the item with `UP_BANK_TOKEN_KEYCHAIN=service[/account]`.

## The `exec` layer

Point it at whatever manager you run. This package names none.

```sh
SECRET_STORE_EXEC_BIN=/absolute/path/to/your-manager
SECRET_STORE_EXEC_ARGS="get {VAR} --cached-only"
```

…or programmatically:

```ts
await resolveSecret(ref, { exec: { bin: "/abs/mgr", args: ["get", "{VAR}"] } });
```

`{VAR}` is replaced with the canonical name. **Not in the chain unless
configured.**

Two rules for whatever you point it at, both learned the hard way:

1. **It must be non-interactive and fail closed.** A manager that falls back to
   an interactive or biometric unlock will hang, then get killed by the
   timeout — a GUI/launchd-spawned process has no TTY to prompt on. Prefer an
   explicit cache-only flag.
2. **Use an absolute path.** A GUI-launched process doesn't inherit your
   shell's `PATH`, so a bare command name works in your terminal and silently
   fails everywhere else.

## Portability

The keychain backend is macOS (`/usr/bin/security`, absolute path so a
stripped `PATH` can't break it). Elsewhere, keychain **reads** return `null`
and the chain falls through; `env` and `env-file` work everywhere. Adding
Linux (libsecret) or Windows (DPAPI) means implementing `keychain.ts` for that
platform — nothing else changes.

## Also exported

`loadEnv()` / `parseEnvFile()` — the Vite-style `.env` precedence loader, for
reading env *before* spawning a subprocess with introspection of what loaded.

## License

MIT

/**
 * Library surface — import mcpsync's core into other tools ("an MCP configures
 * itself"): read the canonical manifest, then `applyServer` to any host.
 */

export { backup } from "./core/backup.js";
export {
  CANONICAL_DEFAULT,
  type CanonicalWriteResult,
  normalize,
  readCanonical,
  readRawJson,
  toCanonicalEntry,
  writeCanonical,
} from "./core/canonical.js";
export {
  DEPLOY_ITEMS,
  type DeployItem,
  defaultExtRoot,
  type ExtManifest,
  executeDeploy,
  findManifest,
  type InstalledExtension,
  installedExtensions,
  isArchive,
  matchTarget,
  planDeploy,
  type ResolvedSource,
  resolveSource,
} from "./core/deploy.js";
export {
  diffHost,
  type HostDiff,
  type HostDiffEntry,
  type ServerStatus,
  STATUS_GLYPH,
  statusOf,
} from "./core/diff.js";
export {
  buildClaudeAdd,
  buildClaudeRemove,
  type CliAdapterConfig,
  cliAdapter,
} from "./core/hosts/cli-adapter.js";
export { codexAdapter, toCodexTable } from "./core/hosts/codex-adapter.js";
export {
  applyServer,
  detectedHosts,
  HOSTS,
  hostList,
  PROJECT_HOST_IDS,
  projectHosts,
} from "./core/hosts/index.js";
export {
  type JsonAdapterConfig,
  jsonMcpServersAdapter,
  loginShell,
  toClaudeDesktopServer,
  toDirectNative,
} from "./core/hosts/json-adapter.js";
export { opencodeAdapter, toOpencode } from "./core/hosts/opencode-adapter.js";
export type { HostAdapter, HostCapabilities, WriteResult } from "./core/hosts/types.js";
export {
  type CanonicalConfig,
  CanonicalConfigSchema,
  type McpServer,
  type McpServerEntry,
  McpServerEntrySchema,
  McpServerSchema,
  type Scope,
  type Transport,
} from "./core/schema.js";
export {
  type HostSecretReport,
  isPlaceholder,
  looksSecret,
  scanHostSecrets,
  scanHostsForSecrets,
} from "./core/secret-scan.js";
export {
  CREDENTIALS_DEFAULT,
  type Credentials,
  type RefSource,
  readCredentials,
  referencedVars,
  removeCredential,
  resolveRef,
  setCredential,
  writeCredentials,
} from "./core/secrets.js";
export {
  BLOCK_BEGIN,
  BLOCK_END,
  extractBlock,
  namesOutsideBlock,
  parseManagedTables,
  type RawCodexTable,
  spliceBlock,
} from "./core/toml.js";

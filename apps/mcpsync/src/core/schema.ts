/**
 * The Locked Contract (see docs/plans/2026-08-mcpsync-overview.md).
 *
 * Canonical store: ~/.mcp.json → { "mcpServers": { <name>: entry } }, ${VAR}-only.
 * An `entry` is a server WITHOUT its name (the name is the map key); a `McpServer`
 * is an entry plus its name, used everywhere in the code once loaded.
 */

import { z } from "zod";

export const TransportSchema = z.enum(["stdio", "http", "sse"]);
export type Transport = z.infer<typeof TransportSchema>;

export const ScopeSchema = z.enum(["user", "project"]);
export type Scope = z.infer<typeof ScopeSchema>;

/** A canonical server entry as stored under `mcpServers[name]` (no name field). */
export const McpServerEntrySchema = z.object({
  transport: TransportSchema.default("stdio"),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  url: z.string().optional(),
  headers: z.record(z.string()).optional(),
  cwd: z.string().optional(),
  enabled: z.boolean().default(true),
  scope: ScopeSchema.default("user"),
});
export type McpServerEntry = z.infer<typeof McpServerEntrySchema>;

/** A named server: an entry plus the map key it was stored under. */
export const McpServerSchema = McpServerEntrySchema.extend({
  name: z.string(),
});
export type McpServer = z.infer<typeof McpServerSchema>;

/** The whole canonical document. */
export const CanonicalConfigSchema = z.object({
  mcpServers: z.record(McpServerEntrySchema).default({}),
});
export type CanonicalConfig = z.infer<typeof CanonicalConfigSchema>;

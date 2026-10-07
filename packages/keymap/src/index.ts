/**
 * `@george43g/keymap` — one vim-style keymap for every tool.
 *
 * Zero runtime dependencies and no `node:*` imports: this barrel is also the
 * entry of the browser IIFE (`GeorgeKeymap`). The `keymap-legend` bin lives
 * outside it for that reason.
 */

export {
  type FromInkOptions,
  fromInk,
  fromKeyboardEvent,
  type InkKeyLike,
  type KeyboardEventLike,
  type OwnsStep,
  ownsFromKeymap,
} from "./adapters.js";
export {
  type Binding,
  DEFAULT_GROUP,
  type DefineKeymapOptions,
  type Diagnostic,
  type DiagnosticKind,
  defineKeymap,
  type Keymap,
  KeymapError,
  type ResolvedBinding,
} from "./keymap.js";
export {
  type CheatsheetOptions,
  formatCheatsheet,
  formatKeysRows,
  type KeyHint,
  type KeysRowsOptions,
  type Legend,
  type LegendEntry,
  type LegendOptions,
  toHints,
  toLegend,
} from "./legend.js";
export { createMatcher, type Matcher, type MatcherOptions, type MatchResult } from "./matcher.js";
export {
  canonicalKeys,
  type DisplayStyle,
  formatKeys,
  isCharKey,
  type KeyInput,
  KeySpecError,
  type KeyStep,
  NAMED_KEYS,
  type NamedKey,
  normalizeInput,
  parseKeys,
  parseStep,
  stepId,
} from "./notation.js";
export { presets, vimNavigation, vimScrollOnly } from "./presets.js";

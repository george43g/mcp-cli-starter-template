/**
 * Lightweight description of a commander option, contributed by a migration
 * via `commanderOptions()`. We keep our own type so migrations don't depend
 * on commander directly — `program.ts` materializes these into real options.
 */

export interface CommanderOption {
  /** Long flag including dashes, e.g. "--package-manager". */
  long: string;
  /** Short flag, optional. e.g. "-p". */
  short?: string;
  /** Help text shown in --help. */
  help: string;
  /** Argument spec, e.g. "<pm>" or "[name]". Omit for boolean flags. */
  argSpec?: string;
  /** Default value if not provided. */
  defaultValue?: string | number | boolean;
  /** Whitelist of allowed values (commander's `.choices(...)`). */
  choices?: readonly string[];
}

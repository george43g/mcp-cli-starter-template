/**
 * 08-app/m2-cli-artifacts — apply the usage(1) artifacts pipeline to an
 * existing CLI without porting the MCP app.
 *
 * Ships into --cli-dir: a .usage.kdl skeleton, a scoped mise.toml (pinned
 * usage(1) + generation tasks + byte-freshness check task), and the
 * scripts/check-usage-freshness.mjs + scripts/install-completions.sh pair.
 *
 * Language-agnostic by design: usage(1) generates completions, the manpage,
 * and markdown docs from the spec regardless of what implements the CLI —
 * a bash/zsh tool needs no JS wrapper. The freshness check runs on Node,
 * which mise provides.
 *
 * Fresh scaffolds get this pipeline from m1-app-port, so this migration is
 * existing-mode only. It keeps the default starter-existing policy: it never
 * runs in the generic-existing safe sweep — naming it
 * (`mcp-scaffold migrate 08-app/m2-cli-artifacts --cli-bin <name>`) is the
 * conscious opt-in.
 */

import {
  appliedStatus,
  Migration,
  type MigrationContext,
  type MigrationResult,
  type RetrofitIntent,
} from "../../core/migration.js";
import { nameUpperOf, substitute } from "../../core/templating.js";
import { TEMPLATES } from "../../generated/templates.js";

// Minimal-but-valid spec: `mise run artifacts` works immediately after the
// migration; the TODO marks where the real command tree goes.
const USAGE_KDL_SKELETON = `// usage spec — drives completions (bash/zsh/fish) + manpage + markdown docs.
// Generate: \`mise run artifacts\` (or \`usage g completion <shell> -f .usage.kdl\`).
// Docs: https://usage.jdx.dev/spec

name "example-repo"
bin "example-repo"
about "example-repo command-line tool"

// TODO: replace with the real command tree (flags, args, subcommands),
// then regenerate: mise run artifacts && mise run check:usage
cmd "help" help="Show usage"
`;

const MISE_TOML = `# CLI artifacts pipeline for example-repo — applied by mcp-scaffold.
#
# Generates shell completions, the manpage, and CLI markdown docs from
# .usage.kdl. Keep .usage.kdl in sync with the real CLI; the checked-in
# artifacts under completions/ + man/ + docs/cli/ are byte-checked by
# \`mise run check:usage\`.
#
# Docs: https://mise.jdx.dev · https://usage.jdx.dev

[tools]
# Pinned: usage(1) emits slightly different completion shells between
# minor versions; a floating "latest" makes check:usage drift gates flap.
usage = "3.3.0"

[tasks.docs]
description = "Generate markdown docs for each subcommand"
run = """
  set -eu  # mise runs tasks via /bin/sh — dash on Ubuntu rejects \`pipefail\`; this task doesn't pipe
  mkdir -p docs/cli
  usage g markdown -f .usage.kdl -m --out-dir docs/cli/
"""

[tasks."completions:bash"]
description = "Generate bash completion script"
run = "mkdir -p completions && usage g completion bash example-repo -f .usage.kdl > completions/example-repo.bash"

[tasks."completions:zsh"]
description = "Generate zsh completion script"
run = "mkdir -p completions && usage g completion zsh example-repo -f .usage.kdl > completions/_example-repo"

[tasks."completions:fish"]
description = "Generate fish completion script"
run = "mkdir -p completions && usage g completion fish example-repo -f .usage.kdl > completions/example-repo.fish"

[tasks.completions]
description = "Generate completions for bash, zsh, and fish"
depends = ["completions:bash", "completions:zsh", "completions:fish"]
run = "echo 'completions generated in completions/ — run ./scripts/install-completions.sh to install for your shell'"

[tasks.manpage]
description = "Generate man page"
run = "mkdir -p man && usage g manpage -f .usage.kdl -o man/example-repo.1"

[tasks.artifacts]
description = "Regenerate every usage(1) artifact (docs + completions + manpage)"
depends = ["docs", "completions", "manpage"]
run = "echo 'all artifacts regenerated'"

[tasks."check:usage"]
description = "Byte-check completions/ + man/ + docs/cli/ against .usage.kdl"
run = "node scripts/check-usage-freshness.mjs"
`;

function requireTemplate(key: string): string {
  const template = TEMPLATES[key];
  if (template === undefined) {
    throw new Error(`Missing template "${key}" — run pnpm build:templates`);
  }
  return template;
}

export default class CliArtifactsMigration extends Migration {
  readonly id = "08-app/m2-cli-artifacts";
  readonly title = "Apply the standalone usage(1) CLI artifacts pipeline (spec + tasks + checks)";
  readonly appliesTo = "existing" as const;

  // Explicit-only: sweeping `apply` runs (safe OR full, starter OR generic)
  // must not prompt for a bin name / target dir the user never chose. The
  // retrofitIntent below leaves the breadcrumb instead.
  override async shouldRun(ctx: MigrationContext): Promise<boolean> {
    return ctx.explicitMigration;
  }

  async apply(ctx: MigrationContext): Promise<MigrationResult> {
    const bin = await ctx.config.cliArtifacts.bin.get();
    if (!bin || !/^[a-z][a-z0-9-]*$/.test(bin)) {
      throw new Error(`Invalid --cli-bin "${String(bin)}" — must be kebab-case`);
    }
    const rawDir = await ctx.config.cliArtifacts.dir.get();
    const dir = (rawDir ?? ".").replace(/\/+$/, "") || ".";
    const at = (rel: string) => (dir === "." ? rel : `${dir}/${rel}`);

    const vars = {
      name: bin,
      nameUpper: nameUpperOf(bin),
      scope: ctx.config.global.scope.peek() ?? "",
    };
    const render = (template: string) => substitute(template, vars);

    const files: Array<[string, string]> = [
      [at(".usage.kdl"), render(USAGE_KDL_SKELETON)],
      [at("mise.toml"), render(MISE_TOML)],
      [
        at("scripts/check-usage-freshness.mjs"),
        render(requireTemplate("08-app/lib/scripts/check-usage-freshness.mjs")),
      ],
      [
        at("scripts/install-completions.sh"),
        render(requireTemplate("08-app/lib/scripts/install-completions.sh")),
      ],
    ];

    const filesChanged: string[] = [];
    const filesDivergent: string[] = [];
    for (const [rel, content] of files) {
      const outcome = await ctx.fs.writeIfChanged(rel, content);
      if (outcome === "divergent-skipped") filesDivergent.push(rel);
      else if (outcome !== "unchanged") filesChanged.push(rel);
    }

    const notes = [`usage(1) pipeline for bin "${bin}" under ${dir}/`];
    if (filesDivergent.length > 0) {
      notes.push(
        "Divergent files preserved — merge the pinned usage tool + tasks by hand or re-run with --force.",
      );
    }
    return {
      status: appliedStatus(ctx.dryRun),
      notes,
      filesChanged,
      filesDivergent,
      followUps: [
        `Describe ${bin}'s real command tree in ${at(".usage.kdl")} (spec docs: https://usage.jdx.dev/spec).`,
        `cd ${dir} && mise install && mise run artifacts — generates completions/, man/, docs/cli/.`,
        `mise run check:usage must pass, then commit .usage.kdl + generated artifacts together.`,
      ],
    };
  }

  override retrofitIntent(ctx: MigrationContext): RetrofitIntent | undefined {
    const bin = ctx.config.cliArtifacts.bin.peek() ?? ctx.target.repoName;
    return {
      summary:
        "Add the usage(1) CLI artifacts pipeline (completions + manpage + docs + drift check).",
      rationale:
        "Opt-in migration: it writes a .usage.kdl spec, a scoped mise.toml with a pinned usage(1), and freshness-check scripts. Run it by name so the bin name and directory are deliberate.",
      manualSteps: [
        `Run: mcp-scaffold migrate 08-app/m2-cli-artifacts --target . --cli-bin ${bin} --cli-dir <dir> --execute`,
        "Fill .usage.kdl with the real command tree (https://usage.jdx.dev/spec).",
        "cd <dir> && mise install && mise run artifacts && mise run check:usage.",
        "Commit the spec and generated completions/, man/, docs/cli/ together.",
      ],
      prompt:
        `Add shell completions, a manpage, and CLI markdown docs to this repo's "${bin}" command using ` +
        `jdx/usage (https://usage.jdx.dev). Write a .usage.kdl describing the real command surface, pin ` +
        `usage = "3.3.0" in a scoped mise.toml with docs/completions/manpage/artifacts/check:usage tasks, ` +
        `and add a byte-freshness check script so stale artifacts fail CI. The tool's implementation ` +
        `language does not matter — usage(1) generates from the spec alone.`,
    };
  }
}

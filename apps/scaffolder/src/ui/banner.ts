import kleur from "kleur";

/**
 * Banner — short ascii header shown at the start of an interactive run.
 * No surprises, no animation; just a tiny visual cue.
 */
export function drawBanner(): void {
  const lines = [
    "",
    kleur.cyan("  mcp-scaffold"),
    kleur.dim("  programmable starter / migrator for MCP+CLI+TUI repos"),
    "",
  ];
  process.stdout.write(`${lines.join("\n")}\n`);
}

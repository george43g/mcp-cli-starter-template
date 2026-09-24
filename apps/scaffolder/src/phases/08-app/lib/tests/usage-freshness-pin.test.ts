/**
 * scripts/check-usage-freshness.mjs must regenerate with the usage(1) version
 * pinned in mise.toml, never with whatever `usage` is first on PATH.
 *
 * usage output differs between versions, so running an unpinned one reported
 * every artifact as drifted on a machine with a global `usage@latest` — ten
 * false drifts on a pristine scaffold. These tests stand fake `usage` and
 * `mise` binaries on a PATH that holds nothing else of theirs: each fake
 * usage stamps its own version into what it generates, so running the wrong
 * one is visible as drift, exactly as the real failure was.
 *
 * POSIX only: the fakes are shell scripts, and the check itself drives bash.
 */

import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPT = join(import.meta.dirname, "..", "scripts", "check-usage-freshness.mjs");
const PIN = "3.3.0";

/** A fake usage(1) whose every output names its version. */
function fakeUsage(version: string): string {
  return `#!/bin/sh
if [ "$1" = "--version" ]; then echo "usage-cli ${version}"; exit 0; fi
case "$2" in
  completion) echo "completion $3 $4 ${version}" ;;
  manpage) while [ $# -gt 0 ]; do [ "$1" = "-o" ] && echo "man ${version}" > "$2"; shift; done ;;
  markdown) while [ $# -gt 0 ]; do [ "$1" = "--out-dir" ] && echo "md ${version}" > "$2/index.md"; shift; done ;;
esac
`;
}

function writeExecutable(path: string, body: string): void {
  writeFileSync(path, body);
  chmodSync(path, 0o755);
}

let root: string;
let app: string;
let bin: string;

/** The committed baseline, as the pinned version would write it. */
function writeBaseline(version: string): void {
  mkdirSync(join(app, "completions"), { recursive: true });
  mkdirSync(join(app, "man"), { recursive: true });
  mkdirSync(join(app, "docs", "cli"), { recursive: true });
  writeFileSync(join(app, "completions", "demo.bash"), `completion bash demo ${version}\n`);
  writeFileSync(join(app, "completions", "_demo"), `completion zsh demo ${version}\n`);
  writeFileSync(join(app, "completions", "demo.fish"), `completion fish demo ${version}\n`);
  writeFileSync(join(app, "man", "demo.1"), `man ${version}\n`);
  writeFileSync(join(app, "docs", "cli", "index.md"), `md ${version}\n`);
}

function check() {
  const result = spawnSync(process.execPath, [join(app, "scripts", "check-usage-freshness.mjs")], {
    encoding: "utf8",
    // Only the fakes, plus the system dirs that hold bash and mkdir.
    env: { PATH: [bin, "/usr/bin", "/bin"].join(":"), HOME: root },
    timeout: 30_000,
  });
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
}

describe.skipIf(process.platform === "win32")("check-usage-freshness pins usage(1)", () => {
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "usage-pin-test-"));
    app = join(root, "apps", "demo");
    bin = join(root, "bin");
    mkdirSync(join(app, "scripts"), { recursive: true });
    mkdirSync(bin);
    copyFileSync(SCRIPT, join(app, "scripts", "check-usage-freshness.mjs"));
    writeFileSync(join(app, ".usage.kdl"), 'bin "demo"\n');
    writeFileSync(join(app, "mise.toml"), `[tools]\n# pinned\nusage = "${PIN}"\n`);
    writeBaseline(PIN);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("refuses a PATH usage of another version instead of reporting false drift", () => {
    writeExecutable(join(bin, "usage"), fakeUsage("6.8.0"));
    const { status, out } = check();
    expect(out).not.toContain("drifted");
    expect(out).toContain(`pinned: ${PIN}`);
    expect(out).toContain("usage on PATH is 6.8.0");
    expect(status).toBe(2);
  });

  it("uses mise's pinned usage even when PATH has another version first", () => {
    const pinned = join(root, "mise-installs", "usage");
    mkdirSync(join(root, "mise-installs"));
    writeExecutable(pinned, fakeUsage(PIN));
    writeExecutable(join(bin, "usage"), fakeUsage("6.8.0"));
    writeExecutable(
      join(bin, "mise"),
      `#!/bin/sh
case "$1" in
  --version|install) exit 0 ;;
  which) [ "$4" = "usage@${PIN}" ] && echo "${pinned}" && exit 0; exit 1 ;;
esac
exit 1
`,
    );
    const { status, out } = check();
    expect(out).toContain("artifacts are fresh");
    expect(status).toBe(0);
  });

  it("falls back to PATH usage when mise cannot provide the pin, if PATH matches", () => {
    writeExecutable(join(bin, "usage"), fakeUsage(PIN));
    writeExecutable(join(bin, "mise"), '#!/bin/sh\n[ "$1" = --version ] && exit 0\nexit 1\n');
    const { status, out } = check();
    expect(out).toContain("artifacts are fresh");
    expect(status).toBe(0);
  });

  it("still reports real drift when the pinned version runs", () => {
    writeExecutable(join(bin, "usage"), fakeUsage(PIN));
    writeFileSync(join(app, "completions", "_demo"), "hand-edited\n");
    const { status, out } = check();
    expect(out).toContain("zsh completion");
    expect(out).toContain("drifted");
    expect(status).toBe(1);
  });

  it("reads the nearest pin above the app, and accepts a prefix pin", () => {
    rmSync(join(app, "mise.toml"));
    writeFileSync(join(root, "mise.toml"), '[env]\nusage = "not-a-tool"\n[tools]\nusage = "3.3"\n');
    writeExecutable(join(bin, "usage"), fakeUsage(PIN));
    expect(check().status).toBe(0);

    writeExecutable(join(bin, "usage"), fakeUsage("3.30.0"));
    const { status, out } = check();
    expect(out).toContain("pinned: 3.3 ");
    expect(status).toBe(2);
  });

  it("names the missing binary when neither mise nor usage is on PATH", () => {
    const { status, out } = check();
    expect(out).toContain("no usage on PATH");
    expect(out).toContain("mise:   not on PATH");
    expect(status).toBe(2);
  });
});

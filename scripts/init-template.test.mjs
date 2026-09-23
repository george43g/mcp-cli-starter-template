import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Runs the REAL clone-and-rename script in a throwaway git repo shaped like
 * this template (it resolves REPO_ROOT from its own location and self-deletes,
 * so it must be copied in). The rule under test: the app name is taken
 * VERBATIM, the same rule the scaffolder follows — `example-repo-mcp` is one
 * placeholder for the app's whole name, not `example-repo` plus a literal
 * suffix. Before, `--name foo` produced apps/foo-mcp and `--name foo-mcp`
 * produced apps/foo-mcp-mcp.
 */

const SCRIPT = fileURLToPath(new URL("./init-template.mjs", import.meta.url));

const sandboxes = [];
after(() => {
  for (const dir of sandboxes) rmSync(dir, { recursive: true, force: true });
});

function rename(name) {
  const root = mkdtempSync(join(tmpdir(), "init-template-"));
  sandboxes.push(root);
  mkdirSync(join(root, "scripts"));
  copyFileSync(SCRIPT, join(root, "scripts", "init-template.mjs"));
  mkdirSync(join(root, "apps", "example-repo-mcp"), { recursive: true });
  writeFileSync(
    join(root, "apps", "example-repo-mcp", "package.json"),
    JSON.stringify({
      name: "@george43g/example-repo-mcp",
      bin: { "example-repo": "./dist/cli.js" },
    }),
  );
  writeFileSync(
    join(root, ".mcp.json"),
    JSON.stringify({
      mcpServers: { "example-repo-mcp-dev": { args: ["apps/example-repo-mcp/src"] } },
    }),
  );
  const git = (...a) => execFileSync("git", a, { cwd: root, stdio: "ignore" });
  git("init", "-q");
  git("add", "-A");
  const r = spawnSync("node", [join(root, "scripts", "init-template.mjs"), "--name", name], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return root;
}

describe("init-template", () => {
  for (const name of ["foo", "foo-mcp"]) {
    it(`--name ${name} lands verbatim: apps/${name}, package and bin ${name}`, () => {
      const root = rename(name);
      assert.equal(existsSync(join(root, "apps", "example-repo-mcp")), false);
      assert.equal(existsSync(join(root, "apps", `${name}-mcp`)), false);
      const pkg = JSON.parse(readFileSync(join(root, "apps", name, "package.json"), "utf8"));
      assert.equal(pkg.name, `@george43g/${name}`);
      assert.deepEqual(Object.keys(pkg.bin), [name]);
      const mcp = JSON.parse(readFileSync(join(root, ".mcp.json"), "utf8"));
      assert.deepEqual(mcp.mcpServers[`${name}-dev`].args, [`apps/${name}/src`]);
    });
  }
});

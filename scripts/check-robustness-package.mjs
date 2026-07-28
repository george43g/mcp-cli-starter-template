#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const packageDir = join(root, "packages", "robustness");
const temp = await mkdtemp(join(tmpdir(), "robustness-consumer-"));

try {
  run("pnpm", ["--filter", "@george43g/robustness", "build"], root);
  run("pnpm", ["pack", "--pack-destination", temp], packageDir);
  const tarball = (await readdir(temp)).find((entry) => entry.endsWith(".tgz"));
  if (!tarball) throw new Error("pnpm pack did not create a tarball");

  await writeFile(
    join(temp, "package.json"),
    `${JSON.stringify(
      {
        name: "robustness-consumer-smoke",
        private: true,
        type: "module",
        dependencies: {
          "@george43g/robustness": `file:${join(temp, tarball)}`,
        },
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(temp, "smoke.mjs"),
    `import {
  createShutdownController,
  createWatchdog,
  isMonotonicallyGrowing,
} from "@george43g/robustness";

const shutdown = createShutdownController({ exit: () => {} });
const watchdog = createWatchdog({
  envPrefix: "PACKAGE_SMOKE",
  idleRestart: false,
  shutdownController: shutdown,
});
watchdog.install();
watchdog.noteActivity();
if (watchdog.readState().lastActivityTs <= 0) throw new Error("watchdog state unavailable");
if (!isMonotonicallyGrowing([100, 110, 120, 125])) throw new Error("growth helper failed");
watchdog.dispose();
shutdown.dispose();
`,
  );

  run("pnpm", ["install", "--no-frozen-lockfile", "--ignore-workspace"], temp);
  run(process.execPath, ["smoke.mjs"], temp);
  process.stdout.write("robustness package consumer smoke passed\n");
} finally {
  await rm(temp, { recursive: true, force: true });
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: "inherit",
    env: { ...process.env, CI: "1" },
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit ${result.status ?? 1}`);
  }
}

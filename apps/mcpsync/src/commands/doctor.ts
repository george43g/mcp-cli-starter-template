import { homedir } from "node:os";
import { printAuto } from "@george43g/cli-kit";
import { hostList } from "../core/hosts/index.js";

export interface DoctorOpts {
  json?: boolean | undefined;
}

/** Show which MCP hosts are present on this machine and where they live. */
export function runDoctor(opts: DoctorOpts = {}): void {
  const home = homedir();
  const rows = hostList().map((h) => ({
    host: h.id,
    label: h.label,
    mechanism: h.capabilities.mechanism,
    detected: h.detect(),
    config: h.configPath.replace(home, "~"),
    restart: h.restart,
  }));
  printAuto(
    rows,
    {
      head: ["Host", "Mechanism", "Detected", "Config"],
      rows: (r) => [r.label, r.mechanism, r.detected ? "yes" : "no", r.config],
    },
    { json: opts.json ?? false },
  );
}

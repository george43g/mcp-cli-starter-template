/**
 * mcpsync TUI — an interactive servers×hosts drift grid.
 *
 *   rows = servers (canonical ∪ host-only)   cols = detected hosts
 *   each cell = drift status glyph (see core/diff.ts for the legend)
 *
 * Navigation: j/k rows · h/l host columns · gg/G top/bottom · ^d/^u half-page.
 * Actions: `a` apply the current server to the focused host, `A` to all hosts
 * (both gated by a y/n confirm — the same confirm the CLI's `apply` requires);
 * `r` re-reads from disk; `q`/Esc quits. Applies route through the same
 * `applyServer` merge path as the CLI, so there is one write path, not two.
 */

import { HelpBar, type Palette, StatusBar, useTheme, useVimKeys } from "@george43g/tui-kit";
import { Box, Text, useApp, useInput } from "ink";
import { useCallback, useState } from "react";
import { applyServer } from "../core/hosts/index.js";
import { useHostMatrix } from "./hooks/useHostMatrix.js";
import { type CellTone, cellText, clampIndex, statusTone } from "./model.js";

const WINDOW = 18;

/** Map a semantic cell tone onto the active palette. */
function toneColor(tone: CellTone, p: Palette): string {
  switch (tone) {
    case "ok":
      return p.success;
    case "warn":
      return p.warning;
    case "danger":
      return p.danger;
    case "faint":
      return p.fgDim;
    default:
      return p.fgMuted; // muted (off | skip)
  }
}

interface Pending {
  kind: "host" | "all";
  server: string;
  hostId: string;
  label: string;
}

export function App({ config }: { config?: string | undefined }) {
  const theme = useTheme();
  const p = theme.palette;
  const { exit } = useApp();
  const { matrix, canonical, reload } = useHostMatrix(config);
  const { servers, hosts } = matrix;

  const [row, setRow] = useState(0);
  const [col, setCol] = useState(0);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const browsing = pending === null;

  const server = servers[clampIndex(row, servers.length)];
  const host = hosts[clampIndex(col, hosts.length)];

  useVimKeys({
    enabled: browsing,
    onMove: (delta) => setRow((r) => clampIndex(r + delta, servers.length)),
    onTop: () => setRow(0),
    onBottom: () => setRow(servers.length - 1),
    onHalfPageDown: () => setRow((r) => clampIndex(r + 9, servers.length)),
    onHalfPageUp: () => setRow((r) => clampIndex(r - 9, servers.length)),
  });

  const commit = useCallback(
    (req: Pending) => {
      try {
        const target = canonical[req.server];
        if (!target) throw new Error(`${req.server} is not in the canonical manifest`);
        const results = applyServer(req.kind === "all" ? "all" : req.hostId, target);
        const changed = Object.values(results).filter((r) => r.changed).length;
        // A hazard-skipped host (e.g. Claude Desktop running) wrote nothing —
        // surface it rather than reporting a false success.
        const hazard = Object.values(results).find((r) => r.hazard && !r.changed)?.hazard;
        setMessage(
          hazard
            ? `⚠ ${req.server}: skipped — ${hazard}`
            : `applied ${req.server} → ${req.label} (${changed} changed)`,
        );
        reload();
      } catch (err) {
        setMessage(`✗ ${(err as Error).message}`);
      }
    },
    [canonical, reload],
  );

  useInput((input, key) => {
    if (!browsing) {
      if (input === "y" || input === "Y") {
        commit(pending);
        setPending(null);
      } else if (input === "n" || input === "N" || key.escape) {
        setMessage("cancelled");
        setPending(null);
      }
      return;
    }

    if (input === "q" || key.escape) {
      exit();
      return;
    }
    if (input === "h") setCol((c) => clampIndex(c - 1, hosts.length));
    if (input === "l") setCol((c) => clampIndex(c + 1, hosts.length));
    if (input === "r") {
      reload();
      setMessage("reloaded");
    }
    if ((input === "a" || input === "A") && server && host) {
      if (!canonical[server]) {
        setMessage(`✗ ${server} is host-only — import it before applying`);
        return;
      }
      const all = input === "A";
      setPending({
        kind: all ? "all" : "host",
        server,
        hostId: host.id,
        label: all ? "all hosts" : host.id,
      });
    }
  });

  // Empty states -----------------------------------------------------------
  if (!hosts.length) {
    return (
      <Box flexDirection="column" height="100%" paddingX={1}>
        <Header p={p} />
        <Box flexGrow={1}>
          <Text color={p.warning}>No MCP hosts detected on this machine.</Text>
        </Box>
        <HelpBar hints={[{ key: "q", label: "quit" }]} />
      </Box>
    );
  }
  if (!servers.length) {
    return (
      <Box flexDirection="column" height="100%" paddingX={1}>
        <Header p={p} />
        <Box flexGrow={1}>
          <Text color={p.fgDim}>No servers in the canonical manifest or on any detected host.</Text>
        </Box>
        <HelpBar hints={[{ key: "q", label: "quit" }]} />
      </Box>
    );
  }

  // Layout dims ------------------------------------------------------------
  // +1 on each width leaves room for the paddingLeft={1} gutter so headers/names
  // aren't clipped a column short.
  const nameWidth = Math.min(30, 1 + Math.max(6, "server".length, ...servers.map((s) => s.length)));
  const hostWidth = (id: string) => 1 + Math.max(5, id.length);

  const start = Math.max(
    0,
    Math.min(row - Math.floor(WINDOW / 2), Math.max(0, servers.length - WINDOW)),
  );
  const end = Math.min(servers.length, start + WINDOW);
  const visible = servers.slice(start, end);

  return (
    <Box flexDirection="column" height="100%">
      <Box paddingX={1}>
        <Header p={p} />
      </Box>

      {/* Header row: server column + one column per host */}
      <Box paddingX={1}>
        <Box width={nameWidth} paddingLeft={1}>
          <Text color={p.fgDim} bold>
            server
          </Text>
        </Box>
        {hosts.map((h, i) => (
          <Box key={h.id} width={hostWidth(h.id)} paddingLeft={1}>
            <Text color={i === col ? p.accent : p.fgDim} bold wrap="truncate">
              {h.id}
            </Text>
          </Box>
        ))}
      </Box>

      {/* Grid body */}
      <Box flexDirection="column" flexGrow={1} paddingX={1}>
        {visible.map((s, vi) => {
          const idx = start + vi;
          const isRow = idx === row;
          return (
            <Box key={s}>
              <Box
                width={nameWidth}
                paddingLeft={1}
                backgroundColor={isRow ? p.bgRaised : undefined}
              >
                <Text color={isRow ? p.accent : p.fg} bold={isRow} wrap="truncate">
                  {s}
                </Text>
              </Box>
              {hosts.map((h, ci) => {
                const status = matrix.statusAt(s, h.id);
                const isCell = isRow && ci === col;
                const bg = isCell ? p.accent : isRow ? p.bgRaised : undefined;
                const fg = isCell ? p.bg : status ? toneColor(statusTone(status), p) : p.fgDim;
                return (
                  <Box key={h.id} width={hostWidth(h.id)} paddingLeft={1} backgroundColor={bg}>
                    <Text color={fg} wrap="truncate" {...(bg ? { backgroundColor: bg } : {})}>
                      {cellText(status)}
                    </Text>
                  </Box>
                );
              })}
            </Box>
          );
        })}
      </Box>

      {message ? (
        <Box paddingX={2}>
          <Text color={message.startsWith("✗") ? p.danger : p.fgMuted}>{message}</Text>
        </Box>
      ) : null}

      {pending ? (
        <StatusBar
          mode="confirm"
          message={`Apply ${pending.server} → ${pending.label}?`}
          hint="y apply · n cancel"
        />
      ) : (
        <StatusBar
          mode="browse"
          message={`${server ?? "—"} @ ${host?.id ?? "—"}  (${row + 1}/${servers.length})`}
          hint={host?.id ? `host: ${hostLabel(host.id, hosts)}` : ""}
        />
      )}

      <HelpBar
        hints={[
          { key: "j/k", label: "server" },
          { key: "h/l", label: "host" },
          { key: "a/A", label: "apply host/all" },
          { key: "r", label: "reload" },
          { key: "q", label: "quit" },
        ]}
      />
    </Box>
  );
}

function Header({ p }: { p: Palette }) {
  return (
    <Box>
      <Text color={p.accent} bold>
        mcpsync
      </Text>
      <Text color={p.fgDim}> servers × hosts</Text>
    </Box>
  );
}

function hostLabel(id: string, hosts: { id: string; label: string }[]): string {
  return hosts.find((h) => h.id === id)?.label ?? id;
}

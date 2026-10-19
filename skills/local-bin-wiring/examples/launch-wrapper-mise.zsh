#!/bin/zsh -f
# Same wrapper when the caller has no node on PATH (GUI, launchd, cron).
# MISE_BIN overrides the default mise location. cwd is already the app dir,
# so mise reads that directory's mise.toml.
# cli-convention: exempt — this file is an example, not a PATH entry.
export TOOL_CALLER_CWD=$PWD
cd -- "${0:A:h:h}" || exit 70
mise_bin=${MISE_BIN:-$HOME/.local/bin/mise}
exec "$mise_bin" exec -- node --import tsx ./main.ts "$@"

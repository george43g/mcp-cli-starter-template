#!/bin/zsh -f
# Example launch wrapper. Copy to apps/<name>/bin/<tool>.
# The repo bin/<tool> entry is a relative symlink to that copy.
# cli-convention: exempt — this file is an example, not a PATH entry.
export TOOL_CALLER_CWD=$PWD
cd -- "${0:A:h:h}" || exit 70
exec node --import tsx ./main.ts "$@"

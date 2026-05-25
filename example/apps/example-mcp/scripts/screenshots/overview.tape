# VHS tape — `example` overview demo.
#
# Generates docs/screenshots/overview.png showing the three bins in action.
# Regenerate with `pnpm screenshots`. Update only when the user-facing CLI
# surface changes (subcommand list, help text, etc.).

Set FontSize 14
Set Width 1200
Set Height 800

Output ../../../../docs/screenshots/overview.png

Type "example-cli health"
Enter
Sleep 1s

Type "example-cli noop --input 'Hello from the starter template'"
Enter
Sleep 1s

Type "example-cli --help"
Enter
Sleep 2s

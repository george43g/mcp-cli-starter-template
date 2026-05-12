# VHS tape — `{{name}}` overview demo.
#
# Generates docs/screenshots/overview.png showing the three bins in action.
# Regenerate with `pnpm screenshots`. Update only when the user-facing CLI
# surface changes (subcommand list, help text, etc.).

Set FontSize 14
Set Width 1200
Set Height 800

Output ../../../../docs/screenshots/overview.png

Type "{{name}}-cli health"
Enter
Sleep 1s

Type "{{name}}-cli noop --input 'Hello from the starter template'"
Enter
Sleep 1s

Type "{{name}}-cli --help"
Enter
Sleep 2s

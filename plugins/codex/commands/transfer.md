---
description: Transfer the current host session into a resumable Codex thread
argument-hint: "[--source <session-jsonl>]"
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

When GitHub Copilot CLI supplies `Base directory for this skill`, copy that absolute path and
replace only its final `/commands` component with `/scripts`. Do not remove any other path component.
Append `/codex-companion.mjs` and substitute that absolute script path in every command below. Never
run a command with unresolved `CLAUDE_PLUGIN_ROOT`, `COPILOT_PLUGIN_ROOT`, or `PLUGIN_ROOT` variables.

Run exactly one shell command:

`node "<absolute-script-path>" transfer "$ARGUMENTS"`

Replace `<absolute-script-path>` with the mechanically resolved path.

Claude Code preloads the command output here:

!`node "${CLAUDE_PLUGIN_ROOT:-${COPILOT_PLUGIN_ROOT:-${PLUGIN_ROOT}}}/scripts/codex-companion.mjs" transfer "$ARGUMENTS"`

Present the command output to the user exactly as returned. Preserve the Codex session ID and the `codex resume <session-id>` command.

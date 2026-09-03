---
description: Cancel an active background Codex job in this repository
argument-hint: '[job-id]'
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

When GitHub Copilot CLI supplies `Base directory for this skill`, copy that absolute path and
replace only its final `/commands` component with `/scripts`. Do not remove any other path component.
Append `/codex-companion.mjs` and substitute that absolute script path in every command below. Never
run a command with unresolved `CLAUDE_PLUGIN_ROOT`, `COPILOT_PLUGIN_ROOT`, or `PLUGIN_ROOT` variables.

!`node "${CLAUDE_PLUGIN_ROOT:-${COPILOT_PLUGIN_ROOT:-${PLUGIN_ROOT}}}/scripts/codex-companion.mjs" cancel "$ARGUMENTS"`

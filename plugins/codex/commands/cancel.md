---
description: Cancel an active background Codex job in this repository
argument-hint: '[job-id]'
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

When GitHub Copilot CLI supplies `Base directory for this skill`, resolve its absolute parent as
the plugin root and substitute that path directly in every command below. Never run a command with
unresolved `CLAUDE_PLUGIN_ROOT`, `COPILOT_PLUGIN_ROOT`, or `PLUGIN_ROOT` variables.

!`node "${CLAUDE_PLUGIN_ROOT:-${COPILOT_PLUGIN_ROOT:-${PLUGIN_ROOT}}}/scripts/codex-companion.mjs" cancel "$ARGUMENTS"`

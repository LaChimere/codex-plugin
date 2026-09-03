---
description: Show the stored final output for a finished Codex job in this repository
argument-hint: '[job-id]'
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

When GitHub Copilot CLI supplies `Base directory for this skill`, copy that absolute path and
replace only its final `/commands` component with `/scripts`. Do not remove any other path component.
Append `/codex-companion.mjs` and substitute that absolute script path in every command below. Never
run a command with unresolved `CLAUDE_PLUGIN_ROOT`, `COPILOT_PLUGIN_ROOT`, or `PLUGIN_ROOT` variables.

!`node "${CLAUDE_PLUGIN_ROOT:-${COPILOT_PLUGIN_ROOT:-${PLUGIN_ROOT}}}/scripts/codex-companion.mjs" result "$ARGUMENTS"`

Present the full command output to the user. Do not summarize or condense it. Preserve all details including:
- Job ID and status
- The complete result payload, including verdict, summary, findings, details, artifacts, and next steps
- File paths and line numbers exactly as reported
- Any error messages or parse errors
- Follow-up commands such as `/codex:status <id>` and `/codex:review`

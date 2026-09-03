---
description: Delegate investigation, an explicit fix request, or follow-up rescue work to Codex
argument-hint: "[--background|--wait] [--resume|--fresh] [--model <model|spark>] [--effort <none|minimal|low|medium|high|xhigh>] [what Codex should investigate, solve, or continue]"
allowed-tools: Bash(node:*), AskUserQuestion
---

When GitHub Copilot CLI supplies `Base directory for this skill`, copy that absolute path and
replace only its final `/commands` component with `/scripts`. Do not remove any other path component.
Append `/codex-companion.mjs` and substitute that absolute script path in every command below. Never
run a command with unresolved `CLAUDE_PLUGIN_ROOT`, `COPILOT_PLUGIN_ROOT`, or `PLUGIN_ROOT` variables.

Run the request directly through the shared Codex companion task runtime. Do not invoke this command as a skill again and do not substitute host-side implementation work for a failed Codex run. The final user-visible response must be the companion output verbatim.

Raw user request:
$ARGUMENTS

Execution mode:

- If the request includes `--background`, preserve it so the companion starts its detached worker.
- If the request includes `--wait`, preserve it; the companion treats it as an explicit foreground choice.
- If neither flag is present, default to foreground.
- `--background` and `--wait` are execution flags. Forward them to the companion, but do not treat them as part of the natural-language task text.
- `--model` and `--effort` are runtime-selection flags. Preserve them for the forwarded `task` call, but do not treat them as part of the natural-language task text.
- If the request includes `--resume`, do not ask whether to continue. The user already chose.
- If the request includes `--fresh`, do not ask whether to continue. The user already chose.
- Otherwise, before starting Codex, check for a resumable rescue thread from this host session by running:

```bash
node "${CLAUDE_PLUGIN_ROOT:-${COPILOT_PLUGIN_ROOT:-${PLUGIN_ROOT}}}/scripts/codex-companion.mjs" task-resume-candidate --json
```

- If that helper reports `available: true`, use `AskUserQuestion` exactly once to ask whether to continue the current Codex thread or start a new one.
- The two choices must be:
  - `Continue current Codex thread`
  - `Start a new Codex thread`
- If the user is clearly giving a follow-up instruction such as "continue", "keep going", "resume", "apply the top fix", or "dig deeper", put `Continue current Codex thread (Recommended)` first.
- Otherwise put `Start a new Codex thread (Recommended)` first.
- If the user chooses continue, add `--resume` to the companion arguments.
- If the user chooses a new thread, add `--fresh` to the companion arguments.
- If the helper reports `available: false`, do not ask.

Operating rules:

- Use one shell call to invoke `node "${CLAUDE_PLUGIN_ROOT:-${COPILOT_PLUGIN_ROOT:-${PLUGIN_ROOT}}}/scripts/codex-companion.mjs" task ...` with the resolved arguments.
- Return the Codex companion stdout verbatim to the user.
- Do not paraphrase, summarize, rewrite, or add commentary before or after it.
- Do not inspect files, monitor progress, poll `/codex:status`, fetch `/codex:result`, call `/codex:cancel`, or do follow-up work in the host after the companion runs.
- Leave `--effort` unset unless the user explicitly asks for a specific reasoning effort.
- Leave the model unset unless the user explicitly asks for one. If they ask for `spark`, map it to `gpt-5.3-codex-spark`.
- Add `--write` unless the user explicitly asks for read-only work or only requests review, diagnosis, or research without edits.
- Leave `--resume` and `--fresh` in the companion arguments; the runtime handles that routing.
- If the helper reports that Codex is missing or unauthenticated, stop and tell the user to run `/codex:setup`.
- If the user did not supply a request, ask what Codex should investigate or fix.

# Changelog

## Unreleased

- Add GitHub Copilot CLI support while preserving the existing Claude Code plugin structure.
- Support Copilot session transfer from `~/.copilot/session-state/<session-id>/events.jsonl` through Codex's native external-agent importer.
- Normalize Claude Code and Copilot CLI session, hook, and plugin-data fields in the shared runtime.
- Keep long Copilot transfers usable by omitting tool payloads and combining adjacent assistant chunks.

## 1.0.0

- Initial version of the Codex plugin for Claude Code

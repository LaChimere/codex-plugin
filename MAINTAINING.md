# Maintaining this fork

This repository is an independently maintained fork of
[`openai/codex-plugin-cc`](https://github.com/openai/codex-plugin-cc). It keeps the upstream Claude
Code integration and adds GitHub Copilot CLI support through the same shared runtime.

## Configure the upstream remote

Add the upstream repository once:

```bash
git remote add upstream https://github.com/openai/codex-plugin-cc.git
git remote -v
```

Keep `origin` pointed at `LaChimere/codex-plugin` and `upstream` pointed at the OpenAI repository.

## Merge upstream changes

Fetch and merge the latest upstream `main` branch:

```bash
git fetch upstream
git switch main
git merge upstream/main
```

Resolve conflicts without discarding either the upstream Claude Code behavior or the fork's
Copilot support. The main fork-specific seams are:

- `plugins/codex/scripts/lib/host.mjs` for host session and plugin-data fields
- `plugins/codex/scripts/lib/copilot-session-transfer.mjs` for Copilot session conversion
- the shared command paths under `plugins/codex/commands/`

Keep the plugin name `codex` and the `/codex:*` command namespace stable. The fork uses the unique
Claude marketplace name `lachimere-codex`; do not restore the upstream marketplace name during a
merge.

## Validate a merge

Run the complete local checks after resolving upstream changes:

```bash
npm test
npm run build
node scripts/bump-version.mjs --check
claude plugin validate ./plugins/codex
copilot --plugin-dir ./plugins/codex plugin list
```

For changes to session transfer, also run a sanitized end-to-end check that imports a Copilot
session into Codex, repeats the transfer before resuming, and confirms that `codex resume` can use
the transferred context.

## Prepare a release

Update `plugins/codex/CHANGELOG.md`, then synchronize all version fields with:

```bash
npm run bump-version -- <version>
npm run check-version
```

Commit version and changelog changes together only after the validation commands pass.

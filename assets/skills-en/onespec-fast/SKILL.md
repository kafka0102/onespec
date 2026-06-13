---
name: onespec-fast
description: Use when the user explicitly asks for the OneSpec fast path, onespec-fast, fast apply, or automatic proposal/implementation/archive for a low-complexity change. This skill creates the OpenSpec proposal without waiting for user confirmation; after the mandatory complexity check, only low-complexity changes continue through native OpenSpec apply and direct archive.
---

# OneSpec Fast

Use this as the end-to-end fast path for low-complexity OneSpec changes. The goal is to skip the normal proposal approval gate and post-implementation archive choice, but only after the task artifact proves the change is low complexity.

Announce at the start:

> I am using the `onespec-fast` fast path.

## 1. Intake

Recover state first:

```bash
ONESPEC_ENV="${ONESPEC_ENV:-$(find . "$HOME"/.codex "$HOME"/.claude "$HOME"/.cursor "$HOME"/.gemini "$HOME"/.copilot "$HOME"/.agents "$HOME"/.config -path '*/onespec/scripts/onespec-env.sh' -type f -print -quit 2>/dev/null)}"
. "$ONESPEC_ENV"
"$ONESPEC_BASH" "$ONESPEC_STATE" list
```

If a relevant change exists, run:

```bash
"$ONESPEC_BASH" "$ONESPEC_STATE" recover <change-id>
```

Treat `recover` output as the execution contract. Read at least `phase`, `next_skill`, `next_gate`, and `allowed_actions`.

Use rules:

- Use only when the user explicitly asks for `onespec-fast`, the fast path, fast apply, or low-complexity automatic execution.
- Do not ask the user to name the change. Generate a short kebab-case `change-id`; append a numeric suffix if needed.
- Read the minimum needed context: `openspec/config.yaml`, `openspec/project.md`, relevant `openspec/specs/**`, project entry docs, current branch, and workspace state.
- Pause only when required OpenSpec context is too incomplete to produce a valid proposal, or project docs explicitly forbid automatic edits on the current branch.

## 2. Direct Proposal

The fast path skips the normal `onespec-design` pre-proposal user confirmation.

Create the OpenSpec proposal artifacts directly:

- `openspec/changes/<change-id>/proposal.md`
- `openspec/changes/<change-id>/design.md`, only when it has real technical value
- `openspec/changes/<change-id>/tasks.md`
- required `specs/**/spec.md`

Create state and handoff:

```bash
"$ONESPEC_BASH" "$ONESPEC_STATE" init <change-id>
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> phase proposal-ready
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> ambiguity low
"$ONESPEC_BASH" "$ONESPEC_HANDOFF" <change-id> proposal --write
```

Do not show the normal proposal approval menu. `onespec-fast` means: if complexity is low, the user has authorized continuing into implementation and archive.

## 3. Mandatory Complexity Check

After proposal creation, read the task artifact and run the complexity check. Never skip this because the path is fast.

Complexity inputs:

- `openspec/changes/<change-id>/tasks.md`
- `proposal.md`
- `design.md`, if present
- relevant `openspec/specs/**`
- if the current schema is not `spec-driven`, read task artifacts or equivalent apply context from `openspec status --change "<change-id>" --json` or `openspec instructions apply --change "<change-id>" --json`

Complexity levels:

- `low complexity`: few tasks, linear path, single module or few files, almost no cross-layer dependency, and no migration / schema / multi-surface coordination / manual rollout ordering.
- `medium complexity`: limited cross-module or cross-surface coordination with clear boundaries; staged verification or stricter review may be needed.
- `high complexity`: crosses multiple workspaces or capabilities, combines API/database/jobs/shared packages/visual confirmation dimensions, or has strong task coupling.

Always report:

- change id and artifact locations
- task artifact summary
- complexity level with concrete reasons
- whether the automatic path will continue

## 4. Low-Complexity Automatic Apply and Archive

Only continue automatically when complexity is `low complexity`. Do not ask the user to confirm the proposal artifacts again.

Record the low-complexity fast path:

```bash
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> complexity low
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> implementation_path openspec-apply
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> execution_method native
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> workspace current-branch
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> origin_branch "$(git branch --show-current || echo detached)"
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> origin_workspace_path "$(pwd -P)"
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> origin_workspace_mode current-branch
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> phase approved
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> phase implementing
```

Implementation rules:

- Use native `OpenSpec apply`; do not create a Superpowers plan and do not dispatch subagents.
- Implement only incomplete tasks in `tasks.md`; do not expand proposal scope.
- Work in the current workspace; do not auto-create a worktree, auto-push, or auto-merge.
- If the current branch is `main`/`master`, record `origin_workspace_mode` as `main-override`, but pause only if project docs explicitly forbid direct edits on the main branch.
- Track directly modified repo-relative paths in `.onespec.yaml`; prefer:

```bash
"$ONESPEC_BASH" "$ONESPEC_COMMIT" track <change-id> <path>...
```

After implementation:

- Check off completed tasks in `tasks.md`.
- If implementation exposes a new design conflict, stop the automatic path, fix OpenSpec artifacts, and return to the normal `onespec-design` / `onespec-execute` gates.
- Run project tests.
- Run `openspec validate <change-id> --strict`.
- Write the review handoff, but do not pause for user review:

```bash
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> phase review
"$ONESPEC_BASH" "$ONESPEC_HANDOFF" <change-id> review --write
```

Then archive directly without showing the `onespec-archive` closeout menu:

```bash
"$ONESPEC_BASH" "$ONESPEC_COMMIT" related-dirty <change-id>
"$ONESPEC_BASH" "$ONESPEC_COMMIT" commit-related <change-id> closeout
"$ONESPEC_BASH" "$ONESPEC_CLOSEOUT" run-actions <change-id> archive-only
```

If `related-dirty` is empty, do not run `commit-related <change-id> closeout`. `run-actions` sets `phase archived` / `archive archived` and handles the post-archive commit plus runtime cleanup.

## 5. Medium/High Complexity Fallback

If complexity is not `low complexity`:

- Do not implement automatically.
- Do not archive automatically.
- Record the actual complexity:

```bash
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> complexity <medium|high>
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> phase proposal-ready
```

- State that the fast path has stopped and return to the normal OneSpec gate.
- Use the `onespec-design` Proposal Approval Gate and path-selection menu so the user explicitly approves the proposal / design / spec before implementation.

## 6. Stop Conditions

Pause if:

- required OpenSpec context is missing and a valid proposal cannot be written
- the request clearly spans multiple changes that should be split
- complexity is medium or high
- tests or `openspec validate <change-id> --strict` fail and cannot be fixed inside the approved scope
- implementation reveals scope expansion, design change, or spec semantic change
- project docs explicitly forbid automatic implementation or automatic archive on the current branch

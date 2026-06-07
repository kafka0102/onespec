---
name: onespec-archive
description: Use when the user needs final review, feedback handling, merge/preserve decisions, PR/MR creation, or OpenSpec archive for a OneSpec change.
---

# OneSpec Archive

Handles the review, closeout, and archive phase for OneSpec. The goal is to process branch/worktree cleanup and OpenSpec archive only after explicit user confirmation.

Announce at the start:

> I am using `onespec-archive` for the review / closeout phase.

## 1. Review Entry

Recover state first:

```bash
ONESPEC_ENV="${ONESPEC_ENV:-$(find . "$HOME"/.codex "$HOME"/.agents "$HOME"/.config -path '*/onespec/scripts/onespec-env.sh' -type f -print -quit 2>/dev/null)}"
. "$ONESPEC_ENV"
"$ONESPEC_BASH" "$ONESPEC_STATE" list
```

Read the minimum necessary context:

- `openspec/changes/<change-id>/proposal.md`
- `openspec/changes/<change-id>/tasks.md`
- `openspec/changes/<change-id>/design.md`, if present
- relevant `openspec/specs/**`
- latest test results and `openspec validate <change-id> --strict` result
- current branch, worktree, and workspace status

If state has not reached `review`, explain what is still missing: implementation, verification, `tasks.md` sync, or proposal approval.

## 2. User Review

Let the user review the implementation. If they raise issues, continue editing and re-verify.

If the user confirms the result, still require an explicit closeout confirmation such as `continue`, `yes`, or `approve closeout` before touching branch/worktree state or archive.

Supported closeout paths:

- local merge: switch to target branch, merge, test, then delete feature branch and worktree
- PR/MR: push branch and create or prompt for PR/MR, keep the worktree
- preserve: do not merge and do not delete; state may still move to `done`

Do not auto-merge a worktree back to `main`, and do not auto-delete the worktree. Merge, PR, and deletion are consequential actions and require an explicit user choice.

## 3. Archive Rules

- If code is merged into the target branch and the user chooses archive, run OpenSpec archive and set state to `archived`.
- If the user does not archive, or implementation is still only in a PR/MR or preserved branch, set state to `done` and explain that archive can be run later.

```bash
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> phase done
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> archive <skipped|archived>
```

Before archiving, confirm:

- `tasks.md` is checked off to match reality
- project tests passed, or any failures are explicitly called out
- `openspec validate <change-id> --strict` passed
- the user explicitly chose merge, PR/MR, preserve, or archive strategy
- no user-review feedback remains unresolved

## 4. Report

The closeout report must cover:

- user review result
- selected closeout path: local merge, PR/MR, preserve, or archive
- final branch/worktree state
- status of `tasks.md`, tests, and OpenSpec validate
- archive field: `skipped` or `archived`

## 5. Stop Conditions

Pause and explain if:

- the user has not finished final review
- the user has not explicitly chosen a closeout path
- the user has not explicitly approved merge, worktree deletion, or OpenSpec archive
- code is not merged into the target branch but the user asks to archive
- tests or `openspec validate <change-id> --strict` are failing and the user has not explicitly accepted the risk

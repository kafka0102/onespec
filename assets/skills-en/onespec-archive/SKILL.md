---
name: onespec-archive
description: Use when the user needs final review, feedback handling, merge/preserve decisions, worktree handling, or OpenSpec archive for a OneSpec change.
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
- `origin_branch`, `origin_workspace_path`, and `origin_workspace_mode`

If state has not reached `review`, explain what is still missing: implementation, verification, `tasks.md` sync, or proposal approval.

Entry validation: if phase is already `review` but `.onespec.yaml` does not show `handoff_purpose: review` or does not have a `handoff_hash`, treat that as an incomplete execute gate. Tell the user the review handoff state was not written back and send them to re-run the execute report instead of silently continuing.

## 2. User Review

Let the user review the implementation. If they raise issues, continue editing and re-verify.

After implementation is done, do not require another explicit review-confirmation step and do not show a generic "continue review / preserve branch" menu. Only ask whether archive-related cleanup should happen. If the user replies with any non-numbered content, treat that as a request to keep modifying the implementation and return directly to code work.

Do not make the user guess what to type next. When entering `onespec-archive`, provide a numbered menu. If multiple actions can be combined, allow comma-separated digits such as `1,3`.

Before offering closeout choices, explicitly tell the user:

- the current branch name
- the current workspace path
- the recorded `origin_branch` and `origin_workspace_path`
- whether the current review location still matches the original branch/workspace

If the current branch or workspace differs from the recorded `origin_*` fields, explicitly say that the implementation is now living in a temporary branch or temporary worktree. In that case, show delete-worktree / archive combinations by default; if the user switches to free-form text, treat it as a request for more code changes.

Supported closeout paths are only about these two actions:

- delete worktree
- run archive

Do not auto-merge a worktree back to `main`, and do not auto-delete the worktree. Deletion and archive are consequential actions and require an explicit user choice.

## 2.1 Superpowers Worktree Priority

If `origin_workspace_mode=worktree`, or the current path is a temporary implementation worktree created during execution, make the "return to the original branch/workspace" consequence explicit before any destructive action.

The agent must tell the user:

- implementation currently lives in a temporary worktree
- the original branch is `origin_branch`
- the original workspace is `origin_workspace_path`
- whether local temporary branch/worktree cleanup will happen after closeout

Default recommended order:

1. finish review inside the temporary worktree
2. if no more code changes are needed, prefer `delete worktree and archive`
3. if the user only wants local cleanup, allow `delete worktree` only
4. if the code is already truly on the target branch, allow `run archive` only

## 2.2 Multi-Select Closeout Combinations

Do not model closeout as a pure single-choice menu anymore. The menu should revolve around combinable archive-related actions. Use numbered combinations such as `1,3`:

- `delete worktree`
- `run archive`

Recommended validation rules:

- `{delete worktree, run archive}`: valid. Use when the temporary worktree should be cleaned up and the change should be archived now.
- `{delete worktree}`: valid. Use when the user only wants to clean up the local temporary worktree for now.
- `{run archive}`: valid only when code is already on the target branch; if the code is still in a temporary branch/worktree, this is invalid by default.

If the user selects an invalid combination, explain the conflict explicitly. Do not guess the execution order on the user's behalf.

Default recommended combinations:

- if currently in a Superpowers temporary worktree: recommend `{delete worktree, run archive}`
- if currently in a temporary worktree but the user only wants local cleanup: recommend `{delete worktree}`
- if not in a temporary worktree and code is already truly on the target branch: recommend `{run archive}`

The user-facing closeout menu should include at least:

1. delete worktree and archive
2. delete worktree only
3. run archive only
Other: if the user's intent is not covered, allow free-form instructions; any non-numbered content means continue modifying the current implementation

Menu handling rules:

- reply `1`: execute `delete worktree and archive`
- reply `2`: execute `delete worktree` only
- reply `3`: run archive only when archive prerequisites are satisfied; otherwise explain the blocker
- reply with multiple digits, such as `1,3`: validate the combination and execute it in order if valid; otherwise explain the conflict explicitly
- free-form text instead of digits: treat it as a request to continue modifying the implementation; only ask a minimal clarification question if the intent is genuinely unclear

## 3. Archive Rules

Before archive or worktree deletion is finalized, always check whether there is still uncommitted code related to the current change:

```bash
"$ONESPEC_BASH" "$ONESPEC_COMMIT" related-dirty <change-id>
```

- if the result is empty, continue with closeout
- if the result is empty, unrelated untracked directories must not block closeout; for example, `.superpowers/` that is not recorded in the tracked-file list inside `.onespec.yaml` can be called out as "not included in this change" and then ignored for closeout purposes
- if the result is not empty, explicitly tell the user which change-related files are still uncommitted and pause archive
- if the user wants to commit now, stage only the files related to this change:

```bash
"$ONESPEC_BASH" "$ONESPEC_COMMIT" stage-related <change-id>
```

- prefer the repository's own Git commit policy for commit-message format, scope, and language; detect project docs and config first:

```bash
"$ONESPEC_BASH" "$ONESPEC_COMMIT" detect-policy <change-id>
```

- if the project defines an explicit policy, follow it
- if the project does not define a policy, fall back to general Conventional Commits: `<type>(<scope>): <short summary>`
- only commit the intersection of the tracked-file list stored in `.onespec.yaml` and current dirty files; if `.onespec.yaml` itself is dirty, include it too; never include unrelated changes
- If code is merged into the target branch and the user chooses archive, run OpenSpec archive and set state to `archived`.
- If the user deletes the worktree but does not archive yet, set state to `done` and explain that archive can be run later. Do not delete `.onespec.yaml` in that case.
- Only after archive actually runs should the runtime state file be removed:

```bash
"$ONESPEC_BASH" "$ONESPEC_CLOSEOUT" cleanup-runtime <change-id>
```

Once archive preconditions are satisfied and code is truly merged into the target branch, require one more explicit archive command before actually archiving. Recommended wording:

- `run archive`

```bash
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> phase done
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> archive <skipped|archived>
```

Before archiving, confirm:

- `tasks.md` is checked off to match reality
- project tests passed, or any failures are explicitly called out
- `openspec validate <change-id> --strict` passed
- the user explicitly chose a delete-worktree, archive, or combined strategy
- no user-review feedback remains unresolved

## 4. Report

The closeout report must cover:

- user review result
- selected closeout path: delete worktree, archive, or a combination
- final branch/worktree state
- how the current branch relates to `origin_branch`, and whether a temporary worktree is still preserved
- status of `tasks.md`, tests, and OpenSpec validate
- archive field: `skipped` or `archived`

## 5. Stop Conditions

Pause and explain if:

- the user has not finished final review
- the user has not explicitly chosen a closeout path
- the user has not explicitly approved worktree deletion or OpenSpec archive
- code is not merged into the target branch and the user asks to archive without a valid delete-worktree combination
- tests or `openspec validate <change-id> --strict` are failing and the user has not explicitly accepted the risk

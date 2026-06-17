# Archive Phase

Read on demand from `onespec` during the `review-closeout` phase. The goal is to resolve the code fate of temporary worktrees and complete merge, discard, or archive actions according to the user's explicit closeout selection.

## 1. Review Entry

Recover state first:

```bash
ONESPEC_ENV="${ONESPEC_ENV:-$(find . "$HOME"/.codex "$HOME"/.claude "$HOME"/.cursor "$HOME"/.gemini "$HOME"/.copilot "$HOME"/.agents "$HOME"/.config -path '*/onespec/scripts/onespec-env.sh' -type f -print -quit 2>/dev/null)}"
. "$ONESPEC_ENV"
"$ONESPEC_BASH" "$ONESPEC_STATE" list
```

If a relevant change exists, you must continue with:

```bash
"$ONESPEC_BASH" "$ONESPEC_STATE" recover <change-id>
```

Treat `recover` output as the current phase contract, not as reference information. Read at least `phase`, `next_skill`, `next_reference`, `next_gate`, and `allowed_actions` before deciding whether to continue closeout-phase work.

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

After implementation is done, do not require another explicit review-confirmation step and do not show a generic "continue review / preserve branch" menu. First decide what happens to the temporary worktree code. If the user replies with any non-numbered content, treat that as a request to keep modifying the implementation and return directly to code work.

Do not make the user guess what to type next. If the user enters archive phase without having made a closeout choice yet, provide a numbered menu.

If the user arrived from the execute phase completion report and already replied with a closeout number there, treat that earlier reply as the only required authorization. Do not show the same menu again and do not add an intermediate "should I handle merge/archive?" confirmation. At that point, only report the required state checks and execute the selected actions directly without splitting closeout into a second confirmation round.

Before offering closeout choices, explicitly tell the user:

- the current branch name
- the current workspace path
- the recorded `origin_branch` and `origin_workspace_path`
- whether the current review location still matches the original branch/workspace

If the current branch or workspace differs from the recorded `origin_*` fields, explicitly say that the implementation is now living in a temporary branch or temporary worktree. If the user switches to free-form text, treat it as a request for more code changes.

Supported closeout paths are limited to these three outcomes:

- Archive the current change, then merge the branch into the base branch
- Archive only, without merging
- Delete the current temporary worktree and discard the code

Merge, discard, deletion, and archive are consequential actions, but once the user has explicitly selected them in the numbered menu, execute them directly without another confirmation round.

## 2.1 Superpowers Worktree Priority

If `origin_workspace_mode=worktree`, or the current path is a temporary implementation worktree created during execution, make the "return to the original branch/workspace" consequence explicit before any destructive action.

The agent must tell the user:

- implementation currently lives in a temporary worktree
- the original branch is `origin_branch`
- the original workspace is `origin_workspace_path`
- whether local temporary branch/worktree cleanup will happen after closeout

Default recommended order:

1. finish review inside the temporary worktree
2. if no more implementation work is needed, archive first, then merge the temporary worktree into the base branch and delete the temporary worktree
3. if the user only wants to preserve the archive record without merging code, allow archive-only
4. if the user wants to discard the code, delete the worktree and drop the local temporary branch

## 2.2 Worktree Closeout Rules

If the current workspace is a temporary worktree, show this menu:

```text
1. Archive the current change, then merge the branch into the base branch
2. Archive only, without merging
3. Delete the current temporary worktree and discard the code
Other: any non-numbered content means continue modifying the current implementation; if the user gives no input, remain paused in the current review stage
```

Menu interpretation:

- reply `1`: run `archive-then-merge-worktree`; archive first, then merge into the base branch, then delete the temporary worktree and the merged local temporary branch.
- reply `2`: run `archive-only`; archive immediately, do not merge into the base branch, and do not auto-delete the current worktree.
- reply `3`: run `discard-worktree`; delete the temporary worktree and delete the matching local branch. Do not archive discarded code.
- any non-numbered content means continue modifying the current implementation; ask only one short clarification if the intent is unclear.

If the current workspace is not a temporary worktree and the code is already truly on the target branch, `archive-only` is allowed.

If the current checkout is not a temporary worktree, the current branch already equals `origin_branch`, and that branch is `main` or `master`, do not show the "archive then merge" or "delete the current temporary worktree" options. In that case the closeout menu must contain only:

```text
1. Archive only, without merging
Other: any non-numbered content means continue modifying the current implementation; if the user gives no input, remain paused in the current review stage
```

In other words, on `master/main`, do not prompt for branch merge or worktree deletion.

If the user already selected a closeout number in the execute phase completion menu, do not repeat the same menu here; combine that reply with the actual workspace state and execute the matching action directly.

## 3. Archive Rules

Before merge, discard, delete, or archive is finalized, always check whether there is still uncommitted code related to the current change:

```bash
"$ONESPEC_BASH" "$ONESPEC_COMMIT" related-dirty <change-id>
```

- if the result is empty, continue with closeout
- if the result is empty, unrelated untracked directories must not block closeout; for example, `.superpowers/` that is not recorded in the tracked-file list inside `.onespec.yaml` can be called out as "not included in this change" and then ignored for closeout purposes
- if the result is not empty, do not stop at "please commit first". The closeout scripts must auto-commit those files, and they must only commit files related to this change:

```bash
"$ONESPEC_BASH" "$ONESPEC_COMMIT" commit-related <change-id> <closeout|archive|preserve-state>
```

- prefer the repository's own Git commit policy for commit-message format, scope, and language; detect project docs and config first:

```bash
"$ONESPEC_BASH" "$ONESPEC_COMMIT" detect-policy <change-id>
```

- if the project defines an explicit policy, follow it
- if the project does not define a policy, fall back to general Conventional Commits: `<type>(<scope>): <short summary>`
- only commit the intersection of the tracked-file list stored in `.onespec.yaml` and current dirty files; if `.onespec.yaml` itself is dirty, include it too; never include unrelated changes
- exception: temporary zip files, export bundles, or other change-local artifacts under `openspec/changes/<change-id>/` are also part of the current change; auto-commit should include them so archive preserves them in change history
- auto-commit only covers the local commits needed for closeout. Local merge/archive actions included in the numbered closeout selection are already authorized. Merge, rebase, or push actions outside that selection still require explicit user approval.
- recommended order:
  1. auto-commit current-workspace dirty files related to the change before closeout continues
  2. if archive creates new archive artifacts or removes `.onespec.yaml`, auto-commit the archive result after archive finishes
  3. if the user chooses archive-then-merge, merge the implementation branch back into the base branch only after the archive commit is complete
- If the user selects `archive-then-merge-worktree`, archive first, then merge into the target branch, and set state to `archived`.
- If the user selects `archive-only`, run OpenSpec archive and set state to `archived`; do not auto-merge and do not auto-delete the current worktree.
- If the user discards the worktree, do not archive and do not merge discarded branch code into the base branch.
- Only after archive actually runs should the runtime state file be removed:

```bash
"$ONESPEC_BASH" "$ONESPEC_CLOSEOUT" cleanup-runtime <change-id>
```

For actual closeout execution, prefer:

```bash
"$ONESPEC_BASH" "$ONESPEC_CLOSEOUT" run-actions <change-id> [archive-then-merge-worktree|archive-only|discard-worktree]
```

```bash
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> phase done
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> archive <skipped|archived>
```

Before archiving, confirm:

- `tasks.md` is checked off to match reality
- project tests passed, or any failures are explicitly called out
- `openspec validate <change-id> --strict` passed
- the user explicitly chose archive-then-merge, archive-only, or discard-worktree
- no user-review feedback remains unresolved

## 4. Report

The closeout report must cover:

- user review result
- selected closeout path: archive then merge, archive only, or discard worktree
- final branch/worktree state
- how the current branch relates to `origin_branch`, and whether a temporary worktree is still kept locally
- status of `tasks.md`, tests, and OpenSpec validate
- archive field: `skipped` or `archived`

## 5. Stop Conditions

Pause and explain if:

- the user has not finished final review
- the user has not explicitly chosen a closeout path
- the user has not explicitly approved archive-then-merge, archive-only, or discard-worktree
- tests or `openspec validate <change-id> --strict` are failing and the user has not explicitly accepted the risk

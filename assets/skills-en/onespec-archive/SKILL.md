---
name: onespec-archive
description: Use when the user needs final review, feedback handling, worktree deletion, or OpenSpec archive for a OneSpec change.
---

# OneSpec Archive

Handles the review, closeout, and archive phase for OneSpec. The goal is to merge or discard temporary worktrees after explicit user confirmation, then ask about OpenSpec archive only after the user accepts the commits.

Announce at the start:

> I am using `onespec-archive` for the review / closeout phase.

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

Treat `recover` output as the current phase contract, not as reference information. Read at least `phase`, `next_skill`, `next_gate`, and `allowed_actions` before deciding whether to continue closeout-phase work.

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

After implementation is done, do not require another explicit review-confirmation step and do not show a generic "continue review / preserve branch" menu. First decide what happens to the temporary worktree code; if the user accepts and merges the commits, then ask whether archive should happen. If the user replies with any non-numbered content, treat that as a request to keep modifying the implementation and return directly to code work.

Do not make the user guess what to type next. If the user enters `onespec-archive` without having made a closeout choice yet, provide a numbered menu. If multiple actions can be combined, allow comma-separated digits such as `1,3`.

If the user arrived from the `onespec-execute` completion report and already replied with a closeout number there, treat that earlier reply as the only required authorization and do not show the same menu again. At that point, only report the required state checks and execute the matching action using the worktree/base-branch rules in this phase.

Before offering closeout choices, explicitly tell the user:

- the current branch name
- the current workspace path
- the recorded `origin_branch` and `origin_workspace_path`
- whether the current review location still matches the original branch/workspace

If the current branch or workspace differs from the recorded `origin_*` fields, explicitly say that the implementation is now living in a temporary branch or temporary worktree. In that case, choose closeout behavior based on whether the base branch is `main` / `master`; if the user switches to free-form text, treat it as a request for more code changes.

Supported closeout paths revolve around these actions:

- merge the temporary worktree into the base branch
- delete the temporary worktree and discard the code
- delete worktree
- run archive, only after code is accepted

Do not auto-delete worktrees targeting `main` / `master`. Merge, discard, deletion, and archive are consequential actions and must follow the base-branch rules below.

## 2.1 Superpowers Worktree Priority

If `origin_workspace_mode=worktree`, or the current path is a temporary implementation worktree created during execution, make the "return to the original branch/workspace" consequence explicit before any destructive action.

The agent must tell the user:

- implementation currently lives in a temporary worktree
- the original branch is `origin_branch`
- the original workspace is `origin_workspace_path`
- whether local temporary branch/worktree cleanup will happen after closeout

Default recommended order:

1. finish review inside the temporary worktree
2. if the base branch is not `main` / `master`, directly merge the temporary worktree into the base branch and delete the temporary worktree
3. if the base branch is `main` / `master`, prompt the user to either merge the code and delete the worktree, or delete the worktree and discard the code
4. after a merge, ask whether to run OpenSpec archive
5. if the code is already truly on the target branch, allow `run archive` only

## 2.2 Worktree Closeout Rules

If the current workspace is a temporary worktree:

- `origin_branch` is not `main` / `master`: directly run `merge-worktree`, merge the temporary worktree branch into the `origin_branch` workspace, then delete the temporary worktree and the merged local temporary branch. Then ask whether to archive.
- `origin_branch` is `main` / `master`: show this menu:

```text
1. Merge the code and delete the worktree
2. Delete the worktree and discard the code
Other: any non-numbered content means continue modifying the current implementation
```

Menu interpretation:

- reply `1`: run `merge-worktree`; merge the code, then delete the temporary worktree and the merged local temporary branch. Then ask whether to archive.
- reply `2`: run `discard-worktree`; delete the temporary worktree and delete the matching local branch. Do not archive discarded code.
- any non-numbered content means continue modifying the current implementation; ask only one short clarification if the intent is unclear.

If the current workspace is not a temporary worktree and the code is already truly on the target branch, `archive` is allowed.

Do not combine `merge-worktree` and `archive` in one action. Merging or discarding the worktree decides the code fate; archive is a follow-up decision after the code is accepted.

## 2.3 Archive Prompt

Only after the user chooses merge, or after a non-`main` / non-`master` base branch is automatically merged, ask whether to run OpenSpec archive:

```text
Code has been merged and the temporary worktree has been deleted. Archive now?

1. Archive
2. Do not archive yet
Other: any non-numbered content means continue modifying the current implementation
```

If the user discards the code, do not show the archive prompt.

If the user already selected a closeout number in the `onespec-execute` completion menu, do not repeat the same menu here; combine that reply with `origin_branch` to execute the matching action. Archive still requires the post-merge archive prompt.

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
- auto-commit only covers the local commits needed for closeout; it is not authorization to merge, rebase, or push. Those actions still require separate explicit user approval.
- recommended order:
  1. auto-commit current-workspace dirty files related to the change before closeout continues
  2. if archive creates new archive artifacts or removes `.onespec.yaml`, auto-commit the archive result after archive finishes
  3. if the user only deletes a temporary worktree, auto-commit the preserved runtime state after copying it back into the origin workspace
- If code is merged into the target branch and the user chooses archive, run OpenSpec archive immediately and set state to `archived`.
- If the user merges the worktree but does not archive yet, set state to `done`, `archive=skipped`, and explain that archive can be run later. Do not delete `.onespec.yaml`.
- If the user discards the worktree, do not archive and do not merge discarded branch code into the base branch.
- Only after archive actually runs should the runtime state file be removed:

```bash
"$ONESPEC_BASH" "$ONESPEC_CLOSEOUT" cleanup-runtime <change-id>
```

Once the user chooses archive from the post-merge archive prompt, treat that menu choice as the only required confirmation. Do not ask for a second archive confirmation.

For actual closeout execution, prefer:

```bash
"$ONESPEC_BASH" "$ONESPEC_CLOSEOUT" run-actions <change-id> [merge-worktree|discard-worktree|delete-worktree|archive]
```

```bash
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> phase done
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> archive <skipped|archived>
```

Before archiving, confirm:

- `tasks.md` is checked off to match reality
- project tests passed, or any failures are explicitly called out
- `openspec validate <change-id> --strict` passed
- the user explicitly chose a merge, discard, delete-worktree, or archive strategy
- no user-review feedback remains unresolved

## 4. Report

The closeout report must cover:

- user review result
- selected closeout path: merge worktree, discard worktree, delete worktree, or archive
- final branch/worktree state
- how the current branch relates to `origin_branch`, and whether a temporary worktree is still preserved
- status of `tasks.md`, tests, and OpenSpec validate
- archive field: `skipped` or `archived`

## 5. Stop Conditions

Pause and explain if:

- the user has not finished final review
- the user has not explicitly chosen a closeout path
- the user has not explicitly approved merge, discard, worktree deletion, or OpenSpec archive
- code is not merged into the target branch and the user asks to archive
- tests or `openspec validate <change-id> --strict` are failing and the user has not explicitly accepted the risk

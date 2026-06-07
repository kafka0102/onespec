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
- `origin_branch`, `origin_workspace_path`, and `origin_workspace_mode`

If state has not reached `review`, explain what is still missing: implementation, verification, `tasks.md` sync, or proposal approval.

## 2. User Review

Let the user review the implementation. If they raise issues, continue editing and re-verify.

If the user confirms the result, still require an explicit closeout confirmation such as `continue`, `yes`, or `approve closeout` before touching branch/worktree state or archive.

Before offering closeout choices, explicitly tell the user:

- the current branch name
- the current workspace path
- the recorded `origin_branch` and `origin_workspace_path`
- whether the current review location still matches the original branch/workspace

If the current branch or workspace differs from the recorded `origin_*` fields, explicitly say that the implementation is now living in a temporary branch or temporary worktree, and that the user should review there first. Pause at that point and wait for review feedback before proposing merge or deletion.

Supported closeout paths:

- local merge: switch to the target branch (default to `origin_branch` unless the project defines a different target), merge, test, then delete feature branch and worktree
- PR/MR: tailor the wording to the hosting platform. Use `PR` for GitHub remotes, `MR` for GitLab remotes, and `PR/MR` if the platform is unclear. Either create it or prompt the user to create it depending on available tools and the user's choice
- preserve: do not merge and do not delete; state may still move to `done`

Do not auto-merge a worktree back to `main`, and do not auto-delete the worktree. Merge, PR, and deletion are consequential actions and require an explicit user choice.

The user-facing closeout menu should include at least:

1. continue reviewing on the current implementation branch and do not close out yet
2. push the current branch and create a `PR` / `MR`
3. merge locally back to the target branch and delete the temporary branch / worktree
4. preserve the current branch and worktree for later

## 3. Archive Rules

Before archive, merge, PR/MR, or preserve closeout is finalized, always check whether there is still uncommitted code related to the current change:

```bash
"$ONESPEC_BASH" "$ONESPEC_COMMIT" related-dirty <change-id>
```

- if the result is empty, continue with closeout
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
- only commit the intersection of `touched-files.txt` and current dirty files; never include unrelated changes

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
- how the current branch relates to `origin_branch`, and whether a temporary worktree is still preserved
- status of `tasks.md`, tests, and OpenSpec validate
- archive field: `skipped` or `archived`

## 5. Stop Conditions

Pause and explain if:

- the user has not finished final review
- the user has not explicitly chosen a closeout path
- the user has not explicitly approved merge, worktree deletion, or OpenSpec archive
- code is not merged into the target branch but the user asks to archive
- tests or `openspec validate <change-id> --strict` are failing and the user has not explicitly accepted the risk

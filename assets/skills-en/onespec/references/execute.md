# Execute Phase

Read on demand from `onespec` during the `apply` phase. The goal is to implement only within approved scope and sync the outcome back into OpenSpec state.

## 1. Apply Routing

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

Treat `recover` output as the current phase contract, not as reference information. Read at least `phase`, `next_skill`, `next_reference`, `next_gate`, and `allowed_actions` before deciding whether to continue execution-phase work.

Before apply, read at least:

- `openspec/changes/<change-id>/proposal.md`
- `openspec/changes/<change-id>/tasks.md`
- `openspec/changes/<change-id>/design.md`, if present
- relevant `openspec/specs/**`
- relevant `docs/**`

Default intent mapping:

- Requests like "start implementation", "execute this change", "apply this proposal/change", "continue this change", "start coding/development", or "make plan" default to the Superpowers implementation-prep route for an approved change, not direct native `openspec apply`.
- Only allow native `OpenSpec apply` if the user explicitly says "do not use Superpowers plan", "do not use subagents", or "just use OpenSpec apply".
- If the proposal phase already confirmed the implementation route, honor that prior decision instead of overriding it with default mapping.

If the proposal is not approved yet, stop immediately.

If the proposal phase already confirmed the implementation path:

- user chose `Superpowers`: continue into Superpowers Make Plan.
- user chose native `OpenSpec apply`: switch to native apply.
- user still has not confirmed: restate the recommendation and require a numbered choice before implementation starts.

If execution-time route confirmation is still needed, first detect whether the current checkout is already an attached git worktree, then use the matching numbered menu. The user may reply with digits.

When not currently inside an attached worktree:
1. continue with the recommended combination
2. switch to `Superpowers + subagent + new worktree`
3. switch to `Superpowers + local + new worktree`
4. switch to `Superpowers + local + current branch`
5. switch to native `OpenSpec apply + native + current branch`
6. do not start implementation yet; go back and revise proposal / design / tasks

When already inside an attached worktree:
1. continue with the recommended combination
2. switch to `Superpowers + subagent + current worktree/current branch`
3. switch to `Superpowers + local + current worktree/current branch`
4. switch to native `OpenSpec apply + native + current worktree/current branch`
5. do not start implementation yet; go back and revise proposal / design / tasks
Other: if intent is not covered by the menu, allow free-form instructions

Menu handling rules:

- reply `1`: use the current recommended combination; do not ask a second round for `subagent/local` or `worktree/current-branch`
- when not currently inside an attached worktree, reply `2`: record `implementation_path=superpowers`, `execution_method=subagent`, and `workspace=worktree`
- when not currently inside an attached worktree, reply `3`: record `implementation_path=superpowers`, `execution_method=local`, and `workspace=worktree`
- when not currently inside an attached worktree, reply `4`: record `implementation_path=superpowers`, `execution_method=local`, and `workspace=current-branch`
- when not currently inside an attached worktree, reply `5`: record `implementation_path=openspec-apply`, `execution_method=native`, and `workspace=current-branch`
- when not currently inside an attached worktree, reply `6`: stop execution and return to design revision
- when already inside an attached worktree, reply `2`: record `implementation_path=superpowers`, `execution_method=subagent`, and `workspace=current-branch`
- when already inside an attached worktree, reply `3`: record `implementation_path=superpowers`, `execution_method=local`, and `workspace=current-branch`
- when already inside an attached worktree, reply `4`: record `implementation_path=openspec-apply`, `execution_method=native`, and `workspace=current-branch`
- when already inside an attached worktree, reply `5`: stop execution and return to design revision
- free-form text instead of digits: if intent is clear, follow it; otherwise ask one minimal clarification question

## 2. Superpowers Make Plan and Execution

On the Superpowers path, apply does not mean "start coding immediately". First translate the approved OpenSpec change into an executable Superpowers plan.

Must do:

- read and summarize `proposal.md`, `design.md`, `tasks.md`, relevant spec deltas, and relevant project docs
- extract incomplete tasks from `tasks.md` as the planning scope
- use `writing-plans` or `superpowers:writing-plans` to generate a plan at `docs/superpowers/plans/YYYY-MM-DD-<change-id>.md`
- ensure the plan covers every incomplete OpenSpec task; it may split tasks further but may not omit or expand scope
- if a matching plan already exists, verify that it still covers the current incomplete tasks; update or rewrite it otherwise
- if the plan conflicts with approved OpenSpec artifacts, fix the OpenSpec artifacts first, then rewrite the plan
- from the start of implementation until review, maintain `openspec/changes/<change-id>/.onespec.yaml` as the only runtime state file; store only the repo-relative paths directly changed for this change in its `touched_files_b64` field; prefer:

```bash
"$ONESPEC_BASH" "$ONESPEC_COMMIT" track <change-id> <path>...
```

- do not add pre-existing dirty files that are unrelated to the current change into that tracked-file list
- if you generate a temporary zip, export bundle, or other change-local artifact under `openspec/changes/<change-id>/`, keep it as part of the current change until archive; it does not need a separate `touched_files_b64` entry, but auto-commit must include it together with `.onespec.yaml`
- if auto-commit happens later, `.onespec.yaml` itself must be committed with the change while it is dirty; it is not a disposable file before archive

Record the plan and create handoff:

```bash
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> plan <plan-path>
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> phase plan-ready
"$ONESPEC_BASH" "$ONESPEC_HANDOFF" <change-id> plan --write
```

Before writing code, running native apply, or dispatching sub-work, move state into `phase implementing`:

```bash
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> phase implementing
```

If the change is still in `approved` or `plan-ready`, implementation has not formally started yet. Do not treat incidental edits as "continued implementation".

If `origin_branch` or `origin_workspace_path` is still `unknown`, fill them in immediately before creating a worktree, switching branches, or starting implementation:

```bash
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> origin_branch "$(git branch --show-current || echo detached)"
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> origin_workspace_path "$(pwd -P)"
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> origin_workspace_mode "$( "$ONESPEC_BASH" "$ONESPEC_STATE" get <change-id> workspace )"
```

If the next step is to create a temporary worktree from the current branch, check for uncommitted changes first:

- if the current workspace is dirty, handle those changes before creating the worktree
- if the current branch is `main`/`master` and has uncommitted changes, require a local commit that follows the project commit policy before creating the worktree; do not carry dirty base-branch code straight into a new implementation branch
- if the user refuses to commit the current dirty changes first, do not continue creating the worktree; pause, or switch to `current-branch` with an explicit risk callout

### 2.1 Implementation Workspace Binding

After creating or selecting the implementation worktree, immediately bind the absolute implementation workspace path as `implementation_workspace_path`, and verify that it is the working directory for subsequent commands before writing the plan:

```bash
implementation_workspace_path="$(pwd -P)"
git -C "$implementation_workspace_path" status --short
```

- If `workspace=worktree`, enter the new worktree first, then set `implementation_workspace_path`; do not keep generating the plan in the origin workspace.
- If `workspace=current-branch`, or if the current checkout is already an attached worktree, `implementation_workspace_path` is the current `pwd -P`.
- Every OpenSpec artifact read, Superpowers plan write, `.onespec.yaml` update, handoff generation, and implementation command must run with the implementation workspace as the working directory.
- The plan path `docs/superpowers/plans/YYYY-MM-DD-<change-id>.md` is always relative to `implementation_workspace_path`. Do not write the plan in the origin workspace and then copy it into the implementation worktree.
- Before recording the plan and handoff, run `git -C "$implementation_workspace_path" status --short` to confirm that the plan and `.onespec.yaml` are in the same implementation workspace.

Default execution path:

- prefer `subagent-driven-development`
- when dispatching subagents per task, enforce `test-driven-development`
- after every task, the controller reviews spec compliance and code quality before moving on
- if the user explicitly rejects subagents, or the work is too tightly coupled for task-wise dispatch, explain why and switch to `executing-plans`
- use `using-git-worktrees` when isolation is needed; do not bypass its safety checks manually

After implementation, always sync OpenSpec artifacts:

- check off completed tasks in `tasks.md`
- if the Superpowers plan split one OpenSpec task into smaller steps, only mark the OpenSpec task done after implementation, testing, and any necessary review for that task are complete
- if implementation changed approved facts, update `design.md`, `proposal.md`, or spec deltas before proceeding
- do not let implementation silently drift away from approved OpenSpec scope
- run project tests and `openspec validate <change-id> --strict`

## 3. Native OpenSpec Apply

Only use native `OpenSpec apply` when the user chooses it, accepts the low-complexity recommendation, or explicitly rejects Superpowers.

After native apply, still do all of the following:

- check off `tasks.md`
- if new ambiguity or design conflict appears during implementation, stop and fix OpenSpec artifacts first; return to brainstorming if needed
- run project tests
- run `openspec validate <change-id> --strict`
- enter user review and pause with the same numbered next-step menu described above
- move state to `review`

## 4. Stop Conditions

Pause and explain if:

- proposal is not approved but the user asks to implement directly
- the Superpowers plan conflicts with approved OpenSpec artifacts
- `tasks.md` has not been translated into an executable Superpowers plan but the model is about to code anyway
- implementation reveals a new requirement that would change scope, design, or specs
- tests or `openspec validate <change-id> --strict` are failing and not yet fixed

## 5. Implementation-Complete Gate (Mandatory Pause)

> This gate is mandatory. If it is not satisfied, do not output a completion summary, do not give closeout suggestions, and do not enter the next phase.

After implementation and verification, the flow must pause explicitly. Do not continue directly into merge, worktree deletion, archive, or any implicit closeout. The goal here is to enter user-review / `review-closeout` waiting state. After development finishes, present the closeout action menu directly; do not require a separate review-confirmation step first and do not split archive into a second confirmation round.

### 5.1 Mandatory Script Calls

After artifacts are synced and tests pass, you must run:

```bash
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> phase review
"$ONESPEC_BASH" "$ONESPEC_HANDOFF" <change-id> review --write
```

If these two commands were not executed, the gate has not passed. Do not skip this and jump straight to the completion report.

### 5.2 Mandatory Report Checklist

After running those commands, the user-facing report must include all of the following:

1. current branch name
2. current workspace path
3. `origin_branch` and `origin_workspace_path`, including whether they match the current location
4. which Superpowers plan file was used
5. which OpenSpec tasks were completed
6. how `tasks.md` was synced back
7. whether `proposal.md`, `design.md`, or spec deltas changed
8. test results
9. `openspec validate <change-id> --strict` result
10. the numbered next-step menu, including that any non-numbered reply means continue modifying the current implementation

### 5.3 Numbered Next-Step Menu Template

Before generating the next-step menu, inspect the current closeout state with the script. Do not infer whether merge/worktree deletion is needed from branch names, path names, or intuition:

```bash
"$ONESPEC_BASH" "$ONESPEC_CLOSEOUT" recommend-actions <change-id>
```

Generate the menu from the inspected state:

- If `temporary_worktree: true`, the current implementation lives in a temporary worktree. The report must end with a menu equivalent to:

```text
---
Implementation and verification are complete.

Current branch: <branch>
Current workspace: <path>
Origin: <origin_branch> @ <origin_workspace_path>

1. Archive the current change, then merge the branch into the base branch
2. Archive only, without merging
3. Delete the current temporary worktree and discard the code
Other: any non-numbered content means continue modifying the current implementation; if the user gives no input, remain paused in the current review stage
---
```

- If `temporary_worktree: false`, the current implementation is already on the target branch/workspace and there is no temporary worktree to merge back or delete. Regardless of whether that branch is `main`, `master`, `develop`, `feature/*`, or any other name, do not show "merge the branch into the base branch" or "delete the current temporary worktree". In that case the closeout menu must collapse to a single archive-only option:

```text
---
Implementation and verification are complete.

Current branch: <branch>
Current workspace: <path>
Origin: <origin_branch> @ <origin_workspace_path>

1. Archive only (current checkout is not a temporary worktree; no branch merge or worktree deletion is needed)
Other: any non-numbered content means continue modifying the current implementation; if the user gives no input, remain paused in the current review stage
---
```

In other words, when `temporary_worktree: false`, do not prompt for branch merge or worktree deletion on any target branch.

If the script reports that the current branch or workspace differs from `origin_*`, add an explicit note that implementation currently lives in a temporary branch or temporary worktree and that any non-numbered reply will be treated as a request for more implementation work.

- If `temporary_worktree: true` and the user chooses `1`, archive phase must archive first, then merge the branch into the base branch, then delete the temporary worktree.
- If `temporary_worktree: true` and the user chooses `2`, archive phase must archive only, without merging and without auto-deleting the current worktree.
- If `temporary_worktree: true` and the user chooses `3`, archive phase must delete the temporary worktree and discard the code without archiving.
- If `temporary_worktree: false` and the user chooses `1`, archive phase must archive only; it must not merge a branch or delete any workspace/worktree.

Do not stop at an abstract note such as "the next step is archive phase" or just "do review-closeout". You must also give the user a concrete numbered menu.

### 5.4 Anti-Patterns (NEVER)

The following are gate violations:

- reporting "done" without first running the scripts in 5.1
- omitting current branch / workspace information from the report
- omitting a concrete numbered next-step menu
- executing archive, merge, or worktree-deletion actions before the user has chosen one
- entering archive phase before the user replies
- replacing the concrete numbered menu with an abstract "next step is archive phase" statement
- deleting a temporary worktree before review is complete and the user explicitly asks for closeout

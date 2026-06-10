---
name: onespec-execute
description: Use when the user needs to execute an approved OpenSpec change, continue implementation, generate a Superpowers plan, run OpenSpec apply, sync tasks, or verify the result.
---

# OneSpec Execute

Handles the execution phase for OneSpec. The goal is to implement only within approved scope and sync the outcome back into OpenSpec state.

Announce at the start:

> I am using `onespec-execute` for the apply / implementation phase.

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

Treat `recover` output as the current phase contract, not as reference information. Read at least `phase`, `next_skill`, `next_gate`, and `allowed_actions` before deciding whether to continue execution-phase work.

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

If execution-time route confirmation is still needed, use this menu and let the user reply with digits:

1. continue with the recommended route
2. switch to `Superpowers`
3. switch to native `OpenSpec apply`
4. do not start implementation yet; go back and revise proposal / design / tasks
Other: if intent is not covered by the menu, allow free-form instructions

Menu handling rules:

- reply `1`: use the current recommendation
- reply `2`: switch to `Superpowers`, then keep using numbered menus for `subagent/local` and `worktree/current-branch`
- reply `3`: switch to native `OpenSpec apply`
- reply `4`: stop execution and return to design revision
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

After implementation and verification, the flow must pause explicitly. Do not continue directly into merge, worktree deletion, archive, or any implicit closeout. The goal here is to enter user-review / `review-closeout` waiting state. After development finishes, ask only whether archive-related cleanup should happen; do not require a separate review-confirmation step first.

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

The report must end with a menu equivalent to:

```text
---
Implementation and verification are complete.

Current branch: <branch>
Current workspace: <path>
Origin: <origin_branch> @ <origin_workspace_path>

1. Enter `onespec-archive` and choose delete-worktree / archive actions
2. Keep the current branch / worktree as-is and stop here for now
Other: any non-numbered content means continue modifying the current implementation; if the intent is outside the menu, the user may also describe it directly
---
```

If the current branch or workspace differs from `origin_*`, add an explicit note that implementation currently lives in a temporary branch or temporary worktree and that any non-numbered reply will be treated as a request for more implementation work.

Do not stop at an abstract note such as "the next step is `onespec-archive`" or just "do review-closeout". You must also give the user a concrete numbered menu.

### 5.4 Anti-Patterns (NEVER)

The following are gate violations:

- reporting "done" without first running the scripts in 5.1
- omitting current branch / workspace information from the report
- omitting a concrete numbered next-step menu
- mixing archive, merge, or worktree-deletion actions into the implementation-complete report
- entering `onespec-archive` before the user replies
- replacing the concrete numbered menu with an abstract "next step is onespec-archive" statement
- deleting a temporary worktree before review is complete and the user explicitly asks for closeout

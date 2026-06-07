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
ONESPEC_ENV="${ONESPEC_ENV:-$(find . "$HOME"/.codex "$HOME"/.agents "$HOME"/.config -path '*/onespec/scripts/onespec-env.sh' -type f -print -quit 2>/dev/null)}"
. "$ONESPEC_ENV"
"$ONESPEC_BASH" "$ONESPEC_STATE" list
```

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
- user still has not confirmed: restate the recommendation and require an explicit choice before implementation starts.

## 2. Superpowers Make Plan and Execution

On the Superpowers path, apply does not mean "start coding immediately". First translate the approved OpenSpec change into an executable Superpowers plan.

Must do:

- read and summarize `proposal.md`, `design.md`, `tasks.md`, relevant spec deltas, and relevant project docs
- extract incomplete tasks from `tasks.md` as the planning scope
- use `writing-plans` or `superpowers:writing-plans` to generate a plan at `docs/superpowers/plans/YYYY-MM-DD-<change-id>.md`
- ensure the plan covers every incomplete OpenSpec task; it may split tasks further but may not omit or expand scope
- if a matching plan already exists, verify that it still covers the current incomplete tasks; update or rewrite it otherwise
- if the plan conflicts with approved OpenSpec artifacts, fix the OpenSpec artifacts first, then rewrite the plan
- from the start of implementation until review, maintain `openspec/changes/<change-id>/.onespec/touched-files.txt` with only the repo-relative paths that were directly changed for this change; prefer:

```bash
"$ONESPEC_BASH" "$ONESPEC_COMMIT" track <change-id> <path>...
```

- do not add pre-existing dirty files that are unrelated to the current change into `touched-files.txt`

Record the plan and create handoff:

```bash
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> plan <plan-path>
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> phase plan-ready
"$ONESPEC_BASH" "$ONESPEC_HANDOFF" <change-id> plan --write
```

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
- move state to `review` and generate review handoff

```bash
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> phase review
"$ONESPEC_BASH" "$ONESPEC_HANDOFF" <change-id> review --write
```

After implementation and verification, the flow must pause. Do not continue directly into merge, worktree deletion, archive, or any implicit closeout. At this point the agent must:

- tell the user the current branch and current workspace path
- if the current branch or workspace differs from `origin_branch` / `origin_workspace_path`, explicitly say that implementation now lives in a temporary branch or temporary worktree and the user should review there first
- do not stop at an abstract note like "the next step is `onespec-archive`" or just "do review-closeout". Also tell the user exactly how to continue, for example: "if review passed and you want to enter closeout, reply `enter closeout` or `start review-closeout`; if you want to keep reviewing, reply `continue review`"
- report only implementation results, verification results, current branch/worktree status, and the explicit trigger words for entering `onespec-archive`
- never delete a temporary worktree before the user finishes review and explicitly requests closeout

Report must cover:

- which Superpowers plan file was used
- which OpenSpec tasks were completed
- what was synced back into `tasks.md`
- whether `proposal.md`, `design.md`, or spec deltas changed
- whether tests and `openspec validate <change-id> --strict` passed
- the current branch, current workspace path, and whether they differ from `origin_branch` / `origin_workspace_path`
- whether the change is ready for review-closeout

## 3. Native OpenSpec Apply

Only use native `OpenSpec apply` when the user chooses it, accepts the low-complexity recommendation, or explicitly rejects Superpowers.

After native apply, still do all of the following:

- check off `tasks.md`
- if new ambiguity or design conflict appears during implementation, stop and fix OpenSpec artifacts first; return to brainstorming if needed
- run project tests
- run `openspec validate <change-id> --strict`
- enter user review
- move state to `review`

## 4. Stop Conditions

Pause and explain if:

- proposal is not approved but the user asks to implement directly
- the Superpowers plan conflicts with approved OpenSpec artifacts
- `tasks.md` has not been translated into an executable Superpowers plan but the model is about to code anyway
- implementation reveals a new requirement that would change scope, design, or specs
- tests or `openspec validate <change-id> --strict` are failing and not yet fixed

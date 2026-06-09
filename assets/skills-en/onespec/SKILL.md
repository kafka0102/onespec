---
name: onespec
description: Use when the user wants to manage the full AI coding change lifecycle with OpenSpec and Superpowers, or is unsure whether they should be in design, execution, or archive.
---

# OneSpec Workflow

OneSpec is a routing skill. It restores state, determines the current phase, and hands off to `onespec-design`, `onespec-execute`, or `onespec-archive`. Phase-specific rules live in the child skills.

Announce at the start:

> I am using the `onespec` workflow.

## Recovery First

Always check state before relying on chat history:

```bash
ONESPEC_ENV="${ONESPEC_ENV:-$(find . "$HOME"/.codex "$HOME"/.agents "$HOME"/.config -path '*/onespec/scripts/onespec-env.sh' -type f -print -quit 2>/dev/null)}"
. "$ONESPEC_ENV"
"$ONESPEC_BASH" "$ONESPEC_STATE" list
```

If a relevant change exists, run:

```bash
"$ONESPEC_BASH" "$ONESPEC_STATE" recover <change-id>
```

Runtime state lives in `openspec/changes/<change-id>/.onespec.yaml`. Handoff summary, hashes, and touched-file tracking all live there; keep it until archive, then delete it during archive cleanup.
Treat `recover` output as the execution contract, not as a hint. Read at least `phase`, `next_skill`, `next_gate`, and `allowed_actions` before deciding what to do next.

## Phase Routing

Classify the current request first:

- `propose`: define a new change, clarify scope, generate `proposal.md`, `design.md`, `tasks.md`, and spec deltas. Use `onespec-design`.
- `apply`: implement an approved change, continue an existing change, generate or resume a Superpowers plan, and sync OpenSpec state. Use `onespec-execute`.
- `review-closeout`: user review, feedback handling, worktree deletion, or archive. Use `onespec-archive`.

If intent is unclear, ask one short question only.

Default intent mapping:

- Requests like "new requirement", "design this", "write a proposal/spec", or "define a change" go to `onespec-design`.
- Requests like "start implementation", "execute this change", "apply this proposal/change", "continue this change", "start coding/development", or "make plan" go to `onespec-execute`. If the proposal is not approved yet, `onespec-execute` must stop and send the flow back to the approval gate in `onespec-design`.
- Requests like "review", "close out", "archive", or "delete the worktree" go to `onespec-archive`.

## Shared Constraints

- OpenSpec owns scope, formal artifacts, approval gates, spec deltas, and archive semantics.
- Superpowers owns high-ambiguity clarification, implementation planning, TDD, per-task review, and execution quality.
- Do not ask the user to name the change. Generate a short kebab-case `change-id` from the task and append a suffix if needed.
- Read the minimum necessary context: `openspec/config.yaml`, `openspec/project.md`, relevant `openspec/specs/**`, project entry docs, and current branch/worktree state.
- Only ask questions that can change the proposal, execution path, branch handling, or archive result.
- If shared and phase-specific rules conflict, the child skill for the current phase wins.
- If `recover` already points to a `next_skill`, resume there by default. Only override it when the user explicitly changes phase and the previous phase gate is already complete.

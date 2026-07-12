---
name: onespec
description: Use when the user wants to manage the full AI coding change lifecycle with OpenSpec and Superpowers, or is unsure whether they should be in design, execution, archive, or the fast path.
---

# OneSpec Workflow

OneSpec is a single-entry workflow skill. Restore state, determine the current phase, then read the matching module under `references/`; do not call deprecated phase child skills.

Announce at the start:

> I am using the `onespec` workflow.

## Recovery First

Always check state before relying on chat history:

```bash
ONESPEC_ENV="${ONESPEC_ENV:-$(find . "$HOME"/.codex "$HOME"/.claude "$HOME"/.cursor "$HOME"/.gemini "$HOME"/.copilot "$HOME"/.agents "$HOME"/.config -path '*/onespec/scripts/onespec-env.sh' -type f -print -quit 2>/dev/null)}"
. "$ONESPEC_ENV"
"$ONESPEC_BASH" "$ONESPEC_STATE" list
```

If a relevant change exists, run:

```bash
"$ONESPEC_BASH" "$ONESPEC_STATE" recover <change-id>
```

Runtime state lives in `openspec/changes/<change-id>/.onespec.yaml`. Handoff summary, hashes, and touched-file tracking all live there; keep it until archive, then delete it during archive cleanup.
Treat `recover` output as the execution contract, not as a hint. Read at least `phase`, `next_skill`, `next_reference`, `next_gate`, and `allowed_actions` before deciding what to do next.

## Phase Routing

Classify the current request first:

- `propose`: define a new change, clarify scope, generate `proposal.md`, `design.md`, `tasks.md`, and spec deltas. Read `references/design.md`.
- `apply`: implement an approved change, continue an existing change, generate or resume a Superpowers plan, and sync OpenSpec state. Read `references/execute.md`.
- `review-closeout`: user review, feedback handling, worktree deletion, or archive. Read `references/archive.md`.
- `fast`: the user explicitly asks for `onespec-fast`, the fast path, fast apply, automatic OpenSpec end-to-end execution, or automatic proposal/implementation/archive. Read `references/fast.md`; the standalone `onespec-fast` entrypoint also routes to this same reference.

If intent is unclear, ask one short question only.

Default intent mapping:

- Requests like "new requirement", "design this", "write a proposal/spec", or "define a change" read `references/design.md`.
- Requests like "start implementation", "execute this change", "apply this proposal/change", "continue this change", "start coding/development", or "make plan" read `references/execute.md`. If the proposal is not approved yet, stop and send the flow back to the approval gate in `references/design.md`.
- Requests like "review", "close out", "archive", or "delete the worktree" read `references/archive.md`.
- Requests like "onespec-fast", "fast path", "fast apply", "automatic OpenSpec end-to-end execution", or "automatic proposal/implementation/archive" read `references/fast.md`.

## Reference Loading

- Read only the one reference needed for the current phase; do not preload other phases.
- If `recover` returns `next_reference`, read it by default. Override it only when the user explicitly changes phase and the previous phase gate is already complete.
- `references/fast.md` may reuse procedure sections from `design.md`, `execute.md`, and `archive.md`, but the fast path overrides the normal proposal approval, review pause, and closeout-menu gates.
- For cross-phase checks, read only the smallest section directly required by the gate.

## Shared Constraints

- OpenSpec owns scope, formal artifacts, approval gates, spec deltas, and archive semantics.
- Superpowers owns high-ambiguity clarification, implementation planning, TDD, per-task review, and execution quality.
- Do not ask the user to name the change. Generate a short kebab-case `change-id` from the task and append a suffix if needed.
- Read the minimum necessary context: `openspec/config.yaml`, relevant `openspec/specs/**`, project entry docs, and current branch/worktree state.
- Context boundary: once a phase's artifacts are written and its gate is passed, they are the authoritative input for downstream phases; the process that produced them (brainstorming transcript, ambiguity-scan reasoning, exploratory doc reads) is supplementary, not a derivation source. When the two conflict, artifacts win; process content must not override approved artifacts.
- Only ask questions that can change the proposal, execution path, branch handling, or archive result.
- If shared and phase-specific rules conflict, the current phase reference wins.
- Each phase reference defines mandatory pause gates, such as the approval gate in `references/design.md` and the implementation-complete gate in `references/execute.md`. Before routing to the next phase, confirm the previous gate is complete; if it is not, refuse to continue and name the missing gate.

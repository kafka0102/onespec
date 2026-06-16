# Fast Path

Read on demand from `onespec` and the standalone `onespec-fast` entrypoint for the `fast` path. The goal is to skip the normal Proposal Approval Gate, implementation-path selection, and post-implementation archive choice while still keeping one Mandatory Complexity Check. Only low-complexity changes may continue with native `OpenSpec apply` automatic implementation and direct archive; medium/high complexity must fall back to the standard `onespec` path.

## 1. Intake

Recover state first:

```bash
ONESPEC_ENV="${ONESPEC_ENV:-$(find . "$HOME"/.codex "$HOME"/.claude "$HOME"/.cursor "$HOME"/.gemini "$HOME"/.copilot "$HOME"/.agents "$HOME"/.config -path '*/onespec/scripts/onespec-env.sh' -type f -print -quit 2>/dev/null)}"
. "$ONESPEC_ENV"
"$ONESPEC_BASH" "$ONESPEC_STATE" list
```

If a relevant change exists, run:

```bash
"$ONESPEC_BASH" "$ONESPEC_STATE" recover <change-id>
```

Treat `recover` output as the execution contract. Read at least `phase`, `next_skill`, `next_reference`, `next_gate`, and `allowed_actions`.

Use rules:

- Use only when the user explicitly asks for `onespec-fast`, the fast path, fast apply, automatic OpenSpec proposal/implementation/archive, or automatic end-to-end execution.
- Do not ask the user to name the change. Generate a short kebab-case `change-id`; append a numeric suffix if needed.
- Read the minimum needed context: `openspec/config.yaml`, `openspec/project.md`, relevant `openspec/specs/**`, project entry docs, current branch, and workspace state.
- Pause only when required OpenSpec context is too incomplete to produce a valid proposal, or project docs explicitly forbid automatic edits on the current branch.

## 2. Direct Proposal

The fast path skips the normal design phase pre-proposal user confirmation.

Create the OpenSpec proposal artifacts directly:

- `openspec/changes/<change-id>/proposal.md`
- `openspec/changes/<change-id>/design.md`, only when it has real technical value
- `openspec/changes/<change-id>/tasks.md`
- required `specs/**/spec.md`

Create state and handoff:

```bash
"$ONESPEC_BASH" "$ONESPEC_STATE" init <change-id>
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> phase proposal-ready
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> ambiguity low
"$ONESPEC_BASH" "$ONESPEC_HANDOFF" <change-id> proposal --write
```

Do not show the normal proposal approval menu. `onespec-fast` means the user has authorized continuing with native `OpenSpec apply` implementation and archive.

## 3. Proposal Approval Gate

The fast path still has a Proposal Approval Gate, but the pass condition is different:

- Only treat the proposal artifacts as approved when the user explicitly asks for `onespec-fast`, the fast path, fast apply, automatic OpenSpec proposal/implementation/archive, or automatic end-to-end execution.
- That automatic approval only authorizes continuing into the Mandatory Complexity Check; it does not mean every complexity level may be implemented automatically.
- Do not render the normal proposal approval menu, and do not ask the user to send a second explicit `approve`.

## 4. Mandatory Complexity Check

After proposal creation, you must read `tasks.md`, `proposal.md`, and `design.md` (if present) and run a Mandatory Complexity Check.

Reuse the complexity rules from `design.md`:

- `low complexity`: few tasks, linear path, single module or few files, almost no cross-layer dependency, and no migration / schema / multi-surface coordination.
- `medium complexity`: some cross-module or cross-surface work with clear boundaries, but it may benefit from decomposition, TDD, review gates, or staged verification.
- `high complexity`: clearly crosses multiple workspaces or capabilities, touches API/database/jobs/shared packages or multi-dimensional coordination, or has strong task coupling.

Record the result:

```bash
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> complexity <low|medium|high>
```

Only `low complexity` may continue on the fast automatic path. `medium complexity` and `high complexity` must fall back.

## 5. Low-Complexity Automatic Apply and Archive

If the Mandatory Complexity Check result is `low complexity`, do not switch to a Superpowers plan/subagent. Record the fast path directly and start implementation:

```bash
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> complexity low
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> implementation_path openspec-apply
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> execution_method native
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> workspace current-branch
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> origin_branch "$(git branch --show-current || echo detached)"
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> origin_workspace_path "$(pwd -P)"
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> origin_workspace_mode current-branch
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> phase approved
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> phase implementing
```

Implementation rules:

- Use native `OpenSpec apply`; do not create a Superpowers plan and do not dispatch subagents.
- Implement only incomplete tasks in `tasks.md`; do not expand proposal scope.
- Work in the current workspace; do not auto-create a worktree, auto-push, or auto-merge.
- If the current branch is `main`/`master`, record `origin_workspace_mode` as `main-override`, but pause only if project docs explicitly forbid direct edits on the main branch.
- Track directly modified repo-relative paths in `.onespec.yaml`; prefer:

```bash
"$ONESPEC_BASH" "$ONESPEC_COMMIT" track <change-id> <path>...
```

After implementation:

- Check off completed tasks in `tasks.md`.
- If implementation exposes a new design conflict, stop automatic implementation, fix OpenSpec artifacts, and stay on the OpenSpec proposal/apply path; switch to Superpowers only if the user explicitly asks.
- Run project tests.
- Run `openspec validate <change-id> --strict`.
- Write the review handoff, but do not pause for user review:

```bash
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> phase review
"$ONESPEC_BASH" "$ONESPEC_HANDOFF" <change-id> review --write
```

Then archive directly without showing the archive phase closeout menu:

```bash
"$ONESPEC_BASH" "$ONESPEC_COMMIT" related-dirty <change-id>
"$ONESPEC_BASH" "$ONESPEC_COMMIT" commit-related <change-id> closeout
"$ONESPEC_BASH" "$ONESPEC_CLOSEOUT" run-actions <change-id> archive-only
```

If `related-dirty` is empty, do not run `commit-related <change-id> closeout`. `run-actions` sets `phase archived` / `archive archived` and handles the post-archive commit plus runtime cleanup.

## 6. Medium/High Complexity Fallback

If the Mandatory Complexity Check result is `medium complexity` or `high complexity`, stop automatic apply/archive and fall back to the standard `onespec` path:

- Keep the generated proposal / design / tasks / spec artifacts; do not delete them.
- Keep `phase proposal-ready` and persist the computed complexity.
- Re-read `onespec/references/design.md` section `Proposal Approval Gate and Path Selection` and present the normal recommended-combination menu.
- Only enter `execute.md` after the user accepts the standard recommended path or overrides it with another valid combination.
- Do not force `implementation_path openspec-apply`, `execution_method native`, or automatic `archive-only` for medium/high complexity work.

## 7. Stop Conditions

Pause if:

- required OpenSpec context is missing and a valid proposal cannot be written
- the request clearly spans multiple changes that should be split
- tests or `openspec validate <change-id> --strict` fail and cannot be fixed inside the approved scope
- implementation reveals scope expansion, design change, or spec semantic change
- project docs explicitly forbid automatic implementation or automatic archive on the current branch

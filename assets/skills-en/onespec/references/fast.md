# Fast Path

Read on demand from `onespec` and the standalone `onespec-fast` entrypoint for the `fast` path. The goal is to skip the normal proposal approval gate, complexity check, implementation-path selection, and post-implementation archive choice. Once in the fast path, use native `OpenSpec apply` for the whole implementation and archive directly.

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
- Read the minimum needed context: `openspec/config.yaml`, relevant `openspec/specs/**`, project entry docs, current branch, and workspace state.
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

## 3. OpenSpec Automatic Apply and Archive

After proposal creation, do not run a complexity check and do not switch to a Superpowers plan/subagent. Record the fast path directly and start implementation:

```bash
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

## 4. Stop Conditions

Pause if:

- required OpenSpec context is missing and a valid proposal cannot be written
- the request clearly spans multiple changes that should be split
- tests or `openspec validate <change-id> --strict` fail and cannot be fixed inside the approved scope
- implementation reveals scope expansion, design change, or spec semantic change
- project docs explicitly forbid automatic implementation or automatic archive on the current branch

---
name: onespec-fast
description: Use when the user explicitly asks for the OneSpec fast path, onespec-fast, fast apply, automatic OpenSpec proposal/implementation/archive, or automatic end-to-end execution. This skill reuses `onespec/references/fast.md`, runs a mandatory post-proposal complexity check, uses native OpenSpec apply only for low-complexity work, and falls back to the standard OneSpec path for medium/high complexity.
---

# OneSpec Fast

This is the standalone entrypoint for the OneSpec fast path. It does not duplicate phase rules; it must reuse the main `onespec` skill's `references/fast.md`.

Announce at the start:

> I am using the `onespec-fast` fast path.

## Entry Rules

- Use only when the user explicitly asks for `onespec-fast`, the fast path, fast apply, automatic OpenSpec proposal/implementation/archive, or automatic end-to-end execution.
- First read the sibling `../onespec/SKILL.md` and follow its recovery-first, shared-constraint, and reference-loading rules.
- Then read `../onespec/references/fast.md` and execute those steps.
- If the sibling path is unavailable, locate `*/onespec/references/fast.md` under the current project, `$HOME/.codex`, `$HOME/.claude`, `$HOME/.cursor`, `$HOME/.gemini`, `$HOME/.copilot`, `$HOME/.agents`, or `$HOME/.config`. If still missing, stop and ask the user to rerun `onespec init --overwrite`.
- `references/fast.md` may reuse procedure sections from `design.md`, `execute.md`, and `archive.md`, but it overrides the normal proposal approval, review pause, and closeout-menu gates.

Do not restate the fast-path steps in `onespec-fast/SKILL.md`; the full rules live only in `onespec/references/fast.md`.

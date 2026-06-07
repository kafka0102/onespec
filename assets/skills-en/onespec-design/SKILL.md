---
name: onespec-design
description: Use when the user needs requirement clarification, proposal/design/tasks/spec deltas, complexity analysis, or approval-path selection for an OpenSpec change.
---

# OneSpec Design

Handles the design and proposal phase for OneSpec. The goal is to turn a request into pre-approval OpenSpec artifacts and recommend the correct implementation path.

Announce at the start:

> I am using `onespec-design` for the proposal/design phase.

## 1. Intake

Recover state first:

```bash
ONESPEC_ENV="${ONESPEC_ENV:-$(find . "$HOME"/.codex "$HOME"/.agents "$HOME"/.config -path '*/onespec/scripts/onespec-env.sh' -type f -print -quit 2>/dev/null)}"
. "$ONESPEC_ENV"
"$ONESPEC_BASH" "$ONESPEC_STATE" list
```

Read the minimum necessary context:

- Relevant parts of `openspec/config.yaml`, `openspec/project.md`, and `openspec/specs/**`
- Relevant project entry docs such as `AGENTS.md`, `README.md`, or `docs/**`
- Current branch and workspace state

Do not ask the user to name the change. Generate a short kebab-case `change-id`; append a numeric suffix if needed.

## 2. Ambiguity Scan and Proposal Routing

Before generating any OpenSpec artifact, explicitly run an ambiguity scan and report both the classification and why it was triggered.

At minimum check for:

- multiple reasonable scopes
- multiple reasonable behavior interpretations
- multiple reasonable technical approaches
- whether the user must visually confirm UI direction, layout, or interaction
- missing acceptance criteria
- missing non-goals
- missing rollout / migration / compatibility assumptions
- multiple subsystems that should probably be split

Classification rules:

- `low ambiguity`: scope is mostly singular, the solution space is mostly clear, and most acceptance criteria can be inferred from project docs or existing specs.
- `high ambiguity`: there are two or more reasonable interpretations, or writing a proposal immediately would likely bake guesses into formal artifacts.

Do not silently jump into proposal/design/tasks/spec writing. First give the user an explicit ambiguity result and the next handling step.

Visible output must include:

- result: `low ambiguity` or `high ambiguity`
- trigger reasons: 1-3 reasons
- handling: what happens next and whether user confirmation is needed

Suggested templates:

- `Low ambiguity: this request is low ambiguity because <reason1> and <reason2>. Handling: I will draft the OpenSpec proposal directly. If I discover one critical missing prerequisite, I will ask one short question before writing formal artifacts.`
- `High ambiguity: this request is high ambiguity because <reason1> and <reason2>. Handling: I will not draft the proposal yet. I will enter brainstorming first, resolve the key scope/behavior/technical disagreements, then backfill the OpenSpec artifacts from the confirmed result.`

Low-ambiguity flow:

- State the low-ambiguity result explicitly.
- If no UI/visual confirmation is needed and no blocking question remains, proceed to the OpenSpec proposal.
- If one critical question remains, ask one short question, then rerun the ambiguity scan after the answer.
- Do not create OpenSpec artifacts until mandatory missing information is resolved.
- Do not invoke brainstorming for low-ambiguity requests.

High-ambiguity flow:

- State the high-ambiguity result explicitly.
- Do not create OpenSpec artifacts before this explanation is complete.
- Explicitly say that `brainstorming` will be used first.
- Use `brainstorming` or `superpowers:brainstorming`, ask one question at a time, offer 2-3 approaches with trade-offs, and produce a confirmed design document.
- After the user confirms the brainstorming result, backfill OpenSpec artifacts from that design plus relevant `docs/**` and `openspec/specs/**`. Do not re-ask questions already resolved.

Visual-design trigger rules:

- If the user asks to see designs, page options, UI/UX directions, visual redesign, prototypes, mockups, wireframes, or browser-visible results, treat that as a visual confirmation request by default.
- In that case, do not continue with text-only clarification. If the change does not yet have an approved visual direction, route to brainstorming with a visual companion.
- For mockups, wireframes, layout comparisons, style comparisons, or page-result confirmation, first send a standalone visual companion offer message with no other content. Wait for confirmation, read `brainstorming/visual-companion.md`, start a local server, provide a local URL, and present the first visual direction. Only continue with text-only brainstorming if the user declines.

## 3. Post-Proposal Task Analysis

Generate or update the OpenSpec artifacts:

- `openspec/changes/<change-id>/proposal.md`
- `openspec/changes/<change-id>/design.md` when it has real technical value
- `openspec/changes/<change-id>/tasks.md`
- required `specs/**/spec.md`

Create state and handoff:

```bash
"$ONESPEC_BASH" "$ONESPEC_STATE" init <change-id>
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> phase proposal-ready
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> ambiguity <low|high>
"$ONESPEC_BASH" "$ONESPEC_HANDOFF" <change-id> proposal --write
```

Do not stop at "proposal generated". Read the task artifact and recommend an implementation path.

Task-analysis inputs:

- `openspec/changes/<change-id>/tasks.md`
- `proposal.md`
- `design.md`, if present
- relevant `openspec/specs/**`
- if the current schema is not `spec-driven`, read task artifacts or equivalent apply context from `openspec status --change "<change-id>" --json` or `openspec instructions apply --change "<change-id>" --json`

At minimum analyze:

- incomplete task count and whether they split naturally into small units
- whether work crosses multiple workspaces, business modules, or capabilities
- whether it spans frontend, backend, database, jobs, shared packages, or spec/doc sync
- whether migration, compatibility, rollout order, async flows, data repair, or manual verification are involved
- whether tasks are tightly coupled and require strict review gates / TDD / staged acceptance

Complexity grading and recommendation:

- `low complexity`: default to native `OpenSpec apply`. Few tasks, linear path, single module or few files, almost no cross-layer dependency, and no migration / schema / multi-surface coordination.
- `medium complexity`: some cross-module or cross-surface work but clear boundaries. Recommend `Superpowers` if stricter decomposition, TDD, review gates, or phased verification matter; otherwise `OpenSpec apply` can still work.
- `high complexity`: clearly crosses multiple workspaces or capabilities, touches API/database/jobs/shared packages/visual confirmation together, or has strong task coupling. Default to `Superpowers`.

Always state:

- change id and artifact locations
- a short summary of the task artifact
- complexity level and concrete reasons
- recommended route: `recommend Superpowers` or `recommend direct OpenSpec apply`
- that the user may override the recommendation

## 4. Proposal Approval Gate and Path Selection

Default intent mapping, issue-workflow routing, or implementation recommendations do not count as proposal approval.

Implementation planning is only allowed after the user explicitly approves the proposal / design / spec. `continue`, `yes`, `approve`, or `do it this way` count. Silence, "looks okay", the original "start implementation", "execute this change", or "make plan" do not count as artifact approval.

If the user chooses `Superpowers`, confirm two choices together:

- execution method: `subagent` or `local`. Recommend `subagent` by default, which maps to `subagent-driven-development`; `local` maps to `executing-plans`.
- workspace: `worktree` or `current-branch`.

`main`/`master` rules:

- Do not implement directly on `main`/`master` unless the user explicitly accepts the risk after being warned.
- If the current branch is `main`/`master` and the user chooses `Superpowers`, do not auto-create a worktree from the branch name alone. Follow the chosen workspace policy. If `current-branch` is selected, warn and record `main-override`.
- If already on a feature branch and the workspace is clean, `current-branch` is acceptable.

After confirmation record:

```bash
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> complexity <low|medium|high>
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> implementation_path <openspec-apply|superpowers>
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> execution_method <subagent|local|native>
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> workspace <worktree|current-branch|main-override>
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> origin_branch "$(git branch --show-current || echo detached)"
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> origin_workspace_path "$(pwd -P)"
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> origin_workspace_mode <worktree|current-branch|main-override>
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> phase approved
```

These `origin_*` fields represent the branch and workspace where the user originally started the change. If implementation later happens in a different branch or temporary worktree, `onespec-execute` and `onespec-archive` must use them when prompting for review and closeout.

## 5. Stop Conditions

Pause and explain if:

- one request actually spans multiple changes that should be split
- required OpenSpec context is missing to the point that continuing is unsafe
- the user explicitly wants visual design output but no standalone visual companion offer has been sent or accepted yet
- proposal / design / spec is not explicitly approved but the user asks to start implementation
- execution path, execution method, or workspace choice affects risk and is still unconfirmed

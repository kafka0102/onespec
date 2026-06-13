# OneSpec

> 中文说明见 [README-zh.md](README-zh.md)

OneSpec is an agent skill bundle and CLI for running an OpenSpec + Superpowers workflow. It installs the bundled `onespec` and `onespec-fast` skills, then uses `onespec/references/` phase modules to move an AI coding task through design, execution, and archive.

Official platform support today:

- Codex
- Claude Code
- Cursor
- Gemini CLI
- GitHub Copilot

The bundle itself is plain `SKILL.md` plus shell scripts, so it can be ported to other `SKILL.md`-compatible agents. The `onespec init` and `onespec doctor` commands now manage the five platforms above directly.

## What This Skill Does

- Routes requests into the correct phase of the workflow.
- Provides `onespec-fast` for low-complexity changes that should go directly from proposal to native OpenSpec apply and archive.
- Uses OpenSpec as the source of truth for scope, approval gates, specs, and archive semantics.
- Uses Superpowers for ambiguity handling, implementation planning, TDD, and execution discipline.
- Persists per-change runtime state in `openspec/changes/<change-id>/.onespec.yaml` until archive.

## Install

Prerequisites:

- Node.js 20+
- npm / npx
- Git
- A shell environment with `bash`

```bash
npm install -g @kafka0102/onespec
```

You can also run it directly with `npx`.

## Quick Start

```bash
cd your-project
onespec init
```

`onespec init` will:

1. Guide you to choose one or more AI platforms: `codex`, `claude-code`, `cursor`, `gemini-cli`, or `github-copilot`
2. Choose the install scope: project or global
3. Choose the OneSpec skill language: `zh` or `en`
4. Automatically install OpenSpec CLI when needed
5. Automatically initialize OpenSpec for the selected platforms
6. Automatically install Superpowers skills for the selected platforms
7. Deploy the bundled OneSpec skills: `onespec` and `onespec-fast`
8. Create `docs/superpowers/specs/` and `docs/superpowers/plans/` for project installs

Common non-interactive examples:

```bash
onespec init . --platform codex --scope project --language en --yes
onespec init . --platform claude-code --scope project --language en --yes
onespec init . --platform codex,cursor --scope project --language en --yes
onespec init --platform cursor --scope global --language en --yes
```

If the target is not the detected default platform, pass `--platform` explicitly. Use a comma-separated list to install into multiple agents.

> [!TIP]
> Update
>
> Run `npm install -g @kafka0102/onespec@latest` to update to the latest version.

## How To Use

Check the environment:

```bash
onespec doctor . --scope project
```

Add `--platform <agent>` when the target is not Codex.

After `onespec init`, restart your agent session and invoke the workflow in natural language, for example:

```text
use onespec: design a login audit feature
use onespec: apply the approved change for login audit
use onespec: review and archive the login audit change
use onespec-fast: add a low-complexity validation message
```

The router skill chooses the next phase by intent and reads only the matching reference module:

- New requirement, proposal, or scope definition: `onespec/references/design.md`
- Start or continue implementation: `onespec/references/execute.md`
- Review, closeout, worktree deletion, or archive: `onespec/references/archive.md`
- Explicit low-complexity fast path with automatic proposal, native apply, and archive: `onespec-fast`

For non-supported agents, you can still copy the bundled skills manually into that agent's skill directory if it supports `SKILL.md`, but `onespec doctor` will not validate that environment yet.

## Workflow Execution

### 1. Recover state first

Each run checks for existing OneSpec state instead of relying on chat history. Active change state is stored in:

```text
openspec/changes/<change-id>/.onespec.yaml
```

That file keeps phase, handoff data, and touched-file tracking until the change is archived.

### 2. Design phase

`onespec/references/design.md` handles requirement clarification, ambiguity scan, `proposal.md`, `design.md`, `tasks.md`, and spec delta generation. After the artifacts are ready, it recommends whether execution should use Superpowers or direct OpenSpec apply.

### 3. Execute phase

`onespec/references/execute.md` only works from approved OpenSpec scope. It restores or creates an executable implementation plan, carries out the work, and syncs task and file state back into OpenSpec.

### 4. Review and archive phase

`onespec/references/archive.md` handles final review, feedback follow-up, worktree cleanup, and archive. Destructive closeout actions are gated behind explicit user confirmation.

### 5. Fast path

`onespec-fast` is a thin standalone entrypoint that reuses `onespec/references/fast.md`. It directly creates the OpenSpec proposal and runs a mandatory complexity check. Low-complexity changes skip proposal confirmation, use native OpenSpec apply, and archive automatically; medium or high complexity changes fall back to the regular approval gate.

## Core Capabilities

- Bundled workflow skills: `onespec` router and `onespec-fast` entrypoint are installed together; design, execute, archive, and fast rules live under `onespec/references/`.
- Project scaffolding: project installs create `docs/superpowers/specs` and `docs/superpowers/plans`.
- Environment checks: `onespec doctor` reports missing OneSpec skills, OpenSpec CLI/project setup, and required Superpowers skills for Codex, Claude Code, Cursor, Gemini CLI, and GitHub Copilot.
- Localized skill bundle: `onespec init` supports `--language zh|en`.
- Controlled runtime state: OneSpec keeps execution handoff and touched-file state in `.onespec.yaml` until archive cleanup.

## Requirements

- Node.js `>=20`
- Codex, Claude Code, Cursor, Gemini CLI, or GitHub Copilot for first-class CLI support
- OpenSpec CLI for OpenSpec project workflows
- Superpowers skills for the full recommended execution path

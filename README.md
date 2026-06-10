# OneSpec

> 中文说明见 [README-zh.md](README-zh.md)

OneSpec is an agent skill bundle and CLI for running an OpenSpec + Superpowers workflow. It installs the bundled `onespec`, `onespec-design`, `onespec-execute`, and `onespec-archive` skills, then uses them to move an AI coding task through design, execution, and archive.

Official platform support today:

- Codex
- Claude Code
- Cursor
- Gemini CLI
- GitHub Copilot

The bundle itself is plain `SKILL.md` plus shell scripts, so it can be ported to other `SKILL.md`-compatible agents. The `onespec init` and `onespec doctor` commands now manage the five platforms above directly.

## What This Skill Does

- Routes requests into the correct phase of the workflow.
- Uses OpenSpec as the source of truth for scope, approval gates, specs, and archive semantics.
- Uses Superpowers for ambiguity handling, implementation planning, TDD, and execution discipline.
- Persists per-change runtime state in `openspec/changes/<change-id>/.onespec.yaml` until archive.

## Install

### 1. Install the CLI

```bash
npm install -g @kafka0102/onespec
```

Or run it directly with `npx`:

```bash
npx @kafka0102/onespec init . --scope project --language en
```

### 2. Install the bundled OneSpec skills into your agent

Supported platform ids:

- `codex`
- `claude-code`
- `cursor`
- `gemini-cli`
- `github-copilot`

Project install for Codex:

```bash
onespec init . --scope project --language en --yes
```

Global install for Codex:

```bash
onespec init --scope global --language en --yes
```

Project install for Claude Code:

```bash
onespec init . --platform claude-code --scope project --language en --yes
```

Global install for Claude Code:

```bash
onespec init --platform claude-code --scope global --language en --yes
```

Project install for Cursor, Gemini CLI, or GitHub Copilot:

```bash
onespec init . --platform cursor --scope project --language en --yes
onespec init . --platform gemini-cli --scope project --language en --yes
onespec init . --platform github-copilot --scope project --language en --yes
```

Global install for Cursor, Gemini CLI, or GitHub Copilot:

```bash
onespec init --platform cursor --scope global --language en --yes
onespec init --platform gemini-cli --scope global --language en --yes
onespec init --platform github-copilot --scope global --language en --yes
```

Project skill locations:

- Codex, Cursor, Gemini CLI, GitHub Copilot: `.agents/skills/`
- Claude Code: `.claude/skills/`

If you omit `--yes`, `onespec init` runs in interactive mode and can prompt for overwrite, language, scope, OpenSpec CLI setup, and Superpowers installation. Use `--platform` whenever you target a non-default agent.

### 3. Install the required Superpowers skills

For the full workflow, install Superpowers for the same agent:

```bash
npx skills add obra/superpowers -a codex -y
```

For global Codex usage:

```bash
npx skills add obra/superpowers -a codex -g -y
```

For Claude Code:

```bash
npx skills add obra/superpowers -a claude-code -y
```

For global Claude Code usage:

```bash
npx skills add obra/superpowers -a claude-code -g -y
```

For Cursor:

```bash
npx skills add obra/superpowers -a cursor -y
```

For Gemini CLI:

```bash
npx skills add obra/superpowers -a gemini-cli -y
```

For GitHub Copilot:

```bash
npx skills add obra/superpowers -a github-copilot -y
```

### 4. Initialize OpenSpec in the project

If the target project does not already have an OpenSpec workspace:

```bash
openspec init .
```

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
```

The router skill chooses the next phase by intent:

- New requirement, proposal, or scope definition: `onespec-design`
- Start or continue implementation: `onespec-execute`
- Review, closeout, worktree deletion, or archive: `onespec-archive`

For non-supported agents, you can still copy the bundled skills manually into that agent's skill directory if it supports `SKILL.md`, but `onespec doctor` will not validate that environment yet.

## Workflow Execution

### 1. Recover state first

Each run checks for existing OneSpec state instead of relying on chat history. Active change state is stored in:

```text
openspec/changes/<change-id>/.onespec.yaml
```

That file keeps phase, handoff data, and touched-file tracking until the change is archived.

### 2. Design phase

`onespec-design` handles requirement clarification, ambiguity scan, `proposal.md`, `design.md`, `tasks.md`, and spec delta generation. After the artifacts are ready, it recommends whether execution should use Superpowers or direct OpenSpec apply.

### 3. Execute phase

`onespec-execute` only works from approved OpenSpec scope. It restores or creates an executable implementation plan, carries out the work, and syncs task and file state back into OpenSpec.

### 4. Review and archive phase

`onespec-archive` handles final review, feedback follow-up, worktree cleanup, and archive. Destructive closeout actions are gated behind explicit user confirmation.

## Core Capabilities

- Bundled workflow skills: router, design, execute, and archive are installed together.
- Project scaffolding: project installs create `docs/superpowers/specs` and `docs/superpowers/plans`.
- Environment checks: `onespec doctor` reports missing OneSpec skills, OpenSpec CLI/project setup, and required Superpowers skills for Codex, Claude Code, Cursor, Gemini CLI, and GitHub Copilot.
- Localized skill bundle: `onespec init` supports `--language zh|en`.
- Controlled runtime state: OneSpec keeps execution handoff and touched-file state in `.onespec.yaml` until archive cleanup.

## Requirements

- Node.js `>=20`
- Codex, Claude Code, Cursor, Gemini CLI, or GitHub Copilot for first-class CLI support
- OpenSpec CLI for OpenSpec project workflows
- Superpowers skills for the full recommended execution path

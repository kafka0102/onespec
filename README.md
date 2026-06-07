# OneSpec

> 中文说明见 [README-zh.md](README-zh.md)

OneSpec is a Codex-focused workflow package that connects OpenSpec change management with Superpowers execution discipline. It ships:

- a CLI installer: `onespec init`
- four skills: `onespec`, `onespec-design`, `onespec-execute`, `onespec-archive`
- bilingual skill bundles: English and Chinese

## What Changed

This repo now supports the same two installation models you were asking about:

1. `npx @your-scope/onespec init`
   This is the npm CLI path. You publish the package to npm, then users run the installer through `npx`.
2. `npx skills add <repo>/tree/main/assets/skills`
   This is the raw skill-package path. Users install the skill bundle directly from the repo. No npm publish is required for this path.

Those are different integration surfaces. You can support both at the same time.

## Install Requirements

- Node.js 20+
- Codex
- OpenSpec CLI
- Superpowers skills

## Guided Installer

After publishing to npm, users can run:

```bash
npx @kafka0102/onespec init
```

Or, if installed globally:

```bash
npm install -g @kafka0102/onespec
onespec init
```

The installer currently supports Codex and guides the user through:

- install scope: `project` or `global`
- skill language: `zh` or `en`
- whether to overwrite existing OneSpec skills
- whether to install OpenSpec CLI if missing
- whether to run `openspec init` for the current project
- whether to install Superpowers for Codex if missing

Non-interactive examples:

```bash
npx @your-scope/onespec init . --yes --scope project --language zh
npx @your-scope/onespec init . --yes --scope global --language en --overwrite
```

Doctor:

```bash
npx @your-scope/onespec doctor . --scope project
```

## Direct Skill Distribution

If you want users to install the skill bundle without your CLI, expose this repository and let them point `skills add` at the bundle directory.

Chinese bundle:

```bash
npx skills add <owner>/<repo>/tree/main/assets/skills -a codex -y
```

English bundle:

```bash
npx skills add <owner>/<repo>/tree/main/assets/skills-en -a codex -y
```

This path does not require publishing to npm. The repo itself is the package source.

## Where To Publish

If you want `npx @your-scope/onespec init`:

- publish this package to npm
- keep the CLI entry in `bin/onespec.js`
- keep `assets/`, `bin/`, and `src/` in the published files list

If you want `npx skills add ...`:

- publish the repo to GitHub, GitLab, or another Git host reachable by `skills add`
- no extra tarball step is required
- users can install from the repo root or directly from `assets/skills` / `assets/skills-en`

If you want both, publish both. That is the closest model to `comet`.

## Suggested Release Model

Use both channels:

1. npm package for the guided installer
2. Git repo for direct skill-bundle installation

That gives you:

- guided onboarding
- dependency checks
- language selection
- simple updates through npm
- a zero-installer fallback for users who already manage skills with `skills add`

## Local Development

Run locally without publishing:

```bash
node bin/onespec.js init . --yes --scope project --language en
node bin/onespec.js doctor . --scope project
```

Or install a linked dev command:

```bash
npm link
onespec init .
```

## Installed Paths

Project scope:

```text
<project>/.codex/skills/onespec
<project>/.codex/skills/onespec-design
<project>/.codex/skills/onespec-execute
<project>/.codex/skills/onespec-archive
```

Global scope:

```text
~/.codex/skills/onespec
~/.codex/skills/onespec-design
~/.codex/skills/onespec-execute
~/.codex/skills/onespec-archive
```

Project installs also create:

```text
<project>/docs/superpowers/plans
<project>/docs/superpowers/specs
```

## Current Scope

- platform support in the installer: Codex only
- direct `skills add` bundle support: yes
- installer language support: Chinese and English

## Publishing Checklist

1. Replace the placeholder npm name `@your-scope/onespec` in [package.json](/Users/yujianjia/workspace/kafka/onespec/package.json:1) with your real scope/package.
2. Publish to npm: `npm publish --access public`
3. Push the repo to your Git host
4. Update the README commands to use your real package/repo names

## Usage

After installation, restart Codex and use:

```text
use onespec: <your task>
```

# OneSpec

> 中文说明见 [README-zh.md](README-zh.md)

OneSpec is a Codex skill package for running an OpenSpec + Superpowers workflow.

## Install

Use one of these installation methods.

### Via `npm install -g`

Install the CLI globally:

```bash
npm install -g @kafka0102/onespec
```

Then install the bundled skills into Codex:

```bash
onespec init --scope global --yes
```

Or install into the current project only:

```bash
onespec init . --scope project --yes
```

### Via `npx`

If you publish the package to npm:

```bash
npx @kafka0102/onespec init
```

### Via Repository Source

Install the skill bundle directly from this repository:

```bash
npx skills add https://github.com/kafka0102/onespec/tree/main/assets/skills-en -a codex -y
```

For the Chinese bundle:

```bash
npx skills add https://github.com/kafka0102/onespec/tree/main/assets/skills -a codex -y
```

The `skills` CLI does not parse `owner/repo/tree/<ref>/...` shorthand correctly. Use the full GitHub URL above, or the shorthand form with an explicit ref such as `kafka0102/onespec/assets/skills#main`.

## Use

`npm install -g @kafka0102/onespec` only installs the `onespec` CLI.
`onespec init` is the step that copies the bundled skills into Codex.

After `onespec init`, restart Codex and invoke the OneSpec skills in your task.
During active work, OneSpec keeps runtime state in `openspec/changes/<change-id>/.onespec.yaml`; archive is the point where that file is cleaned up.

## Release

To publish from GitHub Actions:

1. Add repository secret `NPM_TOKEN` with an npm automation token that can publish `@kafka0102/onespec`.
2. Update `package.json` version.
3. Create and push a matching tag such as `v0.1.1`.

```bash
git tag v0.1.1
git push origin main --tags
```

The workflow at `.github/workflows/publish.yml` runs on `v*` tags, checks that the tag matches `package.json`, runs `npm test`, previews the published package, and then publishes to npm.

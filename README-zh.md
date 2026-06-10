# OneSpec

> English version: [README.md](README.md)

OneSpec 是一个面向 agent 的 skill bundle 和 CLI，用来执行 OpenSpec + Superpowers 工作流。它会安装 `onespec`、`onespec-design`、`onespec-execute`、`onespec-archive` 四个内置 skill，并把 AI Coding 任务路由到设计、执行和归档阶段。

当前官方支持的平台：

- Codex
- Claude Code
- Cursor
- Gemini CLI
- GitHub Copilot

技能包本体是标准 `SKILL.md` 加 shell 脚本，因此也可以移植到其他兼容 `SKILL.md` 的 agent；`onespec init` 和 `onespec doctor` 现在会直接管理上面这 5 个平台。

## 这个 Skill 是做什么的

- 把用户请求路由到正确的工作流阶段。
- 用 OpenSpec 作为范围、审批、规格和归档语义的事实来源。
- 用 Superpowers 处理高歧义需求澄清、实现计划、TDD 和工程执行约束。
- 在归档前，把每个 change 的运行时状态保存在 `openspec/changes/<change-id>/.onespec.yaml`。

## 安装

### 1. 安装 CLI

```bash
npm install -g @kafka0102/onespec
```

也可以直接通过 `npx` 运行：

```bash
npx @kafka0102/onespec init . --scope project --language zh
```

### 2. 把 OneSpec 内置 skill 安装到你的 agent

支持的 `--platform` 标识：

- `codex`
- `claude-code`
- `cursor`
- `gemini-cli`
- `github-copilot`

安装到当前项目的 Codex：

```bash
onespec init . --scope project --language zh --yes
```

全局安装到 Codex：

```bash
onespec init --scope global --language zh --yes
```

安装到当前项目的 Claude Code：

```bash
onespec init . --platform claude-code --scope project --language zh --yes
```

全局安装到 Claude Code：

```bash
onespec init --platform claude-code --scope global --language zh --yes
```

安装到当前项目的 Cursor / Gemini CLI / GitHub Copilot：

```bash
onespec init . --platform cursor --scope project --language zh --yes
onespec init . --platform gemini-cli --scope project --language zh --yes
onespec init . --platform github-copilot --scope project --language zh --yes
```

全局安装到 Cursor / Gemini CLI / GitHub Copilot：

```bash
onespec init --platform cursor --scope global --language zh --yes
onespec init --platform gemini-cli --scope global --language zh --yes
onespec init --platform github-copilot --scope global --language zh --yes
```

项目级 skill 目录：

- Codex、Cursor、Gemini CLI、GitHub Copilot：`.agents/skills/`
- Claude Code：`.claude/skills/`

如果不加 `--yes`，`onespec init` 会进入交互模式，依次询问安装范围、语言、是否覆盖、是否补装 OpenSpec CLI，以及是否安装 Superpowers。要安装到非默认平台，请显式加上 `--platform`。

### 3. 安装必需的 Superpowers skill

完整工作流依赖与当前 agent 对应的 Superpowers：

```bash
npx skills add obra/superpowers -a codex -y
```

如果你按全局方式使用 Codex：

```bash
npx skills add obra/superpowers -a codex -g -y
```

如果你使用 Claude Code：

```bash
npx skills add obra/superpowers -a claude-code -y
```

如果你按全局方式使用 Claude Code：

```bash
npx skills add obra/superpowers -a claude-code -g -y
```

如果你使用 Cursor：

```bash
npx skills add obra/superpowers -a cursor -y
```

如果你使用 Gemini CLI：

```bash
npx skills add obra/superpowers -a gemini-cli -y
```

如果你使用 GitHub Copilot：

```bash
npx skills add obra/superpowers -a github-copilot -y
```

### 4. 初始化 OpenSpec 项目

如果目标项目还没有 OpenSpec 工作区：

```bash
openspec init .
```

## 如何使用

先检查环境：

```bash
onespec doctor . --scope project
```

如果目标不是 Codex，请额外加上 `--platform <agent>`。

执行完 `onespec init` 后，重启当前 agent 会话，然后直接用自然语言调用，例如：

```text
使用 onespec：设计一个登录审计功能
使用 onespec：执行已批准的登录审计 change
使用 onespec：评审并归档登录审计 change
```

路由 skill 会根据意图切到对应阶段：

- 新需求、proposal、范围定义：`onespec-design`
- 开始实现或继续实现：`onespec-execute`
- 评审、收尾、删除 worktree、归档：`onespec-archive`

对于未被 `onespec init` / `onespec doctor` 官方接管的 agent，如果它支持 `SKILL.md`，也可以手动复制技能包到对应目录；只是当前 CLI 不会替你做环境校验。

## 流程执行过程

### 1. 先恢复状态

每次进入都会优先检查已有 OneSpec 状态，而不是依赖聊天历史。活动 change 的状态文件位于：

```text
openspec/changes/<change-id>/.onespec.yaml
```

这里会保存阶段、handoff 信息和 touched files，直到 change 真正 archive。

### 2. 设计阶段

`onespec-design` 负责需求澄清、歧义扫描、生成 `proposal.md`、`design.md`、`tasks.md` 和 spec delta。产物完成后，它还会给出后续应该走 Superpowers 还是直接 `OpenSpec apply` 的建议。

### 3. 执行阶段

`onespec-execute` 只在已批准的 OpenSpec 范围内工作。它会恢复或生成可执行的实现计划，推进实现，并把任务状态和文件状态同步回 OpenSpec。

### 4. 评审与归档阶段

`onespec-archive` 负责最终评审、处理反馈、清理 worktree 和执行归档。有后果的收尾动作都需要用户明确确认。

## 核心功能点

- 内置工作流技能包：路由、设计、执行、归档四个 skill 一起安装。
- 项目目录初始化：项目级安装会创建 `docs/superpowers/specs` 和 `docs/superpowers/plans`。
- 环境自检：`onespec doctor` 会检查 Codex / Claude Code / Cursor / Gemini CLI / GitHub Copilot 下的 OneSpec skill、OpenSpec CLI / 项目初始化状态，以及必需的 Superpowers skill。
- 中英文切换：`onespec init` 支持 `--language zh|en`。
- 运行时状态受控：执行阶段的 handoff 和 touched files 会持续写入 `.onespec.yaml`，直到归档清理。

## 要求

- Node.js `>=20`
- 官方支持 Codex、Claude Code、Cursor、Gemini CLI、GitHub Copilot
- 需要 OpenSpec CLI 才能跑 OpenSpec 项目工作流
- 推荐安装完整 Superpowers skill 以走完整执行路径

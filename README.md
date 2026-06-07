# OneSpec

OneSpec 是一组中文 Codex Skills，用于把 OpenSpec 的变更生命周期和 Superpowers 的工程执行流程串起来。`onespec` 负责组合路由，`onespec-design`、`onespec-execute`、`onespec-archive` 分别负责设计提案、执行实现、评审归档。

## 安装要求

- Node.js 20 或更高版本
- Codex
- OpenSpec CLI
- Superpowers 相关 Skills：`brainstorming`、`writing-plans`、`using-git-worktrees`、`subagent-driven-development`、`executing-plans`、`test-driven-development`

## 安装 Skill

### 方式一：通过安装器安装

在本仓库中安装 `onespec` 命令：

```bash
npm link
```

安装到当前项目：

```bash
onespec init /path/to/your/project --yes --scope project
```

项目级安装会把 Skill 写入：

```text
/path/to/your/project/.codex/skills/onespec
/path/to/your/project/.codex/skills/onespec-design
/path/to/your/project/.codex/skills/onespec-execute
/path/to/your/project/.codex/skills/onespec-archive
```

同时会创建工作目录：

```text
/path/to/your/project/docs/superpowers/plans
/path/to/your/project/docs/superpowers/specs
```

安装到全局 Codex Skills 目录：

```bash
onespec init --yes --scope global
```

全局安装会把 Skill 写入：

```text
~/.codex/skills/onespec
~/.codex/skills/onespec-design
~/.codex/skills/onespec-execute
~/.codex/skills/onespec-archive
```

如果已安装过并需要覆盖：

```bash
onespec init /path/to/your/project --yes --overwrite --scope project
```

### 方式二：不安装命令，直接运行本仓库脚本

```bash
node /path/to/onespec/bin/onespec.js init /path/to/your/project --yes --scope project
```

全局安装：

```bash
node /path/to/onespec/bin/onespec.js init --yes --scope global
```

### 方式三：手动复制 Skill

项目级安装：

```bash
mkdir -p /path/to/your/project/.codex/skills
cp -R assets/skills/onespec assets/skills/onespec-design assets/skills/onespec-execute assets/skills/onespec-archive /path/to/your/project/.codex/skills/
chmod +x /path/to/your/project/.codex/skills/onespec/scripts/*.sh
```

全局安装：

```bash
mkdir -p ~/.codex/skills
cp -R assets/skills/onespec assets/skills/onespec-design assets/skills/onespec-execute assets/skills/onespec-archive ~/.codex/skills/
chmod +x ~/.codex/skills/onespec/scripts/*.sh
```

## 检查安装

项目级检查：

```bash
onespec doctor /path/to/your/project --scope project
```

全局检查：

```bash
onespec doctor --scope global
```

如果没有安装 `onespec` 命令，也可以直接运行：

```bash
node /path/to/onespec/bin/onespec.js doctor /path/to/your/project --scope project
```

## 使用

安装完成后，重启 Codex 以加载新的 Skill。

在 Codex 中输入：

```text
使用 onespec：<你的任务描述>
```

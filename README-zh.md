# OneSpec

> English version: [README.md](README.md)

OneSpec 是一个面向 Codex 的工作流包，把 OpenSpec 的变更管理和 Superpowers 的工程执行串起来。它现在同时提供：

- 一个 CLI 安装器：`onespec init`
- 四个 skills：`onespec`、`onespec-design`、`onespec-execute`、`onespec-archive`
- 中英文双语 skill bundle

## 现在支持的两种分发方式

这也是你提到的 `comet` 模式里最关键的两条线：

1. `npx @your-scope/onespec init`
   这是 npm CLI 分发。你需要把整个包发布到 npm，用户通过 `npx` 运行安装器。
2. `npx skills add <owner>/<repo>/tree/main/assets/skills`
   这是纯 skill 包分发。用户直接从仓库安装 skill bundle，不需要再发布 npm 包。

这两条不是同一个东西，但可以同时支持。`comet` 本质上也是同时走这两条路径。

## 安装要求

- Node.js 20+
- Codex
- OpenSpec CLI
- Superpowers skills

## 引导式安装

发布到 npm 后，用户可以直接运行：

```bash
npx @kafka0102/onespec init
```

或者先全局安装：

```bash
npm install -g @kafka0102/onespec
onespec init
```

当前安装器支持 Codex，并会引导用户完成：

- 选择安装范围：`project` 或 `global`
- 选择 skill 语言：`zh` 或 `en`
- 检查是否覆盖已有 OneSpec skills
- 检查是否安装 OpenSpec CLI
- 检查当前项目是否需要执行 `openspec init`
- 检查是否安装 Superpowers

无交互示例：

```bash
npx @your-scope/onespec init . --yes --scope project --language zh
npx @your-scope/onespec init . --yes --scope global --language en --overwrite
```

环境检查：

```bash
npx @your-scope/onespec doctor . --scope project
```

## 纯 Skill 安装

如果你不想让用户先装 CLI，也可以直接把这个仓库作为 skill 包源。

中文 bundle：

```bash
npx skills add <owner>/<repo>/tree/main/assets/skills -a codex -y
```

英文 bundle：

```bash
npx skills add <owner>/<repo>/tree/main/assets/skills-en -a codex -y
```

这条路径不需要 npm 发布，也不需要额外打包上传压缩包。仓库本身就是 skill 包。

## 需要发布到哪里

如果你要支持 `npx @your-scope/onespec init`：

- 发布到 npm
- 保留 `bin/onespec.js` 作为 CLI 入口
- 保证发布内容包含 `assets/`、`bin/`、`src/`

如果你要支持 `npx skills add ...`：

- 把仓库发布到 GitHub / GitLab / 其他 `skills add` 可访问的 Git 仓库
- 不需要额外上传 tarball
- 用户可以直接从仓库根目录，或从 `assets/skills`、`assets/skills-en` 子目录安装

如果你两种都要，就同时发布 npm 包和 Git 仓库。这就是最接近 `comet` 的对接方式。

## 推荐的对接方案

建议保留双通道：

1. npm 包：负责引导安装、依赖检测、语言选择
2. Git 仓库：负责直接 skill 分发

这样同时满足：

- 新用户的一键引导
- OpenSpec / Superpowers 检测
- 中文 / 英文切换
- `npx` 更新体验
- 已经习惯 `skills add` 用户的直接安装路径

## 本地开发

本地直接运行：

```bash
node bin/onespec.js init . --yes --scope project --language en
node bin/onespec.js doctor . --scope project
```

或者链接成开发命令：

```bash
npm link
onespec init .
```

## 安装后的路径

项目级安装：

```text
<project>/.codex/skills/onespec
<project>/.codex/skills/onespec-design
<project>/.codex/skills/onespec-execute
<project>/.codex/skills/onespec-archive
```

全局安装：

```text
~/.codex/skills/onespec
~/.codex/skills/onespec-design
~/.codex/skills/onespec-execute
~/.codex/skills/onespec-archive
```

项目级安装还会创建：

```text
<project>/docs/superpowers/plans
<project>/docs/superpowers/specs
```

## 当前范围

- 安装器支持的平台：仅 Codex
- `skills add` 直接安装：支持
- 安装器语言：中文、英文

## 发布前清单

1. 把 [package.json](/Users/yujianjia/workspace/kafka/onespec/package.json:1) 里的占位包名 `@your-scope/onespec` 改成你的真实 npm 包名
2. 发布 npm：`npm publish --access public`
3. 推送仓库到 Git 平台
4. 把 README 里的占位命令替换成你的真实包名和仓库地址

## 使用

安装后重启 Codex，然后使用：

```text
使用 onespec：<你的任务描述>
```

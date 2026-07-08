# OneSpec

> English version: [README.md](README.md)

OneSpec 是一个 CLI 和 agent skill bundle，用来运行 OpenSpec + Superpowers 工作流。

## 功能特点

### `onespec`

`onespec` 把 OpenSpec 从一组需要人工串起来的命令，变成 agent 可以执行的完整工作流。它会准备 design、spec 和 tasks，在实现前让人确认设计，并根据复杂度自动推荐实现方式和执行路径，然后继续推进实现、验收和归档。

适合需要正常设计确认和 review 验收的 change。你只需要用自然语言调用工作流，不需要手动连续执行多个 OpenSpec 命令。

### `onespec-fast`

`onespec-fast` 是明确要求自动贯通的 OpenSpec change 的更短路径。它会创建必要的 OpenSpec 上下文，跳过复杂度检查，全程使用原生 `OpenSpec apply`，完成验证后直接归档。

## 流程示意

`onespec`

```
用户需求 -> 歧义分析 -> superpowers:brainstorming(高歧义时) -> openspec::propose -> 复杂度分析+路径推荐 -> 🧑 批准 Gate -> [ Superpowers: writing-plans -> subagent-driven-development / executing-plans (TDD) | 原生 OpenSpec: openspec::apply ] -> 🧑 实现完成 Gate -> openspec::archive
```

`onespec-fast`

```
快速请求 -> openspec::propose -> openspec::apply -> 测试 + validate -> openspec::archive
（全程无人工 Gate）
```

## 安装

需要：

- Node.js 20+
- npm / npx
- 可用 `bash` 的 shell

全局安装：

```bash
npm install -g @kafka0102/onespec
```

不做全局安装，直接用 `npx` 运行：

```bash
npx -y @kafka0102/onespec init
```

如果使用 `npx`，其他命令也可以同样写，例如：

```bash
npx -y @kafka0102/onespec doctor . --scope project
```

## 快速开始

```bash
cd your-project
onespec init
```

然后运行：

```bash
onespec doctor . --scope project
```

执行完 `onespec init` 后，重启当前 agent 会话，然后直接用自然语言调用，例如：

```text
使用 onespec：设计一个登录审计功能
使用 onespec：执行已批准的登录审计 change
使用 onespec：评审并归档登录审计 change
使用 onespec-fast：添加一个校验提示
```

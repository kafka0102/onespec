---
name: onespec
description: 当用户需要用 OpenSpec 与 Superpowers 管理完整 AI Coding 变更生命周期，或不确定应进入设计、执行、归档还是 fast path 时使用。
---

# OneSpec 工作流

OneSpec 是单一入口 Skill。它负责恢复状态、判断阶段，并按需读取 `references/` 下的阶段模块；不要再调用已废弃的阶段子 Skill。

开始时说明：

> 我正在使用 `onespec` 工作流。

## 恢复优先

每次进入先检查状态，不依赖聊天历史：

```bash
ONESPEC_ENV="${ONESPEC_ENV:-$(find . "$HOME"/.codex "$HOME"/.claude "$HOME"/.cursor "$HOME"/.gemini "$HOME"/.copilot "$HOME"/.agents "$HOME"/.config -path '*/onespec/scripts/onespec-env.sh' -type f -print -quit 2>/dev/null)}"
. "$ONESPEC_ENV"
"$ONESPEC_BASH" "$ONESPEC_STATE" list
```

如果发现相关 change，运行：

```bash
"$ONESPEC_BASH" "$ONESPEC_STATE" recover <change-id>
```

运行时状态文件是 `openspec/changes/<change-id>/.onespec.yaml`。handoff 摘要、哈希和 touched files 都写回这里；archive 前保留，archive 后删除。
`recover` 的输出是执行合同，不是参考信息。至少先读取 `phase`、`next_skill`、`next_reference`、`next_gate` 与 `allowed_actions`，再决定是否继续。

## 阶段路由

先判断当前请求属于哪一类：

- `propose`：定义新 change、梳理范围、生成 `proposal.md`、`design.md`、`tasks.md` 与 spec delta。读取 `references/design.md`。
- `apply`：实现已批准 change、继续已有 change、生成或恢复 Superpowers plan、回填 OpenSpec 状态。读取 `references/execute.md`。
- `review-closeout`：用户评审、处理反馈、删除 worktree 或执行归档。读取 `references/archive.md`。
- `fast`：用户明确要求 `onespec-fast`、快速路径、fast apply 或低复杂度自动贯通时。读取 `references/fast.md`；独立 `onespec-fast` 入口也转入同一 reference。

如果用户意图不清，只问一个简短问题，不要同时问多个。

默认意图映射：

- 用户说“新需求”、“设计一下”、“写 proposal / spec”、“定义 change”时，读取 `references/design.md`。
- 用户说“开始实现”、“执行这个 change”、“apply 这个 proposal / change”、“继续做这个 change”、“开始 coding / 开发”、“make plan”时，读取 `references/execute.md`。如果 proposal 尚未批准，必须停止并转回 `references/design.md` 的批准 gate。
- 用户说“review”、“收尾”、“归档”、“archive”、“删除 worktree”时，读取 `references/archive.md`。
- 用户明确说“onespec-fast”、“快速路径”、“fast apply”或“低复杂度自动贯通”时，读取 `references/fast.md`。

## Reference 读取规则

- 每次只读取当前阶段需要的一个 reference；不要预读其他阶段。
- 如果 `recover` 输出 `next_reference`，默认先读取它；只有用户当前请求明确改变阶段，且上一阶段 gate 已完成时，才允许覆盖。
- `references/fast.md` 可以复用 `design.md`、`execute.md` 和 `archive.md` 的过程段，但 fast path 会覆盖普通 proposal approval、review pause 和 closeout menu gate。
- 如果需要跨阶段校验，只读取与 gate 直接相关的最小段落。

## 共同约束

- OpenSpec 负责“要做什么”、formal artifacts、approval gate、spec delta 与归档语义。
- Superpowers 负责高歧义需求澄清、实现计划、TDD、分任务 review 与工程执行质量。
- 不要询问变更名称。根据任务自动生成简短短横线命名的 `change-id`，如冲突则追加数字。
- 读取最少必要上下文：`openspec/config.yaml`、`openspec/project.md`、相关 `openspec/specs/**`、项目入口文档、当前分支和工作区状态。
- 只问会改变 proposal、执行路径、分支处理或归档结果的问题。
- 当共同规则与阶段规则冲突时，以当前阶段 reference 的停止条件为准。
- 每个阶段 reference 定义了强制暂停 gate（如 `references/execute.md` 的“实现完成 Gate”、`references/design.md` 的“批准 Gate”）。路由进入下一阶段前，必须确认上一阶段的 gate 已完成。如果 gate 未完成就试图进入下一阶段，必须拒绝并指出缺失步骤。

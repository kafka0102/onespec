---
name: onespec
description: 当用户需要用 OpenSpec 与 Superpowers 管理完整 AI Coding 变更生命周期，或不确定应进入设计、执行还是归档阶段时使用。
---

# OneSpec 工作流

OneSpec 是组合路由 Skill。它只负责恢复状态、判断阶段并切换到 `onespec-design`、`onespec-execute` 或 `onespec-archive`；具体阶段规则以对应子 Skill 为准。

开始时说明：

> 我正在使用 `onespec` 工作流。

## 恢复优先

每次进入先检查状态，不依赖聊天历史：

```bash
ONESPEC_ENV="${ONESPEC_ENV:-$(find . "$HOME"/.codex "$HOME"/.agents "$HOME"/.config -path '*/onespec/scripts/onespec-env.sh' -type f -print -quit 2>/dev/null)}"
. "$ONESPEC_ENV"
"$ONESPEC_BASH" "$ONESPEC_STATE" list
```

如果发现相关 change，运行：

```bash
"$ONESPEC_BASH" "$ONESPEC_STATE" recover <change-id>
```

状态文件位置：`openspec/changes/<change-id>/.onespec.yaml`。上下文包位置：`openspec/changes/<change-id>/.onespec/handoff/`。优先读取 `*-context.md`，只在状态或哈希变化时重新生成 handoff。

## 阶段路由

先判断当前请求属于哪一类：

- `propose`：定义新 change、梳理范围、生成 `proposal.md`、`design.md`、`tasks.md` 与 spec delta。使用 `onespec-design`。
- `apply`：实现已批准 change、继续已有 change、生成或恢复 Superpowers plan、回填 OpenSpec 状态。使用 `onespec-execute`。
- `review-closeout`：用户评审、处理反馈、归档、合并、保留分支或 worktree。使用 `onespec-archive`。

如果用户意图不清，只问一个简短问题，不要同时问多个。

默认意图映射：

- 用户说“新需求”、“设计一下”、“写 proposal / spec”、“定义 change”时，进入 `onespec-design`。
- 用户说“开始实现”、“执行这个 change”、“apply 这个 proposal / change”、“继续做这个 change”、“开始 coding / 开发”、“make plan”时，进入 `onespec-execute`。如果 proposal 尚未批准，`onespec-execute` 必须停止并转回 `onespec-design` 的批准 gate。
- 用户说“review”、“收尾”、“归档”、“archive”、“合并”、“保留分支”时，进入 `onespec-archive`。

## 共同约束

- OpenSpec 负责“要做什么”、formal artifacts、approval gate、spec delta 与归档语义。
- Superpowers 负责高歧义需求澄清、实现计划、TDD、分任务 review 与工程执行质量。
- 不要询问变更名称。根据任务自动生成简短短横线命名的 `change-id`，如冲突则追加数字。
- 读取最少必要上下文：`openspec/config.yaml`、`openspec/project.md`、相关 `openspec/specs/**`、项目入口文档、当前分支和工作区状态。
- 只问会改变 proposal、执行路径、分支处理或归档结果的问题。
- 当阶段规则冲突时，以当前阶段子 Skill 的停止条件为准。
- 每个阶段子 Skill 定义了强制暂停 gate（如 `onespec-execute` 的"实现完成 Gate"、`onespec-design` 的"批准 Gate"）。路由进入下一阶段前，必须确认上一阶段的 gate 已完成。如果 gate 未完成就试图进入下一阶段，必须拒绝并指出缺失步骤。

---
name: onespec-fast
description: 当用户明确要求使用 OneSpec 快速路径、onespec-fast、fast apply、低复杂度变更自动 proposal/开发/归档时使用。该 skill 会直接生成 OpenSpec proposal，不等待用户确认 proposal；完成复杂度检查后，只有低复杂度 change 才自动走原生 OpenSpec apply 并直接归档。
---

# OneSpec Fast

用于低复杂度 OneSpec change 的自动贯通路径。目标是省掉常规 proposal 批准 gate 和实现完成后的人工归档选择，但只在复杂度检查确认低复杂度时这样做。

开始时说明：

> 我正在使用 `onespec-fast` 快速路径。

## 1. 接入

先恢复状态：

```bash
ONESPEC_ENV="${ONESPEC_ENV:-$(find . "$HOME"/.codex "$HOME"/.claude "$HOME"/.cursor "$HOME"/.gemini "$HOME"/.copilot "$HOME"/.agents "$HOME"/.config -path '*/onespec/scripts/onespec-env.sh' -type f -print -quit 2>/dev/null)}"
. "$ONESPEC_ENV"
"$ONESPEC_BASH" "$ONESPEC_STATE" list
```

如果发现相关 change，运行：

```bash
"$ONESPEC_BASH" "$ONESPEC_STATE" recover <change-id>
```

`recover` 的输出是执行合同。至少读取 `phase`、`next_skill`、`next_gate` 与 `allowed_actions`。

适用规则：

- 仅在用户明确要求 `onespec-fast`、快速路径、fast apply、低复杂度自动贯通时使用。
- 不要询问 change 名称。根据任务自动生成简短短横线命名的 `change-id`，如冲突则追加数字。
- 读取最少必要上下文：`openspec/config.yaml`、`openspec/project.md`、相关 `openspec/specs/**`、项目入口文档、当前分支和工作区状态。
- 只有 OpenSpec 必需上下文缺失到无法写出有效 proposal、或项目文档明确禁止自动修改当前分支时才暂停。

## 2. 直接 Proposal

快速路径跳过常规 `onespec-design` 的 proposal 前用户确认。

必须直接进入 OpenSpec proposal 产出：

- `openspec/changes/<change-id>/proposal.md`
- `openspec/changes/<change-id>/design.md`，仅在确有技术设计价值时创建
- `openspec/changes/<change-id>/tasks.md`
- 必要的 `specs/**/spec.md`

创建状态与交接包：

```bash
"$ONESPEC_BASH" "$ONESPEC_STATE" init <change-id>
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> phase proposal-ready
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> ambiguity low
"$ONESPEC_BASH" "$ONESPEC_HANDOFF" <change-id> proposal --write
```

不要输出常规 proposal 批准菜单。`onespec-fast` 的用户意图表示“若复杂度为低复杂度，则授权继续开发并归档”。

## 3. 强制复杂度检查

proposal 产出后必须读取 task artifact 并进行复杂度检查。不得因为快速路径而跳过这一步。

复杂度输入：

- `openspec/changes/<change-id>/tasks.md`
- `proposal.md`
- `design.md`，如果存在
- 相关 `openspec/specs/**`
- 如果当前 schema 不是 `spec-driven`，读取 `openspec status --change "<change-id>" --json` 或 `openspec instructions apply --change "<change-id>" --json` 中定义的任务 artifact 或等价 apply context

复杂度分级：

- `低复杂度`：task 数量少，路径线性，单模块或少量文件改动，几乎没有跨层依赖，不涉及 migration / schema / 多端联动 / 手工上线顺序。
- `中复杂度`：少量跨模块或跨端协作，但边界清晰；可能需要分阶段验证或更严格 review。
- `高复杂度`：跨多个 workspace 或 capability，涉及 API、数据库、任务系统、共享包、视觉确认中的多个维度，或 task 依赖强。

必须输出：

- change id 与 artifact 位置
- task artifact 摘要
- 复杂度等级与具体原因
- 是否继续自动路径

## 4. 低复杂度自动开发与归档

只有复杂度为 `低复杂度` 时，才允许自动贯通。此时不要再要求用户确认 proposal 产物。

记录低复杂度快速路径：

```bash
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> complexity low
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> implementation_path openspec-apply
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> execution_method native
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> workspace current-branch
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> origin_branch "$(git branch --show-current || echo detached)"
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> origin_workspace_path "$(pwd -P)"
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> origin_workspace_mode current-branch
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> phase approved
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> phase implementing
```

实现规则：

- 使用原生 `OpenSpec apply` 路径，不生成 Superpowers plan，不派发 subagent。
- 只实现 `tasks.md` 中的未完成任务，不扩大 proposal 范围。
- 直接修改当前工作区；不自动创建 worktree，不自动 push，不自动 merge。
- 如果当前分支是 `main`/`master`，把 `origin_workspace_mode` 改记为 `main-override`，但只有项目文档明确禁止直接修改主分支时才暂停。
- 本次直接修改的仓库相对路径写入 `.onespec.yaml`，优先使用：

```bash
"$ONESPEC_BASH" "$ONESPEC_COMMIT" track <change-id> <path>...
```

实现完成后必须：

- 勾选 `tasks.md` 中已完成的任务。
- 如实现暴露新的设计冲突，停止自动路径，修正 OpenSpec artifacts，并转入常规 `onespec-design` / `onespec-execute` gate。
- 运行项目测试。
- 运行 `openspec validate <change-id> --strict`。
- 写入 review handoff，但不要暂停等待用户评审：

```bash
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> phase review
"$ONESPEC_BASH" "$ONESPEC_HANDOFF" <change-id> review --write
```

随后直接归档，不展示 `onespec-archive` 的收尾菜单：

```bash
"$ONESPEC_BASH" "$ONESPEC_COMMIT" related-dirty <change-id>
"$ONESPEC_BASH" "$ONESPEC_COMMIT" commit-related <change-id> closeout
"$ONESPEC_BASH" "$ONESPEC_CLOSEOUT" run-actions <change-id> archive-only
```

如果 `related-dirty` 为空，不需要执行 `commit-related <change-id> closeout`。`run-actions` 会把状态置为 `archived` / `archive archived`，并负责 archive 后提交与 runtime cleanup。

## 5. 中高复杂度回退

如果复杂度不是 `低复杂度`：

- 不要自动实现。
- 不要自动归档。
- 记录实际复杂度：

```bash
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> complexity <medium|high>
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> phase proposal-ready
```

- 明确说明 fast path 已停止，并切回常规 OneSpec gate。
- 使用 `onespec-design` 的 Proposal 批准 Gate 与路径选择菜单，让用户显式批准 proposal / design / spec 后再进入实现。

## 6. 停止条件

以下情况必须暂停：

- OpenSpec 必需上下文缺失，无法写出有效 proposal。
- 用户请求明显跨多个应该拆开的 change。
- 复杂度为中复杂度或高复杂度。
- 测试或 `openspec validate <change-id> --strict` 未通过且无法在已批准范围内修复。
- 实现过程中发现需要扩大 scope、改变 design 或修改 spec 语义。
- 项目文档明确禁止当前分支上的自动实现或自动归档。

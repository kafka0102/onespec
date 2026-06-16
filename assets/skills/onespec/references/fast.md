# Fast Path

供 `onespec` 和独立 `onespec-fast` 入口在 `fast` 路径按需读取。目标是省掉常规 Proposal 批准 Gate、实现路径选择和实现完成后的人工归档选择，但仍然保留一次强制复杂度检查。只有低复杂度 change 才允许继续原生 `OpenSpec apply` 自动开发并直接归档；中高复杂度必须回退到常规 `onespec` 路径。

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

`recover` 的输出是执行合同。至少读取 `phase`、`next_skill`、`next_reference`、`next_gate` 与 `allowed_actions`。

适用规则：

- 仅在用户明确要求 `onespec-fast`、快速路径、fast apply、OpenSpec 自动 proposal/开发/归档或自动贯通时使用。
- 不要询问 change 名称。根据任务自动生成简短短横线命名的 `change-id`，如冲突则追加数字。
- 读取最少必要上下文：`openspec/config.yaml`、`openspec/project.md`、相关 `openspec/specs/**`、项目入口文档、当前分支和工作区状态。
- 只有 OpenSpec 必需上下文缺失到无法写出有效 proposal、或项目文档明确禁止自动修改当前分支时才暂停。

## 2. 直接 Proposal

快速路径跳过常规 design phase 的 proposal 前用户确认。

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

不要输出常规 proposal 批准菜单。`onespec-fast` 的用户意图表示授权继续使用原生 `OpenSpec apply` 开发并归档。

## 3. Proposal 批准 Gate

快速路径仍然有 Proposal 批准 Gate，但 gate 的通过条件不同：

- 只有当用户明确要求 `onespec-fast`、快速路径、fast apply、OpenSpec 自动 proposal/开发/归档或自动贯通时，才视为已经批准当前 proposal artifacts。
- 这个自动批准只对“继续执行强制复杂度检查”生效，不等于所有复杂度等级都可以自动实现。
- 不要展示常规 proposal 批准菜单，也不要再要求用户补发一次“批准”。

## 4. 强制复杂度检查

proposal 产出后，必须先读取 `tasks.md`、`proposal.md`、`design.md`（如果存在）并做一次强制复杂度检查。

判定规则沿用 `design.md` 中的复杂度标准：

- `低复杂度`：task 数量少、路径线性、单模块或少量文件改动、几乎没有跨层依赖，也不涉及 migration / schema / 多端联动。
- `中复杂度`：存在少量跨模块或跨端协作，边界清晰，但可能更适合分工、TDD、review gate 或分阶段验证。
- `高复杂度`：明显跨多个 workspace 或 capability，涉及 API、数据库、任务系统、共享包或多维度联动，task 依赖强。

记录复杂度：

```bash
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> complexity <low|medium|high>
```

只有 `低复杂度` 可以继续快速路径自动实现。`中复杂度` 或 `高复杂度` 必须回退。

## 5. 低复杂度自动开发与归档

如果强制复杂度检查结果是 `低复杂度`，不要切换到 Superpowers plan/subagent。直接记录快速路径并进入实现：

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
- 如实现暴露新的设计冲突，停止自动实现，修正 OpenSpec artifacts，并继续留在 OpenSpec proposal/apply 路径；只有用户另行要求时才切换到 Superpowers。
- 运行项目测试。
- 运行 `openspec validate <change-id> --strict`。
- 写入 review handoff，但不要暂停等待用户评审：

```bash
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> phase review
"$ONESPEC_BASH" "$ONESPEC_HANDOFF" <change-id> review --write
```

随后直接归档，不展示 archive phase 的收尾菜单：

```bash
"$ONESPEC_BASH" "$ONESPEC_COMMIT" related-dirty <change-id>
"$ONESPEC_BASH" "$ONESPEC_COMMIT" commit-related <change-id> closeout
"$ONESPEC_BASH" "$ONESPEC_CLOSEOUT" run-actions <change-id> archive-only
```

如果 `related-dirty` 为空，不需要执行 `commit-related <change-id> closeout`。`run-actions` 会把状态置为 `archived` / `archive archived`，并负责 archive 后提交与 runtime cleanup。

## 6. 中高复杂度回退

如果强制复杂度检查结果是 `中复杂度` 或 `高复杂度`，必须停止自动 apply / archive，并回退到常规 `onespec` 路径：

- 保留刚刚生成的 proposal / design / tasks / spec artifacts，不要删除。
- 保留 `phase proposal-ready`，并写入复杂度等级。
- 重新读取 `onespec/references/design.md` 的 `Proposal 批准 Gate 与路径选择`，按常规流程给出推荐组合和显式菜单。
- 只有用户随后明确接受常规推荐路径，或覆盖为其他组合时，才允许进入 `execute.md`。
- 不要在中高复杂度场景下继续强行使用 `implementation_path openspec-apply`、`execution_method native` 或自动 `archive-only`。

## 7. 停止条件

以下情况必须暂停：

- OpenSpec 必需上下文缺失，无法写出有效 proposal。
- 用户请求明显跨多个应该拆开的 change。
- 测试或 `openspec validate <change-id> --strict` 未通过且无法在已批准范围内修复。
- 实现过程中发现需要扩大 scope、改变 design 或修改 spec 语义。
- 项目文档明确禁止当前分支上的自动实现或自动归档。

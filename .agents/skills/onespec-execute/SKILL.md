---
name: onespec-execute
description: 当用户需要执行已批准 OpenSpec change、继续实现、生成 Superpowers plan、运行 OpenSpec apply、回填 tasks 或验证实现时使用。
---

# OneSpec Execute

用于 OneSpec 的执行阶段。目标是只在已批准范围内实现，并把实现结果回填 OpenSpec 状态。

开始时说明：

> 我正在使用 `onespec-execute` 处理 apply / implement 阶段。

## 1. Apply 路由

先恢复状态：

```bash
ONESPEC_ENV="${ONESPEC_ENV:-$(find . "$HOME"/.codex "$HOME"/.agents "$HOME"/.config -path '*/onespec/scripts/onespec-env.sh' -type f -print -quit 2>/dev/null)}"
. "$ONESPEC_ENV"
"$ONESPEC_BASH" "$ONESPEC_STATE" list
```

apply 前至少读取：

- `openspec/changes/<change-id>/proposal.md`
- `openspec/changes/<change-id>/tasks.md`
- `openspec/changes/<change-id>/design.md`，如果存在
- 相关 `openspec/specs/**`
- 相关 `docs/**`

默认意图映射：

- 用户说“开始实现”、“执行这个 change”、“apply 这个 proposal / change”、“继续做这个 change”、“开始 coding / 开发”、“make plan”时，默认解释为进入已批准 change 的 Superpowers 实现准备路径，而不是直接原生 `openspec apply`。
- 只有用户明确说“不用 Superpowers plan”、“不用 subagent”或“直接按 OpenSpec apply”时，才允许走原生 OpenSpec apply。
- 如果 proposal 阶段已经确认过实现路线，后续 apply 优先遵循该确认结果，不要用默认映射覆盖用户已确认的路线。

如果 proposal 尚未批准，直接停止，不要开始实现。

如果 proposal 阶段已经确认实现路径：

- 用户确认 `Superpowers`：继续 Superpowers Make Plan。
- 用户确认原生 `OpenSpec apply`：切换到原生 OpenSpec apply。
- 用户尚未确认：提醒当前推荐路线，并要求用户明确选择，不要直接开始实现。

## 2. Superpowers Make Plan 与实现

在 Superpowers 路径下，apply 默认不是“直接实现”，而是先把已批准的 OpenSpec change 翻译成 Superpowers 可执行计划。

必须执行：

- 读取并总结 `proposal.md`、`design.md`、`tasks.md`、相关 spec delta 与相关项目文档。
- 从 `tasks.md` 中提取未完成 task，作为 planning scope。
- 使用 `writing-plans` 或 `superpowers:writing-plans` 生成计划，保存到 `docs/superpowers/plans/YYYY-MM-DD-<change-id>.md`。
- 计划必须覆盖每个未完成 OpenSpec task，可拆细，但不得遗漏或扩大范围。
- 如果已有对应 plan，先检查它是否仍覆盖当前未完成 tasks；不覆盖就更新或重写。
- 如果 plan 与 OpenSpec artifacts 冲突，先修正 OpenSpec artifacts，再重写 plan。

记录计划并创建交接包：

```bash
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> plan <plan-path>
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> phase plan-ready
"$ONESPEC_BASH" "$ONESPEC_HANDOFF" <change-id> plan --write
```

如果 `origin_branch` 或 `origin_workspace_path` 仍是 `unknown`，则在真正创建 worktree、切换 branch 或开始实现前立即补记当前上下文：

```bash
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> origin_branch "$(git branch --show-current || echo detached)"
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> origin_workspace_path "$(pwd -P)"
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> origin_workspace_mode "$( "$ONESPEC_BASH" "$ONESPEC_STATE" get <change-id> workspace )"
```

默认执行路径：

- 优先使用 `subagent-driven-development`。
- 子 agent 按 task 执行时，强制遵守 `test-driven-development`。
- controller 在每个任务后做规格符合性评审和代码质量评审，再进入下一个任务。
- 如果用户明确要求不用 subagent，或任务强耦合到不适合逐 task 派发，说明原因后改用 `executing-plans`。
- 需要隔离时使用 `using-git-worktrees`，不要手写绕过它的安全检查。

实现完成后必须回填 OpenSpec artifacts：

- 在 `tasks.md` 中勾选本次完成的任务。
- 如果 Superpowers plan 将一个 OpenSpec task 拆成多步，只有对应实现、测试和必要 review 完成后，才允许回填该 OpenSpec task。
- 如果实现改变了已批准事实，先同步更新 `design.md`、`proposal.md` 或 spec delta，再继续。
- 不允许实现结果与已批准 OpenSpec 范围静默漂移。
- 运行项目测试和 `openspec validate <change-id> --strict`。
- 将状态置为 `review`，并生成 review handoff。

```bash
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> phase review
"$ONESPEC_BASH" "$ONESPEC_HANDOFF" <change-id> review --write
```

完成实现与验证后，必须明确暂停，不允许直接继续做 merge、删除 worktree、归档或“顺手收尾”。此时必须：

- 告诉用户当前所在分支与工作区路径。
- 如果当前分支或工作区路径不同于 `origin_branch` / `origin_workspace_path`，明确指出“当前实现位于临时分支或临时 worktree，请先在这里 review diff 与验证结果”。
- 只汇报实现结果、验证结果、当前分支/worktree 状态，以及“下一步应进入 `onespec-archive` 做 review-closeout”。
- 在用户完成 review 并明确要求收尾前，不允许擅自删除临时 worktree。

汇报时覆盖：

- 使用了哪一个 Superpowers plan 文件
- 本次完成了哪些 OpenSpec task
- 对 `tasks.md` 做了哪些回填
- 是否更新了 `proposal.md`、`design.md` 或 spec delta
- 测试与 `openspec validate <change-id> --strict` 是否通过
- 当前分支、当前工作区路径，以及它们是否不同于 `origin_branch` / `origin_workspace_path`
- 是否 ready for review-closeout

## 3. 原生 OpenSpec Apply

只有当用户选择 `OpenSpec apply`、接受低复杂度推荐，或明确拒绝 Superpowers 时，才允许走原生 OpenSpec apply。

原生 apply 执行后同样要：

- 勾选 `tasks.md`
- 如实现中暴露新的歧义或设计冲突，先暂停并修正 OpenSpec artifacts，必要时回到 brainstorming
- 运行项目测试
- 运行 `openspec validate <change-id> --strict`
- 进入用户评审
- 将状态置为 `review`

## 4. 停止条件

以下情况必须暂停并向用户说明：

- proposal 未批准但用户要求直接实现
- Superpowers plan 与已批准 OpenSpec artifacts 发生冲突
- `tasks.md` 尚未被翻译成可执行 Superpowers plan，但模型试图直接编码
- 实现过程中发现会改变 scope、design 或 spec 的新需求
- 测试或 `openspec validate <change-id> --strict` 未通过且尚未修复

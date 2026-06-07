---
name: onespec-archive
description: 当用户需要对 OneSpec change 做最终评审、处理反馈、合并、保留分支、创建 PR/MR 或执行 OpenSpec archive 时使用。
---

# OneSpec Archive

用于 OneSpec 的评审、收尾与归档阶段。目标是在用户确认后处理分支/worktree与 OpenSpec archive，不默认执行有后果的操作。

开始时说明：

> 我正在使用 `onespec-archive` 处理 review / closeout 阶段。

## 1. 评审入口

先恢复状态：

```bash
ONESPEC_ENV="${ONESPEC_ENV:-$(find . "$HOME"/.codex "$HOME"/.agents "$HOME"/.config -path '*/onespec/scripts/onespec-env.sh' -type f -print -quit 2>/dev/null)}"
. "$ONESPEC_ENV"
"$ONESPEC_BASH" "$ONESPEC_STATE" list
```

读取最少必要上下文：

- `openspec/changes/<change-id>/proposal.md`
- `openspec/changes/<change-id>/tasks.md`
- `openspec/changes/<change-id>/design.md`，如果存在
- 相关 `openspec/specs/**`
- 最新测试结果与 `openspec validate <change-id> --strict` 结果
- 当前分支、worktree 和工作区状态
- `origin_branch`、`origin_workspace_path`、`origin_workspace_mode`

如果状态尚未到 `review`，先说明缺少什么：未实现、未验证、未回填 `tasks.md`，或 proposal 尚未批准。

## 2. 用户评审

实现完成后让用户评审。若用户指出问题，继续修改并重新验证。

若用户确认无问题，必须再获得明确收尾确认，例如 `continue`、`yes`、`批准收尾`。随后才处理分支/worktree与归档。

进入收尾选择前，必须显式向用户汇报：

- 当前分支名
- 当前工作区路径
- 最初开始这次 change 时记录的 `origin_branch` 与 `origin_workspace_path`
- 当前是否仍在原始分支/原始工作区

如果当前分支或工作区不同于 `origin_*`，必须明确说明“你当前看到的是临时实现分支或临时 worktree，请先在这里 review 代码；确认无误后再选择收尾方式”。这里必须暂停，等待用户 review，不允许直接进入 merge / 删除。

可选收尾路径：

- 本地合并：切回目标分支（默认优先 `origin_branch`，若项目有更明确目标分支则用项目约定）、合并、测试，通过后删除 feature branch 和 worktree。
- PR/MR：根据仓库托管平台提示用户下一步。如果 remote 明确是 GitHub，使用 `PR`；如果是 GitLab，使用 `MR`；无法判断时写成 `PR/MR`。这一步可以是“帮用户创建”或“提示用户创建”，取决于当前环境工具与用户选择。
- 保留：不合并不删除，状态仍可标记 `done`。

不要默认自动合并 worktree 到 `main`，也不要默认删除 worktree。合并、PR、删除都是有后果的操作，必须来自用户选择。

推荐向用户展示的收尾选项至少包含：

1. 继续在当前实现分支上 review，暂不收尾
2. 推送当前分支并创建 `PR` / `MR`
3. 本地合并回目标分支，并删除临时 branch / worktree
4. 保留当前分支与 worktree，稍后再处理

## 3. 归档规则

- 如果代码已合并到目标分支且用户选择归档，执行 OpenSpec archive，并将状态设为 `archived`。
- 如果用户不归档，或实现仍停留在 PR/MR/保留分支上，将状态设为 `done`，并提示之后可再运行归档。

```bash
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> phase done
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> archive <skipped|archived>
```

归档前必须确认：

- `tasks.md` 已按实际完成项勾选
- 项目测试已通过，或未通过项已明确说明
- `openspec validate <change-id> --strict` 已通过
- 用户明确选择了合并、PR/MR、保留或归档策略
- 没有未处理的用户评审反馈

## 4. 汇报

收尾汇报必须覆盖：

- 用户评审结果
- 选择的收尾路径：本地合并、PR/MR、保留或归档
- 分支/worktree 的最终状态
- 当前分支与 `origin_branch` 的关系，以及是否仍保留临时 worktree
- `tasks.md`、测试与 OpenSpec validate 状态
- archive 字段：`skipped` 或 `archived`

## 5. 停止条件

以下情况必须暂停并向用户说明：

- 用户还没有完成最终评审
- 用户没有明确选择收尾路径
- 用户没有明确确认合并、删除 worktree 或 OpenSpec archive
- 代码未合并到目标分支但用户要求 archive
- 测试或 `openspec validate <change-id> --strict` 未通过且用户未明确接受风险

---
name: onespec-archive
description: 当用户需要对 OneSpec change 做最终评审、处理反馈、删除 worktree 或执行 OpenSpec archive 时使用。
---

# OneSpec Archive

用于 OneSpec 的评审、收尾与归档阶段。目标是在用户确认后合并或废弃临时 worktree，并在用户接受提交后再询问是否执行 OpenSpec archive。

开始时说明：

> 我正在使用 `onespec-archive` 处理 review / closeout 阶段。

## 1. 评审入口

先恢复状态：

```bash
ONESPEC_ENV="${ONESPEC_ENV:-$(find . "$HOME"/.codex "$HOME"/.claude "$HOME"/.cursor "$HOME"/.gemini "$HOME"/.copilot "$HOME"/.agents "$HOME"/.config -path '*/onespec/scripts/onespec-env.sh' -type f -print -quit 2>/dev/null)}"
. "$ONESPEC_ENV"
"$ONESPEC_BASH" "$ONESPEC_STATE" list
```

如果发现相关 change，必须继续执行：

```bash
"$ONESPEC_BASH" "$ONESPEC_STATE" recover <change-id>
```

`recover` 的输出是当前阶段合同，不是参考信息。至少先读取 `phase`、`next_skill`、`next_gate` 与 `allowed_actions`，再决定是否继续收尾阶段动作。

读取最少必要上下文：

- `openspec/changes/<change-id>/proposal.md`
- `openspec/changes/<change-id>/tasks.md`
- `openspec/changes/<change-id>/design.md`，如果存在
- 相关 `openspec/specs/**`
- 最新测试结果与 `openspec validate <change-id> --strict` 结果
- 当前分支、worktree 和工作区状态
- `origin_branch`、`origin_workspace_path`、`origin_workspace_mode`

如果状态尚未到 `review`，先说明缺少什么：未实现、未验证、未回填 `tasks.md`，或 proposal 尚未批准。

入口校验：如果 phase 已到 `review`，但 `.onespec.yaml` 里的 `handoff_purpose` 不是 `review`，或 `handoff_hash` 为空，说明 execute gate 可能未正常完成。此时必须告诉用户："执行阶段的 review handoff 状态未写回，建议先回到执行阶段补充汇报（回复 `补充汇报` 或重新触发 execute gate）。" 不允许静默跳过。

## 2. 用户评审

实现完成后让用户评审。若用户指出问题，继续修改并重新验证。

开发完成后不需要再次让用户确认是否 review，也不需要展示常规“继续评审 / 保留分支”类选项。收尾应先处理临时 worktree 中的代码去向；如果用户接受并合并了提交，再询问是否进行归档。如果用户回复任意非编号内容，默认视为“继续修改当前实现”，直接回到代码处理环节。

不要让用户自己猜“下一步该输入什么”。如果用户是直接进入 `onespec-archive`，尚未做收尾选择，则必须给出可直接回复的编号选项；如果支持多动作组合，允许用户回复逗号分隔的数字，例如 `1,3`。

如果用户是从 `onespec-execute` 的完成汇报进入这里，并且已经回复了收尾编号，则把那次回复视为唯一有效授权，不得再次展示一轮相同菜单。此时只需汇报必要状态检查，并按本阶段的 worktree/base 分支规则执行用户已选定的收尾动作。

进入收尾选择前，必须显式向用户汇报：

- 当前分支名
- 当前工作区路径
- 最初开始这次 change 时记录的 `origin_branch` 与 `origin_workspace_path`
- 当前是否仍在原始分支/原始工作区

如果当前分支或工作区不同于 `origin_*`，必须明确说明“你当前看到的是临时实现分支或临时 worktree”。此时必须按 base 分支是否为 `main` / `master` 决定收尾方式；如果用户改为输入任意非编号内容，则表示当前功能还有问题，需要继续修改。

可选收尾路径围绕三件事展开：

- 合并临时 worktree 到 base 分支
- 删除临时 worktree 并废弃代码
- 删除 worktree
- 执行归档（仅在代码被接受后单独询问）

不要默认自动删除 `main` / `master` 目标下的 worktree。合并、废弃、删除与归档都是有后果的操作，必须遵守下方分支规则。

## 2.1 Superpowers Worktree 优先规则

如果 `origin_workspace_mode=worktree`，或当前路径是实现期新建的临时 worktree，收尾时必须把“回收到原始分支/工作区”的动作提到最前面说明。

必须显式告诉用户：

- 当前实现位于临时 worktree
- 原始分支是 `origin_branch`
- 原始工作区是 `origin_workspace_path`
- 收尾后是否会删除本地临时 branch 与 worktree

默认推荐顺序：

1. 先在临时 worktree 完成 review。
2. 如果 base 分支不是 `main` / `master`，且无需继续修改，直接合并临时 worktree 到 base 分支并删除临时 worktree。
3. 如果 base 分支是 `main` / `master`，必须提示用户选择“合并代码并删除 worktree”或“删除 worktree，废弃代码”。
4. 合并完成后，如果用户接受了提交，再提示是否执行 OpenSpec archive。
5. 如果代码已经真正位于目标分支，则允许“仅归档”。

## 2.2 worktree 收尾规则

如果当前是临时 worktree：

- `origin_branch` 不是 `main` / `master`：直接执行 `merge-worktree`，把临时 worktree 分支合并到 `origin_branch` 所在工作区，然后删除临时 worktree 和已合入的本地临时分支。完成后提示用户是否归档。
- `origin_branch` 是 `main` / `master`：必须展示以下编号菜单：

```text
1. 合并代码并删除 worktree
2. 删除 worktree，废弃代码
其他：任意非编号内容视为继续修改当前实现
```

菜单解释规则：

- 用户回复 `1`：执行 `merge-worktree`，合并代码并删除临时 worktree 和已合入的本地临时分支；完成后提示是否归档。
- 用户回复 `2`：执行 `discard-worktree`，删除临时 worktree 并删除对应本地分支；废弃代码后不归档。
- 用户输入数字外的自由文本：默认视为继续修改当前实现，直接回到代码处理环节；只有意图不清晰时才补一个最短澄清问题。

如果当前不是临时 worktree，且代码已经真正位于目标分支，才允许单独执行 `archive`。

不要把 `merge-worktree` 和 `archive` 放在同一次动作里执行。合并或废弃 worktree 是代码去向决策；归档是用户接受提交后的后续决策。

## 2.3 归档提示

只有当用户选择合并，或非 `main` / `master` base 分支按规则自动合并完成后，才提示是否执行 OpenSpec archive：

```text
代码已合并并删除临时 worktree。是否现在归档？

1. 归档
2. 暂不归档
其他：任意非编号内容视为继续修改当前实现
```

如果用户选择废弃代码，不展示归档提示。

如果用户之前已经在 `onespec-execute` 的完成菜单里选了收尾编号，则这里不再重复相同菜单，而是结合 `origin_branch` 执行对应动作；但归档仍然必须在代码被接受合并后单独询问。

## 3. 归档规则

进入 merge、discard、delete 或 archive 的最终收尾前，必须检查当前是否仍有“与本次 change 相关的未提交代码”：

```bash
"$ONESPEC_BASH" "$ONESPEC_COMMIT" related-dirty <change-id>
```

- 如果结果为空，继续后续收尾。
- 如果结果为空，即使工作区里还有无关未跟踪目录，也不要阻塞收尾；例如未记录到 `.onespec.yaml` tracked file 列表里的 `.superpowers/` 可以明确说明“未纳入本次提交”，但不应视为本次 change 的阻塞项。
- 如果结果非空，不要停在“请你自己先提交”这一步。收尾脚本必须自动提交这些文件，而且只能提交本次 change 相关文件：

```bash
"$ONESPEC_BASH" "$ONESPEC_COMMIT" commit-related <change-id> <closeout|archive|preserve-state>
```

- 提交信息优先遵循项目自身指定的 Git 提交策略。先探测项目内文档和配置：

```bash
"$ONESPEC_BASH" "$ONESPEC_COMMIT" detect-policy <change-id>
```

- 如果项目里存在明确规范，按项目要求处理 commit message 的格式、scope 和语言。
- 如果项目里没有明确规范，回退到通用 Conventional Commits：`<type>(<scope>): <简要描述>`。
- 只能提交 `.onespec.yaml` 中记录的 tracked files 与当前脏文件的交集；如果 `.onespec.yaml` 本身是脏的，也应一并提交，不允许把无关改动一并提交。
- 例外：位于 `openspec/changes/<change-id>/` 下、专属于本次 change 的临时压缩包、导出包或交接工件，也视为本次 change 相关文件；自动提交时要一并带上，这样 archive 后仍能保留在 change 历史里。
- 自动提交只覆盖 closeout 所需的本地 commit，不代表获得了 merge / rebase / push 授权；这些动作仍然必须由用户单独明确要求。
- 推荐顺序：
  1. closeout 前先自动提交当前工作区里与本次 change 相关的脏文件。
  2. 如果 archive 产生了新的归档工件或删除了 `.onespec.yaml`，archive 之后再自动补一笔归档提交。
  3. 如果只是删除临时 worktree，则在 origin 工作区保留状态文件后，再自动提交这份保留状态。
- 如果代码已合并到目标分支且用户选择归档，直接执行 OpenSpec archive，并将状态设为 `archived`。
- 如果用户合并 worktree 但暂不归档，将状态设为 `done`、`archive=skipped`，并提示之后可再运行归档；此时不要删除 `.onespec.yaml`。
- 如果用户废弃 worktree，不执行归档，不把废弃分支代码合入 base 分支。
- 只有真正执行 archive 后，才删除运行时状态文件：

```bash
"$ONESPEC_BASH" "$ONESPEC_CLOSEOUT" cleanup-runtime <change-id>
```

用户一旦在“是否现在归档”菜单中明确选择归档，就把这次选择视为唯一确认；不要再追加第二次确认。

实际执行收尾动作时，优先使用：

```bash
"$ONESPEC_BASH" "$ONESPEC_CLOSEOUT" run-actions <change-id> [merge-worktree|discard-worktree|delete-worktree|archive]
```

```bash
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> phase done
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> archive <skipped|archived>
```

归档前必须确认：

- `tasks.md` 已按实际完成项勾选
- 项目测试已通过，或未通过项已明确说明
- `openspec validate <change-id> --strict` 已通过
- 用户明确选择了合并、废弃、删除 worktree 或归档策略
- 没有未处理的用户评审反馈

## 4. 汇报

收尾汇报必须覆盖：

- 用户评审结果
- 选择的收尾路径：合并 worktree、废弃 worktree、删除 worktree 或归档
- 分支/worktree 的最终状态
- 当前分支与 `origin_branch` 的关系，以及是否仍保留临时 worktree
- `tasks.md`、测试与 OpenSpec validate 状态
- archive 字段：`skipped` 或 `archived`

## 5. 停止条件

以下情况必须暂停并向用户说明：

- 用户还没有完成最终评审
- 用户没有明确选择收尾路径
- 用户没有明确确认合并、废弃、删除 worktree 或 OpenSpec archive
- 代码未合并到目标分支时，却要求单独 archive
- 测试或 `openspec validate <change-id> --strict` 未通过且用户未明确接受风险

# Archive Phase

供 `onespec` 在 `review-closeout` 阶段按需读取。目标是在用户确认后处理临时 worktree 的代码去向，并按用户已授权的动作完成合并、废弃或归档。

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

`recover` 的输出是当前阶段合同，不是参考信息。至少先读取 `phase`、`next_skill`、`next_reference`、`next_gate` 与 `allowed_actions`，再决定是否继续收尾阶段动作。

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

开发完成后不需要再次让用户确认是否 review，也不需要展示常规“继续评审 / 保留分支”类选项。收尾应先处理临时 worktree 中的代码去向；如果用户回复任意非编号内容，默认视为“继续修改当前实现”，直接回到代码处理环节。

不要让用户自己猜“下一步该输入什么”。如果用户是直接进入 archive phase，尚未做收尾选择，则必须给出用户只需回复数字编号的选项。

如果用户是从 execute phase 的完成汇报进入这里，并且已经回复了收尾编号，则把那次回复视为唯一有效授权，不得再次展示一轮相同菜单，也不得再追加“是否处理合并/归档”之类的中间确认。此时只需汇报必要状态检查，并按用户已选动作直接执行，不需要拆成两轮确认。

进入收尾选择前，必须显式向用户汇报：

- 当前分支名
- 当前工作区路径
- 最初开始这次 change 时记录的 `origin_branch` 与 `origin_workspace_path`
- 当前是否仍在原始分支/原始工作区

如果当前分支或工作区不同于 `origin_*`，必须明确说明“你当前看到的是临时实现分支或临时 worktree”。如果用户改为输入任意非编号内容，则表示当前功能还有问题，需要继续修改。

可选收尾路径只有以下三种：

- 归档当前 change，并合并分支到 base 分支
- 直接归档，不合并到 base 分支
- 删除当前临时 worktree并废弃代码

合并、废弃、删除与归档都是有后果的操作；但只要用户已经在编号菜单里明确授权，就直接执行，不要再拆成二次确认。

## 2.1 Superpowers Worktree 优先规则

如果 `origin_workspace_mode=worktree`，或当前路径是实现期新建的临时 worktree，收尾时必须把“回收到原始分支/工作区”的动作提到最前面说明。

必须显式告诉用户：

- 当前实现位于临时 worktree
- 原始分支是 `origin_branch`
- 原始工作区是 `origin_workspace_path`
- 收尾后是否会删除本地临时 branch 与 worktree

默认推荐顺序：

1. 先在临时 worktree 完成 review。
2. 如果无需继续修改，先归档，再把当前实现分支合并回 base 分支，并删除临时 worktree。
3. 如果用户只需要保留归档记录而不合并代码，则允许“仅归档”。
4. 如果用户要废弃代码，则删除 worktree 并丢弃本地临时分支。

## 2.2 worktree 收尾规则

如果当前是临时 worktree，必须展示以下编号菜单：

```text
1. 归档当前 change，并合并分支到 base 分支
2. 直接归档，不合并到 base 分支
3. 删除当前临时 worktree，废弃代码
其他：任意非编号内容视为继续修改当前实现；用户未输入时默认停留在当前评审阶段
```

菜单解释规则：

- 用户回复 `1`：执行 `archive-then-merge-worktree`。必须先归档，再合并代码到 base 分支，最后删除临时 worktree 和已合入的本地临时分支。
- 用户回复 `2`：执行 `archive-only`。直接归档，不合并到 base 分支，也不自动删除当前 worktree。
- 用户回复 `3`：执行 `discard-worktree`，删除临时 worktree 并删除对应本地分支；废弃代码后不归档。
- 用户输入数字外的自由文本：默认视为继续修改当前实现，直接回到代码处理环节；只有意图不清晰时才补一个最短澄清问题。

如果当前不是临时 worktree，且代码已经真正位于目标分支，也允许执行 `archive-only`。

如果当前不在临时 worktree，且当前分支就是 `origin_branch`，并且该分支是 `main` 或 `master`，则不要再展示“归档后合并”或“删除当前临时 worktree”两个选项。此时收尾菜单只保留一个编号：

```text
1. 直接归档（当前已在 `main/master`，无需额外合并分支）
其他：任意非编号内容视为继续修改当前实现；用户未输入时默认停留在当前评审阶段
```

也就是说，`master/main` 分支就不要提示合并分支/删除 worktree。

如果用户之前已经在 execute phase 的完成菜单里选了收尾编号，则这里不再重复相同菜单，而是结合实际工作区状态直接执行对应动作。

## 3. 归档规则

进入归档、合并或废弃收尾前，必须检查当前是否仍有“与本次 change 相关的未提交代码”：

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
- 自动提交只覆盖 closeout 所需的本地 commit。用户在收尾编号菜单中选中的本地合并/归档动作，视为已授权；未包含在用户选择里的 merge / rebase / push 仍不自动执行。
- 推荐顺序：
  1. closeout 前先自动提交当前工作区里与本次 change 相关的脏文件。
  2. 如果 archive 产生了新的归档工件或删除了 `.onespec.yaml`，archive 之后再自动补一笔归档提交。
  3. 如果用户选择“先归档再合并”，则必须在 archive 提交完成后，再把当前实现分支合并回 base 分支。
- 如果用户选择 `archive-then-merge-worktree`，必须先归档，再合并到目标分支，并将状态设为 `archived`。
- 如果用户选择 `archive-only`，直接执行 OpenSpec archive，并将状态设为 `archived`；不自动合并，不自动删除当前 worktree。
- 如果用户选择 `discard-worktree`，不执行归档，不把废弃分支代码合入 base 分支。
- 只有真正执行 archive 后，才删除运行时状态文件：

```bash
"$ONESPEC_BASH" "$ONESPEC_CLOSEOUT" cleanup-runtime <change-id>
```

实际执行收尾动作时，优先使用：

```bash
"$ONESPEC_BASH" "$ONESPEC_CLOSEOUT" run-actions <change-id> [archive-then-merge-worktree|archive-only|discard-worktree]
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
- 选择的收尾路径：先归档再合并、仅归档，或废弃 worktree
- 分支/worktree 的最终状态
- 当前分支与 `origin_branch` 的关系，以及是否仍保留临时 worktree
- `tasks.md`、测试与 OpenSpec validate 状态
- archive 字段：`skipped` 或 `archived`

## 5. 停止条件

以下情况必须暂停并向用户说明：

- 用户还没有完成最终评审
- 用户没有明确选择收尾路径
- 用户没有明确确认归档并合并、仅归档，或废弃 worktree
- 代码尚未归档时，却要求直接合并到目标分支
- 测试或 `openspec validate <change-id> --strict` 未通过且用户未明确接受风险

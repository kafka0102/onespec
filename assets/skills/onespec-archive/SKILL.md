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

不要让用户自己猜“下一步该输入什么”。进入 `onespec-archive` 时，必须给出可以直接照抄的入口词，例如：

- `进入收尾`：开始 review-closeout 选择
- `继续评审`：暂不收尾，继续看代码或补反馈

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

## 2.1 收尾前能力探测

在展示 `PR` / `MR` 选项前，先探测仓库类型、本地命令与认证状态，而不是等用户确认后才失败。

推荐顺序：

1. 用 `git remote get-url origin` 解析默认 remote。
2. 根据 host 判断仓库类型：
   - `github.com` 或 GitHub Enterprise：按 GitHub 处理。
   - `gitlab.com`、自建 GitLab 域名，或项目明确声明 GitLab：按 GitLab 处理。
   - 无法判断：视为 `unknown`，展示文案用 `PR/MR`，但不要承诺可自动创建。
3. 检查本地能力：
   - GitHub：`command -v gh`，随后 `gh auth status --hostname <host>`。
   - GitLab：`command -v glab`，随后 `glab auth status --hostname <host>`。
4. 记录能力结果：
   - `review_request_supported=true|false`
   - `review_request_tool=gh|glab|none`
   - `review_request_error=<具体原因>`

GitLab 默认检查项必须至少包含：

- `origin` remote 可解析到 GitLab host
- 本地存在 `glab`
- `glab` 已对该 host 完成认证

如果用户尝试执行 `创建 PR` / `创建 MR`，但能力探测失败，必须立即报错并停止该操作，推荐提示：

- GitHub：`无法创建 PR：未检测到 gh，或 gh 未登录到 <host>。`
- GitLab：`无法创建 MR：未检测到 glab，或 glab 未登录到 <host>。`
- Unknown：`无法自动创建 PR/MR：未能判断仓库托管平台，请先确认 remote 或手动创建。`

不要在能力不足时退化成“假装已经创建完成”；只能明确失败，或改为提示用户手动处理。

## 2.2 Superpowers Worktree 优先规则

如果 `origin_workspace_mode=worktree`，或当前路径是实现期新建的临时 worktree，收尾时必须把“回收到原始分支/工作区”的动作提到最前面说明。

必须显式告诉用户：

- 当前实现位于临时 worktree
- 原始分支是 `origin_branch`
- 原始工作区是 `origin_workspace_path`
- 收尾后是否会删除本地临时 branch 与 worktree

默认推荐顺序：

1. 先在临时 worktree 完成 review。
2. 用户确认后，选择“提交评审单”或“本地合并”。
3. 如果选择本地合并：合并回 `origin_branch` 或项目目标分支，测试通过后删除本地临时 branch / worktree。
4. 如果选择 `PR` / `MR`：
   - 先 push 当前实现分支。
   - 成功创建 `PR` / `MR` 后，删除本地临时 branch / worktree。
   - 不要删除远端分支；远端分支仍需承载 review。
5. 如果用户选择保留，则保留 worktree，不做删除。

这里的“删除分支”默认只指本地临时分支；除非用户明确要求，否则不要删除远端 review 分支。

## 2.3 多选收尾组合

收尾选项不要再只做单选。至少把以下三个动作设计成可多选组合：

- `提交 PR/MR`
- `合并分支`
- `执行归档`

同时保留一个显式的“暂不处理”路径，例如：

- `继续评审 / 暂不收尾`

推荐的组合校验逻辑：

- `{提交 PR/MR}`：合法。适用于先走代码评审，不立即归档。
- `{合并分支}`：合法。适用于本地直接合并，但默认不归档。
- `{合并分支, 执行归档}`：合法，也是“代码已真正落到目标分支后”的默认推荐组合。
- `{提交 PR/MR, 执行归档}`：默认不合法。原因是代码尚未真正合并到目标分支，不能直接 archive。
- `{提交 PR/MR, 合并分支}`：默认不合法。两者代表不同集成路径，除非项目另有明确流程，否则必须要求用户二选一。
- `{}`：合法，表示这次仅结束 review，不做集成与归档；状态可置为 `done`，并提示之后仍可归档。

如果用户勾选了非法组合，必须明确指出冲突原因，不要替用户猜测执行顺序。

默认推荐组合：

- 当前在 Superpowers 临时 worktree，且仓库是 GitHub / GitLab：推荐 `{提交 PR/MR}`，并明确“创建完成后会删除本地临时 branch / worktree，保留远端分支供 review”。
- 当前不在临时 worktree，且用户明确要本地落地：推荐 `{合并分支, 执行归档}`。
- 用户只想结束当前轮操作、不立即集成：推荐 `{}`，并提示“稍后如代码完成合并，可再执行归档”。

推荐向用户展示的收尾选项至少包含：

1. 继续在当前实现分支上 review，暂不收尾
2. 推送当前分支并创建 `PR` / `MR`
3. 本地合并回目标分支，并删除临时 branch / worktree
4. 保留当前分支与 worktree，稍后再处理

给用户展示这些选项时，不要只写描述；必须附上明确输入词，推荐至少包含：

- `继续评审`
- `创建 PR`
- `本地合并`
- `保留分支`

对有后果的操作，执行前还要再要一次二次确认，推荐直接要求用户输入：

- `确认创建 PR`
- `确认本地合并`
- `确认保留分支`

如果仓库托管平台是 GitLab，可以把 `创建 PR` / `确认创建 PR` 替换为 `创建 MR` / `确认创建 MR`；无法判断平台时，正文里写 `PR/MR`，但仍要给出一组可直接输入的确认词。

## 3. 归档规则

进入 archive、merge、PR/MR 或保留分支的最终收尾前，必须检查当前是否仍有“与本次 change 相关的未提交代码”：

```bash
"$ONESPEC_BASH" "$ONESPEC_COMMIT" related-dirty <change-id>
```

- 如果结果为空，继续后续收尾。
- 如果结果为空，即使工作区里还有无关未跟踪目录，也不要阻塞收尾；例如未记录到 `touched-files.txt` 的 `.superpowers/` 可以明确说明“未纳入本次提交”，但不应视为本次 change 的阻塞项。
- 如果结果非空，先向用户明确提示这些文件尚未提交，并暂停归档。
- 若用户要求现在提交，只能 stage 本次 change 相关文件：

```bash
"$ONESPEC_BASH" "$ONESPEC_COMMIT" stage-related <change-id>
```

- 提交信息优先遵循项目自身指定的 Git 提交策略。先探测项目内文档和配置：

```bash
"$ONESPEC_BASH" "$ONESPEC_COMMIT" detect-policy <change-id>
```

- 如果项目里存在明确规范，按项目要求处理 commit message 的格式、scope 和语言。
- 如果项目里没有明确规范，回退到通用 Conventional Commits：`<type>(<scope>): <简要描述>`。
- 只能提交 `touched-files.txt` 与当前脏文件的交集，不允许把无关改动一并提交。

- 如果代码已合并到目标分支且用户选择归档，执行 OpenSpec archive，并将状态设为 `archived`。
- 如果用户不归档，或实现仍停留在 PR/MR/保留分支上，将状态设为 `done`，并提示之后可再运行归档。

已经满足归档前置条件且代码确实已经合并到目标分支后，如需真的执行归档，必须再次要求用户给出明确指令，推荐使用：

- `执行归档`

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

# Design Phase

供 `onespec` 在 `propose` 阶段按需读取。目标是把需求转成已审批前的 OpenSpec artifacts，并推荐后续执行路径。

## 1. 接入

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

`recover` 的输出是当前阶段合同，不是参考信息。至少先读取 `phase`、`next_skill`、`next_reference`、`next_gate` 与 `allowed_actions`，再决定是否继续设计阶段动作。

读取最少必要上下文：

- `openspec/config.yaml`、`openspec/specs/**` 中与任务相关的部分
- 项目入口文档，如 `AGENTS.md`、`README.md`、`docs/**` 中与任务相关的部分
- 当前分支和工作区状态

不要询问变更名称。根据任务自动生成简短短横线命名的 `change-id`，如冲突则追加数字。

## 2. 歧义扫描与 Proposal 路由

生成任何 OpenSpec artifact 前，显式做一次 ambiguity scan，并写明分类结果和触发原因。

至少检查：

- 是否存在多个合理 scope
- 是否存在多个合理行为解释
- 是否存在多个合理技术方案
- 是否需要用户肉眼确认视觉方向、布局或交互方案
- 验收标准是否缺失
- non-goals 是否缺失
- rollout / migration / compatibility 假设是否缺失
- 是否一次跨了多个本该拆分的独立子系统

分类规则：

- `低歧义`：范围基本单一，方案基本清晰，验收标准大部分可从项目文档或现有 spec 推出。
- `高歧义`：存在两个以上合理解释，或如果现在直接写 proposal 很可能会把猜测写进正式文档。

完成 ambiguity scan 后，必须先给用户一个明确的分类输出，再进入下一步；不允许静默直接写 proposal、design、tasks 或 spec。

用户可见输出至少包含：

- 判定结果：`低歧义` 或 `高歧义`
- 触发原因：1-3 条，说明为什么这样分类
- 处理方式：接下来会做什么，以及是否需要用户先确认

推荐输出模板：

- `低歧义：当前需求属于低歧义，因为 <原因1>、<原因2>。处理方式：我将直接起草 OpenSpec proposal；如果过程中发现还缺一个关键前提，我只会先问一个简短问题，不会带着猜测写入正式文档。`
- `高歧义：当前需求属于高歧义，因为 <原因1>、<原因2>。处理方式：我不会直接写 proposal；我会先进入 brainstorming，先和你确认 scope / 行为 / 技术方案中的关键分歧，再基于确认结果回填 OpenSpec artifacts。`

低歧义流程：

- 先输出一次明确的低歧义结论和处理方式。
- 如果无需用户交互式 UI / 视觉确认，且没有必须进一步询问的问题，再进入 OpenSpec proposal。
- 如果仍有必须补齐的问题，只问一个简短问题，得到回答后重新执行 ambiguity scan。
- 如果存在必须补齐的问题，在拿到回答前不要创建任何 OpenSpec artifact。
- 对低歧义任务不要调用 brainstorming。

高歧义流程：

- 先输出一次明确的高歧义结论和处理方式。
- 在完成这次说明前，不要创建任何 OpenSpec artifact。
- 明确说明将先进入 `brainstorming`，再写 OpenSpec artifacts。
- 使用 `brainstorming` 或 `superpowers:brainstorming`，一次只问一个问题，提出 2-3 个可行方案并说明 trade-off，形成已确认的设计文档。
- Brainstorming 文档被用户确认后，以该文档、相关 `docs/**` 与相关 `openspec/specs/**` 为输入，回填 OpenSpec artifacts。不要重复追问已确认的问题。

视觉设计触发规则：

- 如果用户要求“给我看设计效果”、“给我看页面方案”、“出 UI / UX 方案”、“做视觉设计 / 视觉升级”、“出原型 / mockup / wireframe”、“浏览器里给我看效果”，或明确要求比较布局、样式、视觉方向，默认视为需要视觉化设计确认。
- 出现这类诉求时，不要继续按纯文本澄清推进；只要当前 change 还没有被批准为固定视觉方案，就应路由到带 visual companion 的 brainstorming。
- visual companion 是可扩展模块，不绑定固定仓库文件名或固定实现。它可以由项目内现成模块、本地原型、浏览器预览页或其他可视化工作流承载。
- 涉及 mockup、wireframe、布局比较、视觉风格比较或页面效果确认时，先单独发送 visual companion offer，消息里不能混入其他内容；等待用户确认后，启动当前环境里可用的 visual companion 流程，提供本地 URL、原型入口或等价的可视化载体，并给出第一版可视化方案。用户拒绝后，才允许继续纯文本 brainstorming。
- 不要因为仓库里缺少某个固定的 visual companion 文件就中止流程，也不要把“检查某个预设文件是否存在”当成前置 gate。只有当当前环境里完全没有可用的可视化实现路径时，才退回 `text-only` brainstorming，并明确告知这是降级路径。

## 3. Proposal 完成后的任务分析

生成或更新 OpenSpec 产物：

- `openspec/changes/<change-id>/proposal.md`
- `openspec/changes/<change-id>/design.md`，仅在确有技术设计价值时创建
- `openspec/changes/<change-id>/tasks.md`
- 必要的 `specs/**/spec.md`

创建状态与交接包：

```bash
"$ONESPEC_BASH" "$ONESPEC_STATE" init <change-id>
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> phase proposal-ready
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> ambiguity <low|high>
"$ONESPEC_BASH" "$ONESPEC_HANDOFF" <change-id> proposal --write
```

OpenSpec artifacts 写完后，不要只汇报“proposal 已生成”。必须读取 task artifact 并给出实现路径推荐。

任务分析输入：

- `openspec/changes/<change-id>/tasks.md`
- `proposal.md`
- `design.md`，如果存在
- 相关 `openspec/specs/**`
- 如果当前 schema 不是 `spec-driven`，读取 `openspec status --change "<change-id>" --json` 或 `openspec instructions apply --change "<change-id>" --json` 中定义的任务 artifact 或等价 apply context

至少分析：

- 未完成 task 总数，以及是否能自然拆成独立小步
- 是否跨多个 workspace、业务模块或 capability
- 是否同时涉及前端、后端、数据库、后台任务、共享包、spec/doc 回填
- 是否存在 migration、兼容性、上线顺序、异步流程、数据修复或人工验证环节
- task 之间是否强依赖，是否需要严格的 review gate / TDD / 分步验收

复杂度分级与推荐：

- `低复杂度`：默认推荐原生 `OpenSpec apply`。task 数量少，路径线性，单模块或少量文件改动，几乎没有跨层依赖，也不涉及 migration / schema / 多端联动。
- `中复杂度`：存在少量跨模块或跨端协作，但边界清晰。若更需要分工、TDD、review gate、分阶段验证，推荐 `Superpowers`；若 task 线性且边界稳定，推荐 `OpenSpec apply`。
- `高复杂度`：明显跨多个 workspace 或 capability，涉及 API、数据库、任务系统、共享包、视觉确认中的多个维度，或 task 依赖强。默认推荐 `Superpowers`。

输出时必须明确：

- change id 与 artifact 位置
- 对 task artifact 的简短摘要
- 复杂度等级与具体原因
- 推荐组合，而不是只推荐抽象路线：
  - `OpenSpec apply + native + current branch`
  - `Superpowers + subagent + new worktree`
  - `Superpowers + subagent + current worktree/current branch`
- 用户可覆盖推荐

## 4. Proposal 批准 Gate 与路径选择

默认意图映射、issue workflow 路由或实现路径推荐，不等于 proposal 已获批。

只有用户明确批准 proposal / design / spec 后，才允许进入实现计划。设计阶段结束时，不要只给一句自由文本，也不要要求用户输入 `批准`、`yes`、`continue` 等完整词；必须给出“显式编号选项 + 推荐项”菜单。用户只需回复数字编号。沉默、“看起来还行”、最初的“开始实现”、“执行这个 change”或“make plan”都不算对 proposal 产物的批准。

生成批准菜单前先确定推荐组合：

- 如果推荐 `OpenSpec apply`，组合固定为 `OpenSpec apply + native + current branch`，记录 `implementation_path=openspec-apply`、`execution_method=native`、`workspace=current-branch`（如果当前是 `main`/`master` 且项目文档禁止直接修改主分支，先暂停提示风险）。
- 如果推荐 `Superpowers`，默认执行方式是 `subagent`；只有 task 强耦合、不适合逐 task 派发，或用户/平台明确不能使用 subagent 时，才推荐 `local`。
- 判断当前是否已经位于附加 git worktree：分别读取 `git rev-parse --path-format=absolute --git-dir` 与 `git rev-parse --path-format=absolute --git-common-dir`；两者不相同则当前就是附加 worktree。若命令不可用，可退回 `git worktree list --porcelain` 并用当前 `pwd -P` 匹配 `worktree` 条目。
- 如果当前已经在附加 worktree 中，不推荐再创建新 worktree；推荐组合写成 `Superpowers + <subagent|local> + current worktree/current branch`，状态里记录 `workspace=current-branch`，因为执行位置就是当前 checkout。
- 如果当前不在附加 worktree 中且推荐 `Superpowers`，默认推荐 `Superpowers + subagent + new worktree`，以便隔离实现分支；状态里记录 `workspace=worktree`。

默认使用下面这组批准菜单，并把推荐组合写进第 1 项。菜单必须解释组合由三部分构成：实现路径 + 执行方式 + 工作区策略。

1. 批准当前 proposal / design / spec，并按推荐组合继续实现：`<recommended-combination>`（推荐）
2. 批准当前 proposal / design / spec，但我要改实现路径、执行方式或工作区
3. 先修改 proposal / design / tasks / spec；我会补充要改的点
4. 先停在设计阶段，暂不进入实现
其他：如果意图不在以上选项里，允许用户直接补充说明其他操作

菜单解释规则：

- 用户回复 `1`：视为批准当前 artifacts，并接受当前推荐组合；不要再二次询问 `subagent/local` 或 `worktree/current-branch`，直接记录该组合对应的 `implementation_path`、`execution_method` 与 `workspace`。
- 用户回复 `2`：视为批准当前 artifacts，但要覆盖推荐组合；此时继续给出组合菜单，不要把 `subagent/local` 与 `worktree/current-branch` 拆成两轮问题。
- 用户回复 `3`：继续留在 design phase，根据用户反馈修改 artifacts，不进入实现。
- 用户回复 `4`：暂停在设计阶段，等待用户后续指令。
- 用户输入其他自由文本：如果意图清晰，按用户自定义意图处理；如果仍有歧义，只追问一个最短的澄清问题。

当用户选择第 2 项，后续确认也使用“显式编号组合选项 + 推荐项”菜单；用户只需回复数字编号。不要只给一句自由文本，也不要在每个选项下附加口令提示。根据当前是否已经在附加 worktree 中生成菜单：

- 如果当前不在附加 worktree 中，默认菜单：
  1. `Superpowers + subagent + new worktree`（推荐）
  2. `Superpowers + local + new worktree`
  3. `Superpowers + local + current branch`
  4. `OpenSpec apply + native + current branch`
  其他：允许用户补充说明特殊组合；例如明确要求 `Superpowers + subagent + current branch`
- 如果当前已经在附加 worktree 中，默认菜单：
  1. `Superpowers + subagent + current worktree/current branch`（推荐）
  2. `Superpowers + local + current worktree/current branch`
  3. `OpenSpec apply + native + current worktree/current branch`
  其他：允许用户补充说明特殊组合；不要推荐再创建新的 worktree

`main`/`master` 规则：

- 不在 `main`/`master` 上直接实现，除非用户在看到风险提示后明确要求。
- 如果当前在 `main`/`master` 且选择 `Superpowers + current branch`，先提示风险并记录为 `main-override`；若选择 `new worktree`，按 worktree 创建规则处理。
- 如果当前在功能分支且工作区干净，可以使用 `current-branch`。
- 如果准备切到 `worktree`，但当前工作区存在未提交改动，必须先处理这些改动，再创建 worktree。尤其当前分支是 `main`/`master` 时，不允许带着未提交代码直接创建临时 worktree。
- 对 `main`/`master` 上的未提交改动，默认要求先按项目提交规范创建本地 commit，再创建临时分支 / worktree；不要把未提交的 base 分支代码隐式带进新的实现分支。
- 如果用户明确拒绝先提交当前 dirty 改动，则不要继续创建 worktree；此时只能停下等待、改走 `current-branch`，或让用户先整理当前分支状态。

确认后记录：

```bash
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> complexity <low|medium|high>
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> implementation_path <openspec-apply|superpowers>
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> execution_method <subagent|local|native>
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> workspace <worktree|current-branch|main-override>
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> origin_branch "$(git branch --show-current || echo detached)"
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> origin_workspace_path "$(pwd -P)"
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> origin_workspace_mode <worktree|current-branch|main-override>
"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> phase approved
```

这里的 `origin_*` 字段表示“用户最初开始这次 change 时所在的分支和工作区”。后续如果实现发生在新 branch 或临时 worktree 中，execute phase 与 archive phase 必须拿它来提示用户当前 review 位置与收尾选项。

## 5. 停止条件

以下情况必须暂停并向用户说明：

- 一个请求实际跨了多个应该拆开的子系统
- OpenSpec 必需上下文缺失到无法安全继续
- 用户明确要求视觉设计效果，但 visual companion offer 未单独发送或尚未等到用户确认
- proposal / design / spec 尚未明确批准，但用户要求开始实现
- 实现路径、执行方式或工作区选择会影响风险但尚未确认

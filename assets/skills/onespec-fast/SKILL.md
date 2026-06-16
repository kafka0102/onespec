---
name: onespec-fast
description: 当用户明确要求使用 OneSpec 快速路径、onespec-fast、fast apply、OpenSpec 自动 proposal/开发/归档或自动贯通时使用。该 skill 会复用 `onespec/references/fast.md`，全程走原生 OpenSpec apply，不做复杂度检查，不生成 Superpowers plan。
---

# OneSpec Fast

这是 OneSpec 快速路径的独立入口。它不重复阶段规则；必须复用主 `onespec` skill 的 `references/fast.md`。

开始时说明：

> 我正在使用 `onespec-fast` 快速路径。

## 入口规则

- 只有用户明确要求 `onespec-fast`、快速路径、fast apply、OpenSpec 自动 proposal/开发/归档或自动贯通时使用。
- 先读取相邻安装的 `../onespec/SKILL.md`，遵守其中的恢复优先、共同约束和 reference 读取规则。
- 然后读取 `../onespec/references/fast.md` 并按其中步骤执行。
- 如果相邻路径不可用，先在当前项目、`$HOME/.codex`、`$HOME/.claude`、`$HOME/.cursor`、`$HOME/.gemini`、`$HOME/.copilot`、`$HOME/.agents`、`$HOME/.config` 下定位 `*/onespec/references/fast.md`；仍找不到时停止并要求重新运行 `onespec init --overwrite`。
- `references/fast.md` 可以复用 `design.md`、`execute.md` 和 `archive.md` 的过程段，但会覆盖普通 proposal approval、review pause 和 closeout menu gate。

不要在 `onespec-fast/SKILL.md` 内重写快速路径步骤；完整规则只维护在 `onespec/references/fast.md`。

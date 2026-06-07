# OneSpec

> English version: [README.md](README.md)

OneSpec 是一个给 Codex 使用的 skill 包，用来执行 OpenSpec + Superpowers 工作流。

## 安装

任选一种方式安装。

### 通过 `npx`

如果你已经把包发布到 npm：

```bash
npx @kafka0102/onespec init
```

### 通过仓库源码

直接从这个仓库安装英文 skill bundle：

```bash
npx skills add https://github.com/kafka0102/onespec/tree/main/assets/skills-en -a codex -y
```

安装中文 skill bundle：

```bash
npx skills add https://github.com/kafka0102/onespec/tree/main/assets/skills -a codex -y
```

`skills` CLI 不能正确解析 `owner/repo/tree/<ref>/...` 这种简写。请使用上面的完整 GitHub URL，或者改用带显式 ref 的简写，例如 `kafka0102/onespec/assets/skills#main`。

## 使用

安装后重启 Codex，然后在任务里调用 OneSpec skills 即可。

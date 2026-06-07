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

## 发布

如果要通过 GitHub Actions 发布到 npm：

1. 在仓库 Secrets 中添加 `NPM_TOKEN`，它需要有发布 `@kafka0102/onespec` 的权限。
2. 更新 `package.json` 里的版本号。
3. 创建并推送对应版本标签，例如 `v0.1.1`。

```bash
git tag v0.1.1
git push origin main --tags
```

`.github/workflows/publish.yml` 会在推送 `v*` 标签时触发，校验 tag 与 `package.json` 版本一致，执行 `npm test`，预览发布内容，然后发布到 npm。

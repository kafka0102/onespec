import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';

const BUNDLED_SKILLS = ['onespec', 'onespec-fast'];
const LEGACY_CHILD_SKILLS = ['onespec-design', 'onespec-execute', 'onespec-archive'];
const REFERENCES = ['design.md', 'execute.md', 'archive.md', 'fast.md'];

async function readSkill(name) {
  return readFile(`assets/skills/${name}/SKILL.md`, 'utf8');
}

async function readEnglishSkill(name) {
  return readFile(`assets/skills-en/${name}/SKILL.md`, 'utf8');
}

async function readReference(name) {
  return readFile(`assets/skills/onespec/references/${name}`, 'utf8');
}

async function readEnglishReference(name) {
  return readFile(`assets/skills-en/onespec/references/${name}`, 'utf8');
}

function expectIncludes(content, expected) {
  assert.match(content, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}

test('OneSpec bundle exposes router, fast entrypoint, and phase references', async () => {
  const skills = await readdir('assets/skills');
  const references = await readdir('assets/skills/onespec/references');

  for (const skillName of BUNDLED_SKILLS) {
    assert.ok(skills.includes(skillName), `${skillName} should exist`);
    expectIncludes(await readSkill(skillName), `name: ${skillName}`);
  }

  for (const skillName of LEGACY_CHILD_SKILLS) {
    assert.equal(skills.includes(skillName), false, `${skillName} should not be a public skill`);
  }

  for (const reference of REFERENCES) {
    assert.ok(references.includes(reference), `${reference} should exist`);
  }
});

test('onespec router loads phase references instead of child skills', async () => {
  const skill = await readSkill('onespec');

  for (const expected of [
    'OneSpec 工作流',
    '单一入口 Skill',
    'references/design.md',
    'references/execute.md',
    'references/archive.md',
    'references/fast.md',
    '恢复优先',
    '.onespec.yaml',
    'next_reference',
    '上一阶段 gate 已完成',
    'propose',
    'apply',
    'review-closeout',
  ]) {
    expectIncludes(skill, expected);
  }

  assert.doesNotMatch(skill, /## 6\. Superpowers Make Plan 与实现/);
  assert.doesNotMatch(skill, /## 7\. 原生 OpenSpec Apply、评审与收尾/);
});

test('onespec-fast is a thin entrypoint that reuses the onespec fast reference', async () => {
  const skill = await readSkill('onespec-fast');

  for (const expected of [
    'OneSpec Fast',
    '../onespec/SKILL.md',
    '../onespec/references/fast.md',
    '不要在 `onespec-fast/SKILL.md` 内重写快速路径步骤',
  ]) {
    expectIncludes(skill, expected);
  }

  assert.doesNotMatch(skill, /## 3\. 强制复杂度检查/);
  assert.doesNotMatch(skill, /run-actions <change-id> archive-only/);
});

test('design reference documents proposal and approval routing guardrails', async () => {
  const reference = await readReference('design.md');

  for (const expected of [
    'Design Phase',
    '歧义扫描与 Proposal 路由',
    'Proposal 完成后的任务分析',
    'Proposal 批准 Gate 与路径选择',
    '开始实现',
    'make plan',
    '"$ONESPEC_BASH" "$ONESPEC_STATE" recover <change-id>',
    '`next_reference`',
    'visual companion',
    '可扩展模块',
    '`text-only`',
    'rollout / migration / compatibility',
    'non-goals',
    '只有用户明确批准 proposal / design / spec 后，才允许进入实现计划',
    '显式编号选项 + 推荐项',
    '用户只需回复数字编号',
    '推荐组合，而不是只推荐抽象路线',
    'git rev-parse --path-format=absolute --git-dir',
    '不要再二次询问 `subagent/local` 或 `worktree/current-branch`',
    '`Superpowers + subagent + new worktree`',
    '`Superpowers + subagent + current worktree/current branch`',
    '不要推荐再创建新的 worktree',
    '`低复杂度`：默认推荐原生 `OpenSpec apply`',
    '默认要求先按项目提交规范创建本地 commit，再创建临时分支 / worktree',
  ]) {
    expectIncludes(reference, expected);
  }

  assert.doesNotMatch(reference, /可直接回复/);
  assert.doesNotMatch(reference, /批准，按推荐路径继续/);
  assert.doesNotMatch(reference, /批准，但我要改实现路径/);
  assert.doesNotMatch(reference, /使用 Superpowers/);
  assert.doesNotMatch(reference, /使用 OpenSpec apply/);
});

test('execute reference documents apply, planning, and implementation guardrails', async () => {
  const reference = await readReference('execute.md');

  for (const expected of [
    'Execute Phase',
    'Apply 路由',
    '开始实现',
    'make plan',
    '"$ONESPEC_BASH" "$ONESPEC_STATE" recover <change-id>',
    '`allowed_actions`',
    '默认不是“直接实现”，而是先把已批准的 OpenSpec change 翻译成 Superpowers 可执行计划',
    '.onespec.yaml',
    'touched_files_b64',
    '"$ONESPEC_BASH" "$ONESPEC_COMMIT" track <change-id> <path>...',
    '临时压缩包、导出包',
    '"$ONESPEC_BASH" "$ONESPEC_STATE" set <change-id> phase implementing',
    'origin_branch',
    'origin_workspace_path',
    '按推荐组合继续',
    '当前已经在附加 worktree 中时',
    '`Superpowers + subagent + current worktree/current branch`',
    '不要再二次询问 `subagent/local` 或 `worktree/current-branch`',
    '默认要求先按项目提交规范创建本地 commit，再创建 worktree',
    '实现工作区定位',
    'implementation_workspace_path',
    'git -C "$implementation_workspace_path" status',
    '不得在原工作区先写计划再复制到实现 worktree',
    '所有读取 OpenSpec artifacts、写入 Superpowers plan、更新 `.onespec.yaml`、生成 handoff 与后续实现命令，都必须以实现工作区为工作目录',
    '优先使用 `subagent-driven-development`',
    '强制遵守 `test-driven-development`',
    '不允许实现结果与已批准 OpenSpec 范围静默漂移',
    '必须明确暂停',
    'review-closeout',
    '进入用户评审',
    '直接给出收尾动作菜单',
    '归档当前 change，并合并分支到 base 分支',
    '直接归档，不合并到 base 分支',
    '删除当前临时 worktree，废弃代码',
    'recommend-actions <change-id>',
    '不在临时 worktree 时，不管当前目标分支叫 `main`、`master`、`develop`、`feature/*` 还是其他名称，都不要提示合并分支/删除 worktree',
    '用户未输入时默认停留在当前评审阶段',
    'openspec validate <change-id> --strict',
  ]) {
    expectIncludes(reference, expected);
  }
});

test('archive reference documents review closeout and archive guardrails', async () => {
  const reference = await readReference('archive.md');

  for (const expected of [
    'Archive Phase',
    '用户评审',
    '任意非编号内容',
    '继续修改当前实现',
    '"$ONESPEC_BASH" "$ONESPEC_STATE" recover <change-id>',
    'Superpowers Worktree 优先规则',
    'origin_workspace_mode=worktree',
    '差异化收尾规则',
    '`archive-then-merge-worktree`',
    '`archive-only`',
    '`discard-worktree`',
    '归档当前 change，并合并分支到 base 分支',
    '直接归档，不合并到 base 分支',
    '删除当前临时 worktree，废弃代码',
    'recommend-actions <change-id>',
    '不在临时 worktree 时，不管当前目标分支叫 `main`、`master`、`develop`、`feature/*` 还是其他名称，都不要提示合并分支/删除 worktree',
    '当前分支名',
    'origin_branch',
    '临时实现分支或临时 worktree',
    'OpenSpec archive',
    'related-dirty <change-id>',
    'commit-related <change-id> <closeout|archive|preserve-state>',
    'detect-policy <change-id>',
    '已经回复了收尾编号',
    '按用户已选动作直接执行',
    '不需要拆成两轮确认',
    '先归档，再合并',
    'run-actions <change-id> [archive-then-merge-worktree|archive-only|discard-worktree]',
    '.onespec.yaml',
    '临时压缩包、导出包或交接工件',
    'merge / rebase / push 仍不自动执行',
    'cleanup-runtime <change-id>',
    'archive <skipped|archived>',
  ]) {
    expectIncludes(reference, expected);
  }

  for (const unexpected of [
    '创建 PR',
    '创建 MR',
    'PR/MR',
    'command -v gh',
    'command -v glab',
    '必须再次要求用户给出明确指令',
  ]) {
    assert.doesNotMatch(reference, new RegExp(unexpected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('fast reference documents direct proposal, native apply, and archive', async () => {
  const reference = await readReference('fast.md');

  for (const expected of [
    'Fast Path',
    '直接 Proposal',
    'OpenSpec 自动开发与归档',
    'implementation_path openspec-apply',
    'execution_method native',
    'phase implementing',
    'openspec validate <change-id> --strict',
    'run-actions <change-id> archive-only',
  ]) {
    expectIncludes(reference, expected);
  }

  for (const unexpected of [
    '强制复杂度检查',
    '中高复杂度回退',
    'Proposal 批准 Gate',
    '复杂度 <low\\|medium\\|high>',
  ]) {
    assert.doesNotMatch(reference, new RegExp(unexpected));
  }
});

test('English overlays exist for public skills and references', async () => {
  for (const skillName of BUNDLED_SKILLS) {
    const content = await readEnglishSkill(skillName);
    expectIncludes(content, `name: ${skillName}`);
  }

  for (const reference of REFERENCES) {
    expectIncludes(await readEnglishReference(reference), '# ');
  }

  expectIncludes(await readEnglishSkill('onespec'), '# OneSpec Workflow');
  expectIncludes(await readEnglishSkill('onespec'), 'references/design.md');
  expectIncludes(await readEnglishSkill('onespec-fast'), '# OneSpec Fast');
  expectIncludes(await readEnglishSkill('onespec-fast'), '../onespec/references/fast.md');
  expectIncludes(await readEnglishReference('design.md'), '# Design Phase');
  expectIncludes(await readEnglishReference('execute.md'), '# Execute Phase');
  expectIncludes(await readEnglishReference('archive.md'), '# Archive Phase');
  expectIncludes(await readEnglishReference('fast.md'), '# Fast Path');
  expectIncludes(await readEnglishReference('design.md'), 'text-only');
  expectIncludes(
    await readEnglishReference('design.md'),
    'explicit options + recommendation + direct reply phrase',
  );
  expectIncludes(
    await readEnglishReference('design.md'),
    'Direct reply phrase: `approve and use the recommended path`',
  );
  expectIncludes(await readEnglishReference('design.md'), 'the recommended combination');
  expectIncludes(
    await readEnglishReference('design.md'),
    'git rev-parse --path-format=absolute --git-dir',
  );
  expectIncludes(
    await readEnglishReference('design.md'),
    'do not ask a second round for `subagent/local` or `worktree/current-branch`',
  );
  expectIncludes(
    await readEnglishReference('design.md'),
    '`Superpowers + subagent + current worktree/current branch`',
  );
  expectIncludes(await readEnglishReference('execute.md'), 'phase implementing');
  expectIncludes(await readEnglishReference('execute.md'), 'Implementation-Complete Gate');
  expectIncludes(await readEnglishReference('execute.md'), 'Mandatory Script Calls');
  expectIncludes(await readEnglishReference('execute.md'), 'numbered next-step menu');
  expectIncludes(await readEnglishReference('execute.md'), 'continue with the recommended combination');
  expectIncludes(
    await readEnglishReference('execute.md'),
    'When already inside an attached worktree',
  );
  expectIncludes(await readEnglishReference('execute.md'), 'Anti-Patterns');
  expectIncludes(
    await readEnglishReference('execute.md'),
    '"$ONESPEC_BASH" "$ONESPEC_STATE" recover <change-id>',
  );
  expectIncludes(
    await readEnglishReference('design.md'),
    "require a local commit that follows the project's commit policy before creating the temporary branch/worktree",
  );
  expectIncludes(
    await readEnglishReference('execute.md'),
    'require a local commit that follows the project commit policy before creating the worktree',
  );
  expectIncludes(await readEnglishReference('execute.md'), 'Implementation Workspace Binding');
  expectIncludes(await readEnglishReference('execute.md'), 'implementation_workspace_path');
  expectIncludes(await readEnglishReference('execute.md'), 'git -C "$implementation_workspace_path" status');
  expectIncludes(
    await readEnglishReference('execute.md'),
    'Do not write the plan in the origin workspace and then copy it into the implementation worktree',
  );
  expectIncludes(
    await readEnglishReference('execute.md'),
    'Every OpenSpec artifact read, Superpowers plan write, `.onespec.yaml` update, handoff generation, and implementation command must run with the implementation workspace as the working directory',
  );
  expectIncludes(await readEnglishReference('execute.md'), 'temporary zip, export bundle');
  expectIncludes(
    await readEnglishReference('execute.md'),
    'Archive the current change, then merge the branch into the base branch',
  );
  expectIncludes(
    await readEnglishReference('execute.md'),
    'when `temporary_worktree: false`, do not prompt for branch merge or worktree deletion on any target branch',
  );
  expectIncludes(await readEnglishReference('execute.md'), 'Archive only, without merging');
  expectIncludes(
    await readEnglishReference('execute.md'),
    'Delete the current temporary worktree and discard the code',
  );
  expectIncludes(
    await readEnglishReference('archive.md'),
    'Archive the current change, then merge the branch into the base branch',
  );
  expectIncludes(
    await readEnglishReference('archive.md'),
    'when `temporary_worktree: false`, do not prompt for branch merge or worktree deletion on any target branch',
  );
  expectIncludes(await readEnglishReference('archive.md'), 'Archive only, without merging');
  expectIncludes(
    await readEnglishReference('archive.md'),
    'Delete the current temporary worktree and discard the code',
  );
  expectIncludes(await readEnglishReference('archive.md'), 'run `archive-then-merge-worktree`');
  expectIncludes(await readEnglishReference('archive.md'), 'temporary zip files, export bundles');
  expectIncludes(await readEnglishReference('design.md'), 'extensible module');
  expectIncludes(
    await readEnglishReference('fast.md'),
    'skip the normal proposal approval gate, complexity check, implementation-path selection, and post-implementation archive choice',
  );
  expectIncludes(await readEnglishReference('fast.md'), 'run-actions <change-id> archive-only');
  assert.doesNotMatch(
    await readEnglishReference('archive.md'),
    /require one more explicit archive command/i,
  );
});

test('README documents onespec-fast as direct native apply without complexity routing', async () => {
  const readme = await readFile('README.md', 'utf8');
  const readmeZh = await readFile('README-zh.md', 'utf8');

  expectIncludes(readme, '`onespec-fast` is the shorter path for explicitly automatic OpenSpec changes');
  expectIncludes(readme, 'skips the complexity check');
  expectIncludes(readmeZh, '`onespec-fast` 是明确要求自动贯通的 OpenSpec change 的更短路径');
  expectIncludes(readmeZh, '跳过复杂度检查');
});

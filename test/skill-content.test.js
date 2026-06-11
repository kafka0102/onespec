import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';

const BUNDLED_SKILLS = ['onespec', 'onespec-design', 'onespec-execute', 'onespec-archive'];

async function readSkill(name) {
  return readFile(`assets/skills/${name}/SKILL.md`, 'utf8');
}

async function readEnglishSkill(name) {
  return readFile(`assets/skills-en/${name}/SKILL.md`, 'utf8');
}

function expectIncludes(content, expected) {
  assert.match(content, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}

test('OneSpec bundle exposes router plus design, execute, and archive skills', async () => {
  const skills = await readdir('assets/skills');

  for (const skillName of BUNDLED_SKILLS) {
    assert.ok(skills.includes(skillName), `${skillName} should exist`);
    expectIncludes(await readSkill(skillName), `name: ${skillName}`);
  }
});

test('onespec router combines the three phase skills without duplicating phase details', async () => {
  const skill = await readSkill('onespec');

  for (const expected of [
    'OneSpec 工作流',
    'onespec-design',
    'onespec-execute',
    'onespec-archive',
    '恢复优先',
    '.onespec.yaml',
    'next_skill',
    '上一阶段的 gate 已完成',
    'propose',
    'apply',
    'review-closeout',
  ]) {
    expectIncludes(skill, expected);
  }

  assert.doesNotMatch(skill, /## 6\. Superpowers Make Plan 与实现/);
  assert.doesNotMatch(skill, /## 7\. 原生 OpenSpec Apply、评审与收尾/);
});

test('onespec-design documents proposal and approval routing guardrails', async () => {
  const skill = await readSkill('onespec-design');

  for (const expected of [
    '歧义扫描与 Proposal 路由',
    'Proposal 完成后的任务分析',
    'Proposal 批准 Gate 与路径选择',
    '开始实现',
    'make plan',
    '"$ONESPEC_BASH" "$ONESPEC_STATE" recover <change-id>',
    '`next_gate`',
    'visual companion',
    '可扩展模块',
    '`text-only`',
    'rollout / migration / compatibility',
    'non-goals',
    '只有用户明确批准 proposal / design / spec 后，才允许进入实现计划',
    '显式选项 + 推荐项 + 可直接回复的口令',
    '可直接回复：`批准，按推荐路径继续`',
    '可直接回复：`使用 worktree`',
    '`低复杂度`：默认推荐原生 `OpenSpec apply`',
  ]) {
    expectIncludes(skill, expected);
  }
});

test('onespec-execute documents apply, planning, and implementation guardrails', async () => {
  const skill = await readSkill('onespec-execute');

  for (const expected of [
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
    '优先使用 `subagent-driven-development`',
    '强制遵守 `test-driven-development`',
    '不允许实现结果与已批准 OpenSpec 范围静默漂移',
    '必须明确暂停',
    'review-closeout',
    '进入用户评审',
    '直接给出收尾动作菜单',
    '可直接回复 `1,3`',
    '合并临时 worktree 到 base 分支',
    '执行归档',
    '任意非编号内容视为继续修改当前实现',
    '不要只停在“下一步应进入 `onespec-archive`”',
    'openspec validate <change-id> --strict',
  ]) {
    expectIncludes(skill, expected);
  }
});

test('onespec-archive documents review closeout and archive guardrails', async () => {
  const skill = await readSkill('onespec-archive');

  for (const expected of [
    '用户评审',
    '任意非编号内容',
    '继续修改当前实现',
    '"$ONESPEC_BASH" "$ONESPEC_STATE" recover <change-id>',
    'Superpowers Worktree 优先规则',
    'origin_workspace_mode=worktree',
    'worktree 收尾规则',
    '`merge-worktree`',
    '`discard-worktree`',
    '`merge-worktree,archive`',
    '合并临时 worktree 到 base 分支',
    '删除临时 worktree，废弃代码',
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
    'run-actions <change-id> [merge-worktree|discard-worktree|delete-worktree|archive]',
    '.onespec.yaml',
    '临时压缩包、导出包或交接工件',
    'merge / rebase / push 仍不自动执行',
    'cleanup-runtime <change-id>',
    'archive <skipped|archived>',
  ]) {
    expectIncludes(skill, expected);
  }

  for (const unexpected of [
    '创建 PR',
    '创建 MR',
    'PR/MR',
    'command -v gh',
    'command -v glab',
    '必须再次要求用户给出明确指令',
  ]) {
    assert.doesNotMatch(skill, new RegExp(unexpected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('English skill overlays exist for the full OneSpec bundle', async () => {
  for (const skillName of BUNDLED_SKILLS) {
    const content = await readEnglishSkill(skillName);
    expectIncludes(content, `name: ${skillName}`);
  }

  expectIncludes(await readEnglishSkill('onespec'), '# OneSpec Workflow');
  expectIncludes(await readEnglishSkill('onespec-design'), '# OneSpec Design');
  expectIncludes(await readEnglishSkill('onespec-execute'), '# OneSpec Execute');
  expectIncludes(await readEnglishSkill('onespec-archive'), '# OneSpec Archive');
  expectIncludes(await readEnglishSkill('onespec-design'), 'text-only');
  expectIncludes(
    await readEnglishSkill('onespec-design'),
    'explicit options + recommendation + direct reply phrase'
  );
  expectIncludes(
    await readEnglishSkill('onespec-design'),
    'Direct reply phrase: `approve and use the recommended path`'
  );
  expectIncludes(await readEnglishSkill('onespec-execute'), 'phase implementing');
  expectIncludes(await readEnglishSkill('onespec-execute'), 'Implementation-Complete Gate');
  expectIncludes(await readEnglishSkill('onespec-execute'), 'Mandatory Script Calls');
  expectIncludes(await readEnglishSkill('onespec-execute'), 'numbered next-step menu');
  expectIncludes(await readEnglishSkill('onespec-execute'), 'Anti-Patterns');
  expectIncludes(await readEnglishSkill('onespec-execute'), '"$ONESPEC_BASH" "$ONESPEC_STATE" recover <change-id>');
  expectIncludes(await readEnglishSkill('onespec-execute'), 'temporary zip, export bundle');
  expectIncludes(await readEnglishSkill('onespec-archive'), 'Merge the temporary worktree into the base branch');
  expectIncludes(await readEnglishSkill('onespec-archive'), 'Delete the temporary worktree and discard the code');
  expectIncludes(await readEnglishSkill('onespec-archive'), 'run `merge-worktree,archive`');
  expectIncludes(await readEnglishSkill('onespec-archive'), 'temporary zip files, export bundles');
  expectIncludes(await readEnglishSkill('onespec-design'), 'extensible module');
  assert.doesNotMatch(
    await readEnglishSkill('onespec-archive'),
    /require one more explicit archive command/i
  );
});

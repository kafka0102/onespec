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
    'visual companion',
    'rollout / migration / compatibility',
    'non-goals',
    '只有用户明确批准 proposal / design / spec 后，才允许进入实现计划',
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
    '默认不是“直接实现”，而是先把已批准的 OpenSpec change 翻译成 Superpowers 可执行计划',
    'touched-files.txt',
    '"$ONESPEC_BASH" "$ONESPEC_COMMIT" track <change-id> <path>...',
    'origin_branch',
    'origin_workspace_path',
    '优先使用 `subagent-driven-development`',
    '强制遵守 `test-driven-development`',
    '不允许实现结果与已批准 OpenSpec 范围静默漂移',
    '必须明确暂停',
    'review-closeout',
    '进入收尾',
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
    'continue',
    '继续评审',
    '收尾前能力探测',
    'command -v gh',
    'command -v glab',
    'glab auth status --hostname <host>',
    'review_request_supported=true|false',
    '无法创建 MR：未检测到 glab，或 glab 未登录到 <host>。',
    'Superpowers Worktree 优先规则',
    'origin_workspace_mode=worktree',
    '成功创建 `PR` / `MR` 后，删除本地临时 branch / worktree',
    '多选收尾组合',
    '`提交 PR/MR`',
    '`{合并分支, 执行归档}`',
    '`{}`',
    '创建 PR',
    '本地合并',
    '保留分支',
    '确认创建 PR',
    '确认本地合并',
    '确认保留分支',
    '执行归档',
    '当前分支名',
    'origin_branch',
    '临时实现分支或临时 worktree',
    '本地合并',
    'PR/MR',
    '保留',
    'GitHub',
    'GitLab',
    '不要默认自动合并 worktree 到 `main`',
    'OpenSpec archive',
    'related-dirty <change-id>',
    'stage-related <change-id>',
    'detect-policy <change-id>',
    'touched-files.txt',
    'archive <skipped|archived>',
  ]) {
    expectIncludes(skill, expected);
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
});

import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';

const BUNDLED_SKILLS = ['onespec', 'onespec-design', 'onespec-execute', 'onespec-archive'];

async function readSkill(name) {
  return readFile(`assets/skills/${name}/SKILL.md`, 'utf8');
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
    '优先使用 `subagent-driven-development`',
    '强制遵守 `test-driven-development`',
    '不允许实现结果与已批准 OpenSpec 范围静默漂移',
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
    '本地合并',
    'PR/MR',
    '保留',
    '不要默认自动合并 worktree 到 `main`',
    'OpenSpec archive',
    'archive <skipped|archived>',
  ]) {
    expectIncludes(skill, expected);
  }
});

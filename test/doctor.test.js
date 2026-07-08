import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { doctorProject } from '../src/doctor.js';
import { initProject } from '../src/init.js';
import { getProjectSkillDir } from '../src/platforms.js';

const BUNDLED_ONESPEC = ['onespec', 'onespec-fast'];

async function tmpProject() {
  return mkdtemp(path.join(os.tmpdir(), 'onespec-doctor-'));
}

function projectSkillPath(projectPath, platform, ...parts) {
  return path.join(getProjectSkillDir(projectPath, platform), ...parts);
}

async function addSkill(projectPath, platform, name) {
  const skillDir = projectSkillPath(projectPath, platform, name);
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    path.join(skillDir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: test fixture\n---\n`,
  );
}

test('doctorProject reports missing dependencies without touching the network', async () => {
  const projectPath = await tmpProject();

  const report = await doctorProject(projectPath, {
    platform: 'codex',
    scope: 'project',
    skillRoots: [],
    commandChecker: () => false,
  });

  assert.equal(report.onespec.installed, false);
  assert.equal(report.openspecCli.available, false);
  assert.equal(report.hasOpenSpecProject, false);
  assert.equal(report.superpowers.available, false);
  assert.match(report.nextSteps.join('\n'), /onespec init/);
  assert.match(report.nextSteps.join('\n'), /OpenSpec CLI/);
  assert.match(report.nextSteps.join('\n'), /Superpowers/);
});

test('doctorProject passes when OneSpec and required Superpowers skills are installed', async () => {
  const projectPath = await tmpProject();
  await initProject(projectPath, { platform: 'codex', scope: 'project', yes: true });

  for (const skill of [
    'brainstorming',
    'writing-plans',
    'using-git-worktrees',
    'subagent-driven-development',
    'executing-plans',
    'test-driven-development',
  ]) {
    await addSkill(projectPath, 'codex', skill);
  }

  const report = await doctorProject(projectPath, {
    platform: 'codex',
    scope: 'project',
    skillRoots: [getProjectSkillDir(projectPath, 'codex')],
    commandChecker: (command) => command === 'openspec',
  });

  assert.equal(report.onespec.installed, true);
  assert.equal(report.onespec.language, 'zh');
  assert.deepEqual(report.onespec.installedSkills, BUNDLED_ONESPEC);
  assert.deepEqual(report.onespec.missingSkills, []);
  assert.deepEqual(report.onespec.missingFiles, []);
  assert.equal(report.openspecCli.available, true);
  assert.equal(report.hasOpenSpecProject, false);
  assert.equal(report.superpowers.available, true);
  assert.deepEqual(report.superpowers.missing, []);
  assert.deepEqual(report.nextSteps, [
    '当前项目尚未初始化 OpenSpec。请手动运行 `openspec init <项目路径> --tools codex` 完成初始化。',
  ]);
});

test('doctorProject reports missing bundled OneSpec fast entrypoint and references', async () => {
  const projectPath = await tmpProject();
  await addSkill(projectPath, 'codex', 'onespec');

  const report = await doctorProject(projectPath, {
    platform: 'codex',
    scope: 'project',
    skillRoots: [],
    commandChecker: () => true,
  });

  assert.equal(report.onespec.installed, false);
  assert.deepEqual(report.onespec.installedSkills, ['onespec']);
  assert.deepEqual(report.onespec.missingSkills, ['onespec-fast']);
  assert.deepEqual(report.onespec.missingFiles, [
    path.join('onespec', 'references/design.md'),
    path.join('onespec', 'references/execute.md'),
    path.join('onespec', 'references/archive.md'),
    path.join('onespec', 'references/fast.md'),
  ]);
  assert.match(report.nextSteps.join('\n'), /onespec init --platform codex --overwrite/);
});

test('doctorProject detects English OneSpec bundle language', async () => {
  const projectPath = await tmpProject();
  await initProject(projectPath, {
    platform: 'codex',
    scope: 'project',
    yes: true,
    language: 'en',
  });

  const report = await doctorProject(projectPath, {
    platform: 'codex',
    scope: 'project',
    skillRoots: [],
    commandChecker: () => false,
  });

  assert.equal(report.onespec.installed, true);
  assert.equal(report.onespec.english, true);
  assert.equal(report.onespec.language, 'en');
});

test('doctorProject can detect Superpowers from an alternate global-style skills root', async () => {
  const projectPath = await tmpProject();
  const globalRoot = await tmpProject();
  await initProject(projectPath, { platform: 'codex', scope: 'project', yes: true });

  for (const skill of [
    'brainstorming',
    'writing-plans',
    'using-git-worktrees',
    'subagent-driven-development',
    'executing-plans',
    'test-driven-development',
  ]) {
    const skillDir = path.join(globalRoot, 'superpowers', 'skills', skill);
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      path.join(skillDir, 'SKILL.md'),
      `---\nname: ${skill}\ndescription: global fixture\n---\n`,
    );
  }

  const report = await doctorProject(projectPath, {
    platform: 'codex',
    scope: 'project',
    skillRoots: [path.join(globalRoot, 'superpowers', 'skills')],
    commandChecker: (command) => command === 'openspec',
  });

  assert.equal(report.superpowers.available, true);
  assert.deepEqual(report.superpowers.missing, []);
});

test('doctorProject supports Claude Code installs', async () => {
  const projectPath = await tmpProject();
  await initProject(projectPath, {
    platform: 'claude-code',
    scope: 'project',
    yes: true,
  });

  for (const skill of [
    'brainstorming',
    'writing-plans',
    'using-git-worktrees',
    'subagent-driven-development',
    'executing-plans',
    'test-driven-development',
  ]) {
    await addSkill(projectPath, 'claude-code', skill);
  }

  const report = await doctorProject(projectPath, {
    platform: 'claude-code',
    scope: 'project',
    skillRoots: [getProjectSkillDir(projectPath, 'claude-code')],
    commandChecker: () => false,
  });

  assert.equal(report.platform, 'claude-code');
  assert.equal(report.platformName, 'Claude Code');
  assert.equal(report.onespec.installed, true);
  assert.equal(report.superpowers.available, true);
});

for (const platform of [
  { id: 'cursor', name: 'Cursor' },
  { id: 'gemini-cli', name: 'Gemini CLI' },
  { id: 'github-copilot', name: 'GitHub Copilot' },
]) {
  test(`doctorProject supports ${platform.name} installs`, async () => {
    const projectPath = await tmpProject();
    await initProject(projectPath, {
      platform: platform.id,
      scope: 'project',
      yes: true,
    });

    for (const skill of [
      'brainstorming',
      'writing-plans',
      'using-git-worktrees',
      'subagent-driven-development',
      'executing-plans',
      'test-driven-development',
    ]) {
      await addSkill(projectPath, platform.id, skill);
    }

    const report = await doctorProject(projectPath, {
      platform: platform.id,
      scope: 'project',
      skillRoots: [getProjectSkillDir(projectPath, platform.id)],
      commandChecker: () => false,
    });

    assert.equal(report.platform, platform.id);
    assert.equal(report.platformName, platform.name);
    assert.equal(report.onespec.installed, true);
    assert.equal(report.superpowers.available, true);
  });
}

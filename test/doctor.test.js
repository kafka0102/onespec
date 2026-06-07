import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { doctorProject } from '../src/doctor.js';
import { initProject } from '../src/init.js';

const BUNDLED_ONESPEC = ['onespec', 'onespec-design', 'onespec-execute', 'onespec-archive'];

async function tmpProject() {
  return mkdtemp(path.join(os.tmpdir(), 'onespec-doctor-'));
}

async function addSkill(projectPath, name) {
  const skillDir = path.join(projectPath, '.codex', 'skills', name);
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
    await addSkill(projectPath, skill);
  }

  const report = await doctorProject(projectPath, {
    platform: 'codex',
    scope: 'project',
    skillRoots: [path.join(projectPath, '.codex', 'skills')],
    commandChecker: (command) => command === 'openspec',
  });

  assert.equal(report.onespec.installed, true);
  assert.equal(report.onespec.language, 'zh');
  assert.deepEqual(report.onespec.installedSkills, BUNDLED_ONESPEC);
  assert.deepEqual(report.onespec.missingSkills, []);
  assert.equal(report.openspecCli.available, true);
  assert.equal(report.hasOpenSpecProject, false);
  assert.equal(report.superpowers.available, true);
  assert.deepEqual(report.superpowers.missing, []);
  assert.deepEqual(report.nextSteps, ['当前项目尚未初始化 OpenSpec，请先运行 `openspec init`。']);
});

test('doctorProject reports missing bundled OneSpec child skills', async () => {
  const projectPath = await tmpProject();
  await addSkill(projectPath, 'onespec');

  const report = await doctorProject(projectPath, {
    platform: 'codex',
    scope: 'project',
    skillRoots: [],
    commandChecker: () => true,
  });

  assert.equal(report.onespec.installed, false);
  assert.deepEqual(report.onespec.installedSkills, ['onespec']);
  assert.deepEqual(report.onespec.missingSkills, [
    'onespec-design',
    'onespec-execute',
    'onespec-archive',
  ]);
  assert.match(report.nextSteps.join('\n'), /onespec init --overwrite/);
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

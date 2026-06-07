import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';

import { initProject } from '../src/init.js';

const execFileAsync = promisify(execFile);

async function tmpProject() {
  return mkdtemp(path.join(os.tmpdir(), 'onespec-init-'));
}

const BUNDLED_SKILLS = ['onespec', 'onespec-design', 'onespec-execute', 'onespec-archive'];

test('initProject installs bundled OneSpec skills and creates working directories', async () => {
  const projectPath = await tmpProject();

  const result = await initProject(projectPath, {
    platform: 'codex',
    scope: 'project',
    yes: true,
  });

  assert.equal(result.projectPath, projectPath);
  assert.equal(result.scope, 'project');
  assert.equal(result.platform, 'codex');
  assert.equal(result.installedSkill, true);
  assert.deepEqual(result.installedSkills, BUNDLED_SKILLS);

  for (const skillName of BUNDLED_SKILLS) {
    const skillPath = path.join(projectPath, '.codex', 'skills', skillName, 'SKILL.md');
    assert.match(await readFile(skillPath, 'utf8'), new RegExp(`name: ${skillName}`));
  }

  const stateScriptPath = path.join(
    projectPath,
    '.codex',
    'skills',
    'onespec',
    'scripts',
    'onespec-state.sh',
  );
  const handoffScriptPath = path.join(
    projectPath,
    '.codex',
    'skills',
    'onespec',
    'scripts',
    'onespec-handoff.sh',
  );
  const commitScriptPath = path.join(
    projectPath,
    '.codex',
    'skills',
    'onespec',
    'scripts',
    'onespec-commit.sh',
  );
  const closeoutScriptPath = path.join(
    projectPath,
    '.codex',
    'skills',
    'onespec',
    'scripts',
    'onespec-closeout.sh',
  );

  assert.equal((await stat(stateScriptPath)).mode & 0o111, 0o111);
  assert.equal((await stat(handoffScriptPath)).mode & 0o111, 0o111);
  assert.equal((await stat(commitScriptPath)).mode & 0o111, 0o111);
  assert.equal((await stat(closeoutScriptPath)).mode & 0o111, 0o111);

  await stat(path.join(projectPath, 'docs', 'superpowers', 'plans'));
  await stat(path.join(projectPath, 'docs', 'superpowers', 'specs'));
});

test('CLI init installs Chinese OneSpec skill with json output', async () => {
  const projectPath = await tmpProject();

  const { stdout } = await execFileAsync(
    process.execPath,
    ['bin/onespec.js', 'init', projectPath, '--yes', '--json'],
    { cwd: path.resolve('.') },
  );
  const result = JSON.parse(stdout);
  const skill = await readFile(
    path.join(projectPath, '.codex', 'skills', 'onespec', 'SKILL.md'),
    'utf8',
  );

  assert.equal(result.platform, 'codex');
  assert.equal(result.scope, 'project');
  assert.equal(result.language, 'zh');
  assert.equal(result.installedSkill, true);
  assert.deepEqual(result.installedSkills, BUNDLED_SKILLS);
  assert.match(skill, /OneSpec 工作流/);
  assert.doesNotMatch(skill, /Language for/);
});

test('initProject can install English skill overlays', async () => {
  const projectPath = await tmpProject();

  const result = await initProject(projectPath, {
    platform: 'codex',
    scope: 'project',
    yes: true,
    language: 'en',
  });

  const routerSkill = await readFile(
    path.join(projectPath, '.codex', 'skills', 'onespec', 'SKILL.md'),
    'utf8',
  );

  assert.equal(result.language, 'en');
  assert.equal(result.languageName, 'English');
  assert.match(routerSkill, /# OneSpec Workflow/);
  assert.doesNotMatch(routerSkill, /# OneSpec 工作流/);
});

test('initProject installs missing bundled skills even when router already exists', async () => {
  const projectPath = await tmpProject();
  const routerDir = path.join(projectPath, '.codex', 'skills', 'onespec');
  await mkdir(routerDir, { recursive: true });

  const result = await initProject(projectPath, {
    platform: 'codex',
    scope: 'project',
    yes: true,
  });

  assert.equal(result.installedSkill, true);
  assert.deepEqual(result.installedSkills, ['onespec-design', 'onespec-execute', 'onespec-archive']);
  assert.deepEqual(result.skippedSkills, ['onespec']);

  for (const skillName of ['onespec-design', 'onespec-execute', 'onespec-archive']) {
    await stat(path.join(projectPath, '.codex', 'skills', skillName, 'SKILL.md'));
  }
});

test('initProject skips existing skill unless overwrite is requested', async () => {
  const projectPath = await tmpProject();

  const first = await initProject(projectPath, {
    platform: 'codex',
    scope: 'project',
    yes: true,
  });
  const second = await initProject(projectPath, {
    platform: 'codex',
    scope: 'project',
    yes: true,
  });
  const third = await initProject(projectPath, {
    platform: 'codex',
    scope: 'project',
    yes: true,
    overwrite: true,
  });

  assert.equal(first.installedSkill, true);
  assert.equal(second.installedSkill, false);
  assert.equal(second.skippedExisting, true);
  assert.deepEqual(second.installedSkills, []);
  assert.deepEqual(second.skippedSkills, BUNDLED_SKILLS);
  assert.equal(third.installedSkill, true);
  assert.equal(third.skippedExisting, false);
  assert.deepEqual(third.installedSkills, BUNDLED_SKILLS);
});

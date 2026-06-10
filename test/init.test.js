import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';

import { initProject } from '../src/init.js';
import { getProjectSkillDir } from '../src/platforms.js';

const execFileAsync = promisify(execFile);

async function tmpProject() {
  return mkdtemp(path.join(os.tmpdir(), 'onespec-init-'));
}

const BUNDLED_SKILLS = ['onespec', 'onespec-design', 'onespec-execute', 'onespec-archive'];

function projectSkillPath(projectPath, platform, ...parts) {
  return path.join(getProjectSkillDir(projectPath, platform), ...parts);
}

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
    const skillPath = projectSkillPath(projectPath, 'codex', skillName, 'SKILL.md');
    assert.match(await readFile(skillPath, 'utf8'), new RegExp(`name: ${skillName}`));
  }

  const stateScriptPath = projectSkillPath(projectPath, 'codex', 'onespec', 'scripts', 'onespec-state.sh');
  const handoffScriptPath = projectSkillPath(
    projectPath,
    'codex',
    'onespec',
    'scripts',
    'onespec-handoff.sh',
  );
  const commitScriptPath = projectSkillPath(
    projectPath,
    'codex',
    'onespec',
    'scripts',
    'onespec-commit.sh',
  );
  const closeoutScriptPath = projectSkillPath(
    projectPath,
    'codex',
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
  const skill = await readFile(projectSkillPath(projectPath, 'codex', 'onespec', 'SKILL.md'), 'utf8');

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
    projectSkillPath(projectPath, 'codex', 'onespec', 'SKILL.md'),
    'utf8',
  );

  assert.equal(result.language, 'en');
  assert.equal(result.languageName, 'English');
  assert.match(routerSkill, /# OneSpec Workflow/);
  assert.doesNotMatch(routerSkill, /# OneSpec 工作流/);
});

test('initProject installs missing bundled skills even when router already exists', async () => {
  const projectPath = await tmpProject();
  const routerDir = projectSkillPath(projectPath, 'codex', 'onespec');
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
    await stat(projectSkillPath(projectPath, 'codex', skillName, 'SKILL.md'));
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

test('initProject supports Claude Code project installs', async () => {
  const projectPath = await tmpProject();

  const result = await initProject(projectPath, {
    platform: 'claude-code',
    scope: 'project',
    yes: true,
    language: 'en',
  });

  assert.equal(result.platform, 'claude-code');
  assert.equal(result.platformName, 'Claude Code');

  for (const skillName of BUNDLED_SKILLS) {
    const skillPath = projectSkillPath(projectPath, 'claude-code', skillName, 'SKILL.md');
    assert.match(await readFile(skillPath, 'utf8'), new RegExp(`name: ${skillName}`));
  }

  const routerSkill = await readFile(
    projectSkillPath(projectPath, 'claude-code', 'onespec', 'SKILL.md'),
    'utf8',
  );
  assert.match(routerSkill, /# OneSpec Workflow/);
  assert.match(routerSkill, /\$HOME"\/\.claude/);
});

for (const platform of [
  { id: 'cursor', name: 'Cursor' },
  { id: 'gemini-cli', name: 'Gemini CLI' },
  { id: 'github-copilot', name: 'GitHub Copilot' },
]) {
  test(`initProject supports ${platform.name} project installs`, async () => {
    const projectPath = await tmpProject();

    const result = await initProject(projectPath, {
      platform: platform.id,
      scope: 'project',
      yes: true,
      language: 'en',
    });

    assert.equal(result.platform, platform.id);
    assert.equal(result.platformName, platform.name);

    for (const skillName of BUNDLED_SKILLS) {
      const skillPath = projectSkillPath(projectPath, platform.id, skillName, 'SKILL.md');
      assert.match(await readFile(skillPath, 'utf8'), new RegExp(`name: ${skillName}`));
    }

    const routerSkill = await readFile(
      projectSkillPath(projectPath, platform.id, 'onespec', 'SKILL.md'),
      'utf8',
    );
    assert.match(routerSkill, /# OneSpec Workflow/);
    assert.match(routerSkill, /\$HOME"\/\.cursor|\$HOME"\/\.gemini|\$HOME"\/\.copilot/);
  });
}

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';

import { initProject } from '../src/init.js';
import { getProjectSkillDir } from '../src/platforms.js';
import {
  buildOpenSpecInitCommand,
  buildSuperpowersInstallCommand,
  initWorkspace,
} from '../src/setup.js';

const execFileAsync = promisify(execFile);

async function tmpProject() {
  return mkdtemp(path.join(os.tmpdir(), 'onespec-init-'));
}

const BUNDLED_SKILLS = [
  'onespec',
  'onespec-fast',
  'onespec-design',
  'onespec-execute',
  'onespec-archive',
];

function projectSkillPath(projectPath, platform, ...parts) {
  return path.join(getProjectSkillDir(projectPath, platform), ...parts);
}

async function createFakeExecutable(binDir, name, source) {
  const filePath = path.join(binDir, name);
  await writeFile(filePath, source, 'utf8');
  await chmod(filePath, 0o755);
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
  const binDir = await mkdtemp(path.join(os.tmpdir(), 'onespec-bin-'));
  const logPath = path.join(binDir, 'tool.log');

  await createFakeExecutable(
    binDir,
    'openspec',
    `#!/bin/sh
echo "openspec:$@" >> "${logPath}"
if [ "$1" = "init" ]; then
  mkdir -p "$2/openspec"
fi
`,
  );
  await createFakeExecutable(
    binDir,
    'npx',
    `#!/bin/sh
echo "npx:$@" >> "${logPath}"
`,
  );

  const { stdout } = await execFileAsync(
    process.execPath,
    ['bin/onespec.js', 'init', projectPath, '--platform', 'codex,cursor', '--yes', '--json'],
    {
      cwd: path.resolve('.'),
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH}`,
      },
    },
  );
  const result = JSON.parse(stdout);
  const skill = await readFile(projectSkillPath(projectPath, 'codex', 'onespec', 'SKILL.md'), 'utf8');
  const cursorSkill = await readFile(
    projectSkillPath(projectPath, 'cursor', 'onespec', 'SKILL.md'),
    'utf8',
  );
  const toolLog = await readFile(logPath, 'utf8');

  assert.deepEqual(result.platforms, ['codex', 'cursor']);
  assert.equal(result.scope, 'project');
  assert.equal(result.language, 'zh');
  assert.equal(result.openspecCli.status, 'present');
  assert.equal(result.results.length, 2);
  assert.match(skill, /OneSpec 工作流/);
  assert.match(cursorSkill, /OneSpec 工作流/);
  assert.doesNotMatch(skill, /Language for/);
  assert.match(toolLog, /openspec:init/);
  assert.match(toolLog, /--tools codex,cursor/);
  assert.match(toolLog, /npx:skills add obra\/superpowers -y --agent codex --agent cursor/);
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
  assert.deepEqual(result.installedSkills, [
    'onespec-fast',
    'onespec-design',
    'onespec-execute',
    'onespec-archive',
  ]);
  assert.deepEqual(result.skippedSkills, ['onespec']);

  for (const skillName of ['onespec-fast', 'onespec-design', 'onespec-execute', 'onespec-archive']) {
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

test('buildOpenSpecInitCommand targets selected platforms and scope', async () => {
  const command = buildOpenSpecInitCommand('/tmp/project', ['codex', 'cursor'], 'project', '/tmp/home');
  const globalCommand = buildOpenSpecInitCommand(
    '/tmp/project',
    ['claude-code'],
    'global',
    '/tmp/home',
  );

  assert.equal(command.command, 'openspec');
  assert.deepEqual(command.args, ['init', '/tmp/project', '--tools', 'codex,cursor']);
  assert.deepEqual(globalCommand.args, ['init', '/tmp/home', '--tools', 'claude-code']);
});

test('buildSuperpowersInstallCommand uses repeated agent flags', async () => {
  const command = buildSuperpowersInstallCommand(['codex', 'cursor'], 'project');
  const globalCommand = buildSuperpowersInstallCommand(['github-copilot'], 'global');

  assert.match(command.command, /^npx/);
  assert.deepEqual(command.args, [
    'skills',
    'add',
    'obra/superpowers',
    '-y',
    '--agent',
    'codex',
    '--agent',
    'cursor',
  ]);
  assert.deepEqual(globalCommand.args, [
    'skills',
    'add',
    'obra/superpowers',
    '-y',
    '-g',
    '--agent',
    'github-copilot',
  ]);
});

test('initWorkspace installs missing OpenSpec CLI before initializing workspace', async () => {
  const projectPath = await tmpProject();
  const commands = [];
  let openspecAvailable = false;

  const result = await initWorkspace(
    projectPath,
    {
      scope: 'global',
      language: 'en',
      platforms: ['claude-code'],
      yes: true,
    },
    {
      homeDir: '/tmp/onespec-home',
      commandExists: (command) => {
        if (command !== 'openspec') {
          return true;
        }
        return openspecAvailable;
      },
      runCommand: (command, args, cwd) => {
        commands.push({ command, args, cwd });
        if (command === 'npm' || command === 'npm.cmd') {
          openspecAvailable = true;
        }
      },
      initProject: async (_projectPath, options) => ({
        platform: options.platform,
        platformName: 'Claude Code',
        skillPath: `/fake/${options.platform}`,
        installedSkill: true,
        installedSkills: BUNDLED_SKILLS,
        skippedSkills: [],
      }),
    },
  );

  assert.equal(result.openspecCli.status, 'installed');
  assert.deepEqual(commands[0], {
    command: 'npm',
    args: ['install', '-g', '@fission-ai/openspec@latest'],
    cwd: projectPath,
  });
  assert.deepEqual(commands[1], {
    command: 'openspec',
    args: ['init', '/tmp/onespec-home', '--tools', 'claude-code'],
    cwd: projectPath,
  });
  assert.deepEqual(commands[2], {
    command: 'npx',
    args: ['skills', 'add', 'obra/superpowers', '-y', '-g', '--agent', 'claude-code'],
    cwd: projectPath,
  });
});

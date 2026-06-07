import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';

const execFileAsync = promisify(execFile);

async function tmpProject() {
  return mkdtemp(path.join(os.tmpdir(), 'onespec-state-'));
}

test('onespec-state initializes, updates, and recovers change state', async () => {
  const projectPath = await tmpProject();
  const scriptPath = path.resolve('assets/skills/onespec/scripts/onespec-state.sh');

  await mkdir(path.join(projectPath, 'openspec', 'changes', 'add-login'), { recursive: true });

  await execFileAsync('bash', [scriptPath, 'init', 'add-login'], { cwd: projectPath });
  await execFileAsync('bash', [scriptPath, 'set', 'add-login', 'phase', 'proposal-ready'], {
    cwd: projectPath,
  });
  await execFileAsync('bash', [scriptPath, 'set', 'add-login', 'implementation_path', 'superpowers'], {
    cwd: projectPath,
  });

  const { stdout: phase } = await execFileAsync(
    'bash',
    [scriptPath, 'get', 'add-login', 'phase'],
    { cwd: projectPath },
  );
  const { stdout: recovery } = await execFileAsync(
    'bash',
    [scriptPath, 'recover', 'add-login'],
    { cwd: projectPath },
  );

  assert.equal(phase.trim(), 'proposal-ready');
  assert.match(recovery, /change: add-login/);
  assert.match(recovery, /phase: proposal-ready/);
  assert.match(recovery, /implementation_path: superpowers/);

  const state = await readFile(
    path.join(projectPath, 'openspec', 'changes', 'add-login', '.onespec.yaml'),
    'utf8',
  );
  assert.match(state, /phase: proposal-ready/);
});

test('onespec-handoff creates deterministic compact context and records hash', async () => {
  const projectPath = await tmpProject();
  const stateScriptPath = path.resolve('assets/skills/onespec/scripts/onespec-state.sh');
  const handoffScriptPath = path.resolve('assets/skills/onespec/scripts/onespec-handoff.sh');
  const changeDir = path.join(projectPath, 'openspec', 'changes', 'add-login');

  await mkdir(path.join(changeDir, 'specs', 'auth'), { recursive: true });
  await writeFile(path.join(changeDir, 'proposal.md'), '# Proposal\n\nAdd login.\n');
  await writeFile(path.join(changeDir, 'design.md'), '# Design\n\nUse existing auth.\n');
  await writeFile(path.join(changeDir, 'tasks.md'), '# Tasks\n\n- [ ] Add login form\n');
  await writeFile(
    path.join(changeDir, 'specs', 'auth', 'spec.md'),
    '## ADDED Requirements\n\n### Requirement: Login\nUsers can login.\n',
  );

  await execFileAsync('bash', [stateScriptPath, 'init', 'add-login'], { cwd: projectPath });
  await execFileAsync('bash', [handoffScriptPath, 'add-login', 'proposal', '--write'], {
    cwd: projectPath,
  });

  const context = await readFile(
    path.join(changeDir, '.onespec', 'handoff', 'proposal-context.md'),
    'utf8',
  );
  const state = await readFile(path.join(changeDir, '.onespec.yaml'), 'utf8');

  assert.match(context, /Generated-by: onespec-handoff.sh/);
  assert.match(context, /openspec\/changes\/add-login\/proposal.md/);
  assert.match(state, /handoff_context: openspec\/changes\/add-login\/.onespec\/handoff\/proposal-context.json/);
  assert.match(state, /handoff_hash: [a-f0-9]{64}/);
});

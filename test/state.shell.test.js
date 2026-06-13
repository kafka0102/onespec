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
  await execFileAsync('bash', [scriptPath, 'set', 'add-login', 'origin_branch', 'main'], {
    cwd: projectPath,
  });
  await execFileAsync(
    'bash',
    [scriptPath, 'set', 'add-login', 'origin_workspace_path', '/tmp/project'],
    {
      cwd: projectPath,
    },
  );

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
  assert.match(recovery, /origin_branch: main/);
  assert.match(recovery, /origin_workspace_path: \/tmp\/project/);
  assert.match(recovery, /handoff_summary: null/);

  const state = await readFile(
    path.join(projectPath, 'openspec', 'changes', 'add-login', '.onespec.yaml'),
    'utf8',
  );
  assert.match(state, /phase: proposal-ready/);
  assert.match(state, /origin_branch: main/);
});

test('onespec-state rejects invalid enum values and illegal phase transitions', async () => {
  const projectPath = await tmpProject();
  const scriptPath = path.resolve('assets/skills/onespec/scripts/onespec-state.sh');

  await mkdir(path.join(projectPath, 'openspec', 'changes', 'guardrails'), { recursive: true });
  await execFileAsync('bash', [scriptPath, 'init', 'guardrails'], { cwd: projectPath });

  await assert.rejects(
    execFileAsync('bash', [scriptPath, 'set', 'guardrails', 'implementation_path', 'maybe'], {
      cwd: projectPath,
    }),
    /invalid value .*implementation_path/,
  );
  await assert.rejects(
    execFileAsync('bash', [scriptPath, 'set', 'guardrails', 'phase', 'review'], {
      cwd: projectPath,
    }),
    /illegal phase transition/,
  );
});

test('onespec-state allows execution-oriented phase transitions and emits structured recovery hints', async () => {
  const projectPath = await tmpProject();
  const scriptPath = path.resolve('assets/skills/onespec/scripts/onespec-state.sh');

  await mkdir(path.join(projectPath, 'openspec', 'changes', 'ship-login'), { recursive: true });
  await execFileAsync('bash', [scriptPath, 'init', 'ship-login'], { cwd: projectPath });
  await execFileAsync('bash', [scriptPath, 'set', 'ship-login', 'phase', 'proposal-ready'], {
    cwd: projectPath,
  });
  await execFileAsync('bash', [scriptPath, 'set', 'ship-login', 'phase', 'approved'], {
    cwd: projectPath,
  });
  await execFileAsync('bash', [scriptPath, 'set', 'ship-login', 'phase', 'plan-ready'], {
    cwd: projectPath,
  });
  await execFileAsync('bash', [scriptPath, 'set', 'ship-login', 'phase', 'implementing'], {
    cwd: projectPath,
  });

  const { stdout: recovery } = await execFileAsync(
    'bash',
    [scriptPath, 'recover', 'ship-login'],
    { cwd: projectPath },
  );

  assert.match(recovery, /phase: implementing/);
  assert.match(recovery, /next_skill: onespec/);
  assert.match(recovery, /next_reference: references\/execute\.md/);
  assert.match(recovery, /next_gate: implementation-in-progress/);
  assert.match(recovery, /allowed_actions: continue-implementation,update-tasks,run-tests/);
});

test('onespec-handoff records deterministic review state in the single runtime file', async () => {
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
  const { stdout } = await execFileAsync('bash', [handoffScriptPath, 'add-login', 'proposal', '--write'], {
    cwd: projectPath,
  });

  const state = await readFile(path.join(changeDir, '.onespec.yaml'), 'utf8');

  assert.equal(stdout.trim(), path.join('openspec', 'changes', 'add-login', '.onespec.yaml'));
  assert.match(state, /handoff_context: openspec\/changes\/add-login\/.onespec.yaml/);
  assert.match(state, /handoff_purpose: proposal/);
  assert.match(state, /handoff_summary: proposal handoff from 4 file\(s\); primary artifact: openspec\/changes\/add-login\/proposal\.md/);
  assert.match(state, /handoff_hash: [a-f0-9]{64}/);
});

test('onespec-state review recovery tells the user how to enter closeout', async () => {
  const projectPath = await tmpProject();
  const scriptPath = path.resolve('assets/skills/onespec/scripts/onespec-state.sh');

  await mkdir(path.join(projectPath, 'openspec', 'changes', 'archive-login'), { recursive: true });
  await execFileAsync('bash', [scriptPath, 'init', 'archive-login'], { cwd: projectPath });
  await execFileAsync('bash', [scriptPath, 'set', 'archive-login', 'phase', 'proposal-ready'], {
    cwd: projectPath,
  });
  await execFileAsync('bash', [scriptPath, 'set', 'archive-login', 'phase', 'approved'], {
    cwd: projectPath,
  });
  await execFileAsync('bash', [scriptPath, 'set', 'archive-login', 'phase', 'implementing'], {
    cwd: projectPath,
  });
  await execFileAsync('bash', [scriptPath, 'set', 'archive-login', 'phase', 'review'], {
    cwd: projectPath,
  });

  const { stdout: recovery } = await execFileAsync(
    'bash',
    [scriptPath, 'recover', 'archive-login'],
    { cwd: projectPath },
  );

  assert.match(recovery, /读取 `references\/archive\.md`/);
  assert.match(recovery, /next_skill: onespec/);
  assert.match(recovery, /next_reference: references\/archive\.md/);
  assert.match(recovery, /next_gate: user-review-closeout/);
  assert.match(recovery, /allowed_actions: request-changes,choose-closeout-action,direct-instruction/);
});

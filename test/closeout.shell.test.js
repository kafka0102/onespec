import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';

const execFileAsync = promisify(execFile);

async function tmpProject(prefix = 'onespec-closeout-') {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

async function initGitRepo(projectPath) {
  await execFileAsync('git', ['init', '-b', 'main'], { cwd: projectPath });
  await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: projectPath });
  await execFileAsync('git', ['config', 'user.name', 'OneSpec Test'], { cwd: projectPath });
  await writeFile(path.join(projectPath, 'README.md'), '# test\n');
  await execFileAsync('git', ['add', 'README.md'], { cwd: projectPath });
  await execFileAsync('git', ['commit', '-m', 'init'], { cwd: projectPath });
}

async function initChangeState(projectPath, change, overrides = {}) {
  const stateScriptPath = path.resolve('assets/skills/onespec/scripts/onespec-state.sh');
  await mkdir(path.join(projectPath, 'openspec', 'changes', change), { recursive: true });
  await execFileAsync('bash', [stateScriptPath, 'init', change], { cwd: projectPath });

  for (const [key, value] of Object.entries(overrides)) {
    await execFileAsync('bash', [stateScriptPath, 'set', change, key, value], { cwd: projectPath });
  }
}

test('onespec-closeout inspect reports worktree cleanup defaults and local merge recommendation', async () => {
  const projectPath = await tmpProject();
  const worktreePath = await tmpProject('onespec-closeout-wt-');
  const closeoutScriptPath = path.resolve('assets/skills/onespec/scripts/onespec-closeout.sh');

  await initGitRepo(projectPath);
  await initChangeState(projectPath, 'add-login', {
    origin_branch: 'main',
    origin_workspace_path: projectPath,
    origin_workspace_mode: 'worktree',
  });

  await execFileAsync('git', ['worktree', 'add', '-b', 'feature/add-login', worktreePath, 'HEAD'], {
    cwd: projectPath,
  });
  await mkdir(path.join(worktreePath, 'openspec', 'changes', 'add-login'), { recursive: true });
  await execFileAsync('bash', [path.resolve('assets/skills/onespec/scripts/onespec-state.sh'), 'init', 'add-login'], {
    cwd: worktreePath,
  });
  await execFileAsync('bash', [path.resolve('assets/skills/onespec/scripts/onespec-state.sh'), 'set', 'add-login', 'origin_branch', 'main'], {
    cwd: worktreePath,
  });
  await execFileAsync(
    'bash',
    [
      path.resolve('assets/skills/onespec/scripts/onespec-state.sh'),
      'set',
      'add-login',
      'origin_workspace_path',
      projectPath,
    ],
    { cwd: worktreePath },
  );
  await execFileAsync(
    'bash',
    [
      path.resolve('assets/skills/onespec/scripts/onespec-state.sh'),
      'set',
      'add-login',
      'origin_workspace_mode',
      'worktree',
    ],
    { cwd: worktreePath },
  );

  const { stdout } = await execFileAsync('bash', [closeoutScriptPath, 'inspect', 'add-login'], {
    cwd: worktreePath,
  });

  assert.match(stdout, /temporary_worktree: true/);
  assert.match(stdout, /cleanup_local_branch_after_merge: true/);
  assert.match(stdout, /cleanup_local_worktree_after_merge: true/);
  assert.match(stdout, /cleanup_local_branch_after_preserve: false/);
  assert.match(stdout, /recommended_actions: merge/);
});

test('onespec-closeout validate-actions allows archive on target branch and recommends merge plus archive there', async () => {
  const projectPath = await tmpProject();
  const closeoutScriptPath = path.resolve('assets/skills/onespec/scripts/onespec-closeout.sh');

  await initGitRepo(projectPath);
  await initChangeState(projectPath, 'archive-login', {
    origin_branch: 'main',
    origin_workspace_path: projectPath,
    origin_workspace_mode: 'current-branch',
  });

  const invalid = await execFileAsync(
    'bash',
    [closeoutScriptPath, 'validate-actions', 'archive-login', 'archive'],
    { cwd: projectPath },
  );
  const recommended = await execFileAsync('bash', [closeoutScriptPath, 'recommend-actions', 'archive-login'], {
    cwd: projectPath,
  });

  assert.match(invalid.stdout, /selected_actions: archive/);
  assert.match(invalid.stdout, /valid: true/);
  assert.match(invalid.stdout, /允许单独执行归档：当前已在目标分支路径上。/);
  assert.match(recommended.stdout, /temporary_worktree: false/);
  assert.match(recommended.stdout, /recommended_actions: merge,archive/);
});

test('onespec-closeout validate-actions rejects archive without merge from a temporary worktree', async () => {
  const projectPath = await tmpProject();
  const worktreePath = await tmpProject('onespec-closeout-wt-');
  const closeoutScriptPath = path.resolve('assets/skills/onespec/scripts/onespec-closeout.sh');
  const stateScriptPath = path.resolve('assets/skills/onespec/scripts/onespec-state.sh');

  await initGitRepo(projectPath);
  await initChangeState(projectPath, 'ship-login', {
    origin_branch: 'main',
    origin_workspace_path: projectPath,
    origin_workspace_mode: 'worktree',
  });

  await execFileAsync('git', ['worktree', 'add', '-b', 'feature/ship-login', worktreePath, 'HEAD'], {
    cwd: projectPath,
  });
  await mkdir(path.join(worktreePath, 'openspec', 'changes', 'ship-login'), { recursive: true });
  await execFileAsync('bash', [stateScriptPath, 'init', 'ship-login'], { cwd: worktreePath });
  await execFileAsync('bash', [stateScriptPath, 'set', 'ship-login', 'origin_branch', 'main'], {
    cwd: worktreePath,
  });
  await execFileAsync(
    'bash',
    [stateScriptPath, 'set', 'ship-login', 'origin_workspace_path', projectPath],
    { cwd: worktreePath },
  );
  await execFileAsync(
    'bash',
    [stateScriptPath, 'set', 'ship-login', 'origin_workspace_mode', 'worktree'],
    { cwd: worktreePath },
  );

  const { stdout } = await execFileAsync(
    'bash',
    [closeoutScriptPath, 'validate-actions', 'ship-login', 'archive'],
    { cwd: worktreePath },
  );

  assert.match(stdout, /selected_actions: archive/);
  assert.match(stdout, /valid: false/);
  assert.match(stdout, /不能单独执行归档：当前代码尚未确认位于目标分支。/);
});

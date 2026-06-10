import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
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

async function advanceChangeToReview(projectPath, change) {
  const stateScriptPath = path.resolve('assets/skills/onespec/scripts/onespec-state.sh');
  for (const phase of ['proposal-ready', 'approved', 'implementing', 'review']) {
    await execFileAsync('bash', [stateScriptPath, 'set', change, 'phase', phase], { cwd: projectPath });
  }
}

async function writeFakeArchiveBin(projectPath) {
  const scriptPath = path.join(projectPath, 'fake-openspec.sh');
  const logPath = path.join(projectPath, 'archive.log');
  await writeFile(
    scriptPath,
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "${logPath}"
change="$2"
if [ -d "openspec/changes/$change" ]; then
  mkdir -p "openspec/changes/archive"
  rm -rf "openspec/changes/archive/$change"
  mv "openspec/changes/$change" "openspec/changes/archive/$change"
  printf 'archived\\n' > "openspec/changes/archive/$change/archive-note.txt"
fi
`,
    { mode: 0o755 },
  );
  return { scriptPath, logPath };
}

test('onespec-closeout inspect reports worktree cleanup defaults and delete-worktree-plus-archive recommendation', async () => {
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
  assert.match(stdout, /recommended_actions: delete-worktree,archive/);
});

test('onespec-closeout validate-actions allows archive on target branch and recommends archive there', async () => {
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
  assert.match(recommended.stdout, /recommended_actions: archive/);
});

test('onespec-closeout validate-actions rejects archive without deleting a temporary worktree', async () => {
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

test('onespec-closeout validate-actions supports delete-worktree-only and delete-worktree-plus-archive from a temporary worktree', async () => {
  const projectPath = await tmpProject();
  const worktreePath = await tmpProject('onespec-closeout-wt-');
  const closeoutScriptPath = path.resolve('assets/skills/onespec/scripts/onespec-closeout.sh');
  const stateScriptPath = path.resolve('assets/skills/onespec/scripts/onespec-state.sh');

  await initGitRepo(projectPath);
  await initChangeState(projectPath, 'trim-login', {
    origin_branch: 'main',
    origin_workspace_path: projectPath,
    origin_workspace_mode: 'worktree',
  });

  await execFileAsync('git', ['worktree', 'add', '-b', 'feature/trim-login', worktreePath, 'HEAD'], {
    cwd: projectPath,
  });
  await mkdir(path.join(worktreePath, 'openspec', 'changes', 'trim-login'), { recursive: true });
  await execFileAsync('bash', [stateScriptPath, 'init', 'trim-login'], { cwd: worktreePath });
  await execFileAsync('bash', [stateScriptPath, 'set', 'trim-login', 'origin_branch', 'main'], {
    cwd: worktreePath,
  });
  await execFileAsync(
    'bash',
    [stateScriptPath, 'set', 'trim-login', 'origin_workspace_path', projectPath],
    { cwd: worktreePath },
  );
  await execFileAsync(
    'bash',
    [stateScriptPath, 'set', 'trim-login', 'origin_workspace_mode', 'worktree'],
    { cwd: worktreePath },
  );

  const deleteOnly = await execFileAsync(
    'bash',
    [closeoutScriptPath, 'validate-actions', 'trim-login', 'delete-worktree'],
    { cwd: worktreePath },
  );
  const deleteAndArchive = await execFileAsync(
    'bash',
    [closeoutScriptPath, 'validate-actions', 'trim-login', 'delete-worktree', 'archive'],
    { cwd: worktreePath },
  );

  assert.match(deleteOnly.stdout, /selected_actions: delete-worktree/);
  assert.match(deleteOnly.stdout, /valid: true/);
  assert.match(deleteOnly.stdout, /允许仅删除临时 worktree；之后仍可单独执行归档。/);

  assert.match(deleteAndArchive.stdout, /selected_actions: delete-worktree,archive/);
  assert.match(deleteAndArchive.stdout, /valid: true/);
  assert.match(deleteAndArchive.stdout, /允许先删除临时 worktree，再继续归档。/);
});

test('onespec-closeout cleanup-runtime removes the single runtime state file only when requested', async () => {
  const projectPath = await tmpProject();
  const closeoutScriptPath = path.resolve('assets/skills/onespec/scripts/onespec-closeout.sh');
  const statePath = path.join(projectPath, 'openspec', 'changes', 'cleanup-login', '.onespec.yaml');

  await initGitRepo(projectPath);
  await initChangeState(projectPath, 'cleanup-login');
  await access(statePath);

  const { stdout } = await execFileAsync('bash', [closeoutScriptPath, 'cleanup-runtime', 'cleanup-login'], {
    cwd: projectPath,
  });

  assert.equal(stdout.trim(), 'openspec/changes/cleanup-login/.onespec.yaml');
  await assert.rejects(access(statePath));
});

test('onespec-closeout run-actions executes archive once and removes runtime state on the target branch', async () => {
  const projectPath = await tmpProject();
  const closeoutScriptPath = path.resolve('assets/skills/onespec/scripts/onespec-closeout.sh');
  const commitScriptPath = path.resolve('assets/skills/onespec/scripts/onespec-commit.sh');
  const statePath = path.join(projectPath, 'openspec', 'changes', 'archive-run', '.onespec.yaml');
  const { scriptPath: archiveBin, logPath } = await writeFakeArchiveBin(projectPath);

  await initGitRepo(projectPath);
  await initChangeState(projectPath, 'archive-run', {
    origin_branch: 'main',
    origin_workspace_path: projectPath,
    origin_workspace_mode: 'current-branch',
  });
  await advanceChangeToReview(projectPath, 'archive-run');
  await mkdir(path.join(projectPath, 'src'), { recursive: true });
  await writeFile(path.join(projectPath, 'src', 'app.js'), 'console.log("v1");\n');
  await execFileAsync('git', ['add', 'src/app.js'], { cwd: projectPath });
  await execFileAsync('git', ['commit', '-m', 'seed app'], { cwd: projectPath });
  await execFileAsync('bash', [commitScriptPath, 'track', 'archive-run', 'src/app.js'], { cwd: projectPath });
  await writeFile(path.join(projectPath, 'src', 'app.js'), 'console.log("v2");\n');
  await writeFile(path.join(projectPath, 'openspec', 'changes', 'archive-run', 'proposal.md'), '# Proposal\n');

  const { stdout } = await execFileAsync(
    'bash',
    [closeoutScriptPath, 'run-actions', 'archive-run', 'archive'],
    {
      cwd: projectPath,
      env: { ...process.env, ONESPEC_ARCHIVE_BIN: archiveBin },
    },
  );

  assert.match(stdout, /selected_actions: archive/);
  assert.match(stdout, /archive_executed: true/);
  assert.match(stdout, /worktree_deleted: false/);
  assert.match(stdout, /pre_closeout_commit_created: true/);
  assert.match(stdout, /post_archive_commit_created: true/);
  assert.match(stdout, /preserved_state_commit_created: false/);
  assert.match(await readFile(logPath, 'utf8'), /archive archive-run --yes/);
  await assert.rejects(access(statePath));

  const { stdout: subjects } = await execFileAsync('git', ['log', '-2', '--pretty=%s'], { cwd: projectPath });
  assert.deepEqual(subjects.trim().split('\n'), [
    'chore(docs): archive archive-run',
    'chore(src): record archive-run before closeout',
  ]);

  const { stdout: status } = await execFileAsync('git', ['status', '--porcelain=v1'], { cwd: projectPath });
  assert.deepEqual(status.trim().split('\n').sort(), ['?? archive.log', '?? fake-openspec.sh']);
});

test('onespec-closeout run-actions deletes a temporary worktree and preserves runtime state in origin workspace', async () => {
  const projectPath = await tmpProject();
  const worktreePath = await tmpProject('onespec-closeout-wt-');
  const closeoutScriptPath = path.resolve('assets/skills/onespec/scripts/onespec-closeout.sh');
  const stateScriptPath = path.resolve('assets/skills/onespec/scripts/onespec-state.sh');
  const commitScriptPath = path.resolve('assets/skills/onespec/scripts/onespec-commit.sh');
  const preservedStatePath = path.join(projectPath, 'openspec', 'changes', 'preserve-login', '.onespec.yaml');

  await initGitRepo(projectPath);
  await initChangeState(projectPath, 'preserve-login', {
    origin_branch: 'main',
    origin_workspace_path: projectPath,
    origin_workspace_mode: 'worktree',
  });
  await advanceChangeToReview(projectPath, 'preserve-login');

  await execFileAsync('git', ['worktree', 'add', '-b', 'feature/preserve-login', worktreePath, 'HEAD'], {
    cwd: projectPath,
  });
  await mkdir(path.join(worktreePath, 'openspec', 'changes', 'preserve-login'), { recursive: true });
  await execFileAsync('bash', [stateScriptPath, 'init', 'preserve-login'], { cwd: worktreePath });
  await execFileAsync('bash', [stateScriptPath, 'set', 'preserve-login', 'origin_branch', 'main'], {
    cwd: worktreePath,
  });
  await execFileAsync(
    'bash',
    [stateScriptPath, 'set', 'preserve-login', 'origin_workspace_path', projectPath],
    { cwd: worktreePath },
  );
  await execFileAsync(
    'bash',
    [stateScriptPath, 'set', 'preserve-login', 'origin_workspace_mode', 'worktree'],
    { cwd: worktreePath },
  );
  await advanceChangeToReview(worktreePath, 'preserve-login');
  await mkdir(path.join(worktreePath, 'src'), { recursive: true });
  await writeFile(path.join(worktreePath, 'src', 'feature.js'), 'export const feature = 1;\n');
  await execFileAsync('git', ['add', 'src/feature.js'], { cwd: worktreePath });
  await execFileAsync('git', ['commit', '-m', 'seed feature'], { cwd: worktreePath });
  await execFileAsync('bash', [commitScriptPath, 'track', 'preserve-login', 'src/feature.js'], { cwd: worktreePath });
  await writeFile(path.join(worktreePath, 'src', 'feature.js'), 'export const feature = 2;\n');

  const { stdout } = await execFileAsync(
    'bash',
    [closeoutScriptPath, 'run-actions', 'preserve-login', 'delete-worktree'],
    { cwd: worktreePath },
  );

  assert.match(stdout, /selected_actions: delete-worktree/);
  assert.match(stdout, /archive_executed: false/);
  assert.match(stdout, /worktree_deleted: true/);
  assert.match(stdout, /pre_closeout_commit_created: true/);
  assert.match(stdout, /post_archive_commit_created: false/);
  assert.match(stdout, /preserved_state_commit_created: true/);
  await assert.rejects(access(worktreePath));

  const preservedState = await readFile(preservedStatePath, 'utf8');
  assert.match(preservedState, /phase: done/);
  assert.match(preservedState, /archive: skipped/);

  const { stdout: originStatus } = await execFileAsync('git', ['status', '--porcelain=v1'], { cwd: projectPath });
  assert.equal(originStatus.trim(), '');

  const { stdout: originSubject } = await execFileAsync('git', ['log', '-1', '--pretty=%s'], { cwd: projectPath });
  assert.equal(originSubject.trim(), 'chore(docs): preserve preserve-login closeout state');

  const { stdout: branchSubject } = await execFileAsync(
    'git',
    ['log', 'feature/preserve-login', '-1', '--pretty=%s'],
    { cwd: projectPath },
  );
  assert.equal(branchSubject.trim(), 'chore(src): record preserve-login before closeout');
});

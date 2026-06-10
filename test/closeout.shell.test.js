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

test('onespec-closeout inspect asks for merge-or-discard when temporary worktree targets main', async () => {
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
  assert.match(stdout, /cleanup_local_branch_after_discard: true/);
  assert.match(stdout, /cleanup_local_worktree_after_discard: true/);
  assert.match(stdout, /recommended_actions: prompt-merge-or-discard/);
  assert.match(stdout, /recommended_reason: temporary-worktree-targets-main-or-master/);
});

test('onespec-closeout inspect recommends automatic merge when temporary worktree targets a feature base branch', async () => {
  const projectPath = await tmpProject();
  const worktreePath = await tmpProject('onespec-closeout-wt-');
  const closeoutScriptPath = path.resolve('assets/skills/onespec/scripts/onespec-closeout.sh');
  const stateScriptPath = path.resolve('assets/skills/onespec/scripts/onespec-state.sh');

  await initGitRepo(projectPath);
  await execFileAsync('git', ['checkout', '-b', 'release/risk'], { cwd: projectPath });
  await initChangeState(projectPath, 'feature-login', {
    origin_branch: 'release/risk',
    origin_workspace_path: projectPath,
    origin_workspace_mode: 'worktree',
  });

  await execFileAsync('git', ['worktree', 'add', '-b', 'feature/login', worktreePath, 'HEAD'], {
    cwd: projectPath,
  });
  await mkdir(path.join(worktreePath, 'openspec', 'changes', 'feature-login'), { recursive: true });
  await execFileAsync('bash', [stateScriptPath, 'init', 'feature-login'], { cwd: worktreePath });
  await execFileAsync('bash', [stateScriptPath, 'set', 'feature-login', 'origin_branch', 'release/risk'], {
    cwd: worktreePath,
  });
  await execFileAsync(
    'bash',
    [stateScriptPath, 'set', 'feature-login', 'origin_workspace_path', projectPath],
    { cwd: worktreePath },
  );
  await execFileAsync(
    'bash',
    [stateScriptPath, 'set', 'feature-login', 'origin_workspace_mode', 'worktree'],
    { cwd: worktreePath },
  );

  const { stdout } = await execFileAsync('bash', [closeoutScriptPath, 'inspect', 'feature-login'], {
    cwd: worktreePath,
  });

  assert.match(stdout, /temporary_worktree: true/);
  assert.match(stdout, /origin_branch: release\/risk/);
  assert.match(stdout, /recommended_actions: merge-worktree/);
  assert.match(stdout, /recommended_reason: temporary-worktree-targets-feature-branch/);
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

test('onespec-closeout validate-actions supports merge-or-discard from a temporary worktree and rejects archive combinations', async () => {
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

  const mergeWorktree = await execFileAsync(
    'bash',
    [closeoutScriptPath, 'validate-actions', 'trim-login', 'merge-worktree'],
    { cwd: worktreePath },
  );
  const discardWorktree = await execFileAsync(
    'bash',
    [closeoutScriptPath, 'validate-actions', 'trim-login', 'discard-worktree'],
    { cwd: worktreePath },
  );
  const mergeAndArchive = await execFileAsync(
    'bash',
    [closeoutScriptPath, 'validate-actions', 'trim-login', 'merge-worktree', 'archive'],
    { cwd: worktreePath },
  );

  assert.match(mergeWorktree.stdout, /selected_actions: merge-worktree/);
  assert.match(mergeWorktree.stdout, /valid: true/);
  assert.match(mergeWorktree.stdout, /允许合并临时 worktree 到 main 并删除 worktree；合并后需要再询问是否归档。/);

  assert.match(discardWorktree.stdout, /selected_actions: discard-worktree/);
  assert.match(discardWorktree.stdout, /valid: true/);
  assert.match(discardWorktree.stdout, /允许删除临时 worktree 并废弃对应本地分支代码；废弃后不应归档。/);

  assert.match(mergeAndArchive.stdout, /selected_actions: merge-worktree,archive/);
  assert.match(mergeAndArchive.stdout, /valid: false/);
  assert.match(mergeAndArchive.stdout, /合并完成后应再询问用户是否归档。/);
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

test('onespec-closeout run-actions merges a temporary worktree into a feature base branch and removes the worktree', async () => {
  const projectPath = await tmpProject();
  const worktreePath = await tmpProject('onespec-closeout-wt-');
  const closeoutScriptPath = path.resolve('assets/skills/onespec/scripts/onespec-closeout.sh');
  const stateScriptPath = path.resolve('assets/skills/onespec/scripts/onespec-state.sh');
  const commitScriptPath = path.resolve('assets/skills/onespec/scripts/onespec-commit.sh');

  await initGitRepo(projectPath);
  await execFileAsync('git', ['checkout', '-b', 'release/risk'], { cwd: projectPath });
  await initChangeState(projectPath, 'merge-login', {
    origin_branch: 'release/risk',
    origin_workspace_path: projectPath,
    origin_workspace_mode: 'worktree',
  });
  await advanceChangeToReview(projectPath, 'merge-login');
  await execFileAsync('git', ['add', 'openspec/changes/merge-login'], { cwd: projectPath });
  await execFileAsync('git', ['commit', '-m', 'seed merge-login state'], { cwd: projectPath });

  await execFileAsync('git', ['worktree', 'add', '-b', 'feature/merge-login', worktreePath, 'HEAD'], {
    cwd: projectPath,
  });
  await mkdir(path.join(worktreePath, 'openspec', 'changes', 'merge-login'), { recursive: true });
  await execFileAsync('bash', [stateScriptPath, 'init', 'merge-login'], { cwd: worktreePath });
  await execFileAsync('bash', [stateScriptPath, 'set', 'merge-login', 'origin_branch', 'release/risk'], {
    cwd: worktreePath,
  });
  await execFileAsync(
    'bash',
    [stateScriptPath, 'set', 'merge-login', 'origin_workspace_path', projectPath],
    { cwd: worktreePath },
  );
  await execFileAsync(
    'bash',
    [stateScriptPath, 'set', 'merge-login', 'origin_workspace_mode', 'worktree'],
    { cwd: worktreePath },
  );
  await mkdir(path.join(worktreePath, 'src'), { recursive: true });
  await writeFile(path.join(worktreePath, 'src', 'feature.js'), 'export const feature = 1;\n');
  await execFileAsync('bash', [commitScriptPath, 'track', 'merge-login', 'src/feature.js'], { cwd: worktreePath });

  const { stdout } = await execFileAsync(
    'bash',
    [closeoutScriptPath, 'run-actions', 'merge-login', 'merge-worktree'],
    { cwd: worktreePath },
  );

  assert.match(stdout, /selected_actions: merge-worktree/);
  assert.match(stdout, /worktree_merged: true/);
  assert.match(stdout, /merged_branch: feature\/merge-login/);
  assert.match(stdout, /worktree_deleted: true/);
  assert.match(stdout, /archive_executed: false/);
  assert.match(stdout, /pre_closeout_commit_created: true/);
  await assert.rejects(access(worktreePath));
  await access(path.join(projectPath, 'src', 'feature.js'));

  const state = await readFile(path.join(projectPath, 'openspec', 'changes', 'merge-login', '.onespec.yaml'), 'utf8');
  assert.match(state, /phase: done/);
  assert.match(state, /archive: skipped/);

  const { stdout: branch } = await execFileAsync('git', ['branch', '--show-current'], { cwd: projectPath });
  assert.equal(branch.trim(), 'release/risk');

  const branches = await execFileAsync('git', ['branch', '--list', 'feature/merge-login'], { cwd: projectPath });
  assert.equal(branches.stdout.trim(), '');
});

test('onespec-closeout run-actions discards a temporary worktree branch without merging it', async () => {
  const projectPath = await tmpProject();
  const worktreePath = await tmpProject('onespec-closeout-wt-');
  const closeoutScriptPath = path.resolve('assets/skills/onespec/scripts/onespec-closeout.sh');
  const stateScriptPath = path.resolve('assets/skills/onespec/scripts/onespec-state.sh');

  await initGitRepo(projectPath);
  await initChangeState(projectPath, 'discard-login', {
    origin_branch: 'main',
    origin_workspace_path: projectPath,
    origin_workspace_mode: 'worktree',
  });
  await advanceChangeToReview(projectPath, 'discard-login');

  await execFileAsync('git', ['worktree', 'add', '-b', 'feature/discard-login', worktreePath, 'HEAD'], {
    cwd: projectPath,
  });
  await mkdir(path.join(worktreePath, 'src'), { recursive: true });
  await writeFile(path.join(worktreePath, 'src', 'discarded.js'), 'export const discarded = true;\n');
  await execFileAsync('git', ['add', 'src/discarded.js'], { cwd: worktreePath });
  await execFileAsync('git', ['commit', '-m', 'discarded work'], { cwd: worktreePath });
  await mkdir(path.join(worktreePath, 'openspec', 'changes', 'discard-login'), { recursive: true });
  await execFileAsync('bash', [stateScriptPath, 'init', 'discard-login'], { cwd: worktreePath });
  await execFileAsync('bash', [stateScriptPath, 'set', 'discard-login', 'origin_branch', 'main'], {
    cwd: worktreePath,
  });
  await execFileAsync(
    'bash',
    [stateScriptPath, 'set', 'discard-login', 'origin_workspace_path', projectPath],
    { cwd: worktreePath },
  );
  await execFileAsync(
    'bash',
    [stateScriptPath, 'set', 'discard-login', 'origin_workspace_mode', 'worktree'],
    { cwd: worktreePath },
  );

  const { stdout } = await execFileAsync(
    'bash',
    [closeoutScriptPath, 'run-actions', 'discard-login', 'discard-worktree'],
    { cwd: worktreePath },
  );

  assert.match(stdout, /selected_actions: discard-worktree/);
  assert.match(stdout, /worktree_discarded: true/);
  assert.match(stdout, /discarded_branch: feature\/discard-login/);
  assert.match(stdout, /worktree_deleted: true/);
  assert.match(stdout, /archive_executed: false/);
  assert.match(stdout, /pre_closeout_commit_created: false/);
  await assert.rejects(access(worktreePath));
  await assert.rejects(access(path.join(projectPath, 'src', 'discarded.js')));

  const branches = await execFileAsync('git', ['branch', '--list', 'feature/discard-login'], { cwd: projectPath });
  assert.equal(branches.stdout.trim(), '');
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

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
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

test('onespec-closeout inspect recommends archive-then-merge when a temporary worktree targets main', async () => {
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
  assert.match(stdout, /recommended_actions: archive-then-merge-worktree/);
  assert.match(stdout, /recommended_reason: temporary-worktree-targets-base-branch/);
});

test('onespec-closeout inspect recommends archive-then-merge when temporary worktree targets a feature base branch', async () => {
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
  assert.match(stdout, /recommended_actions: archive-then-merge-worktree/);
  assert.match(stdout, /recommended_reason: temporary-worktree-targets-base-branch/);
});

test('onespec-closeout validate-actions allows archive-only on target branch and recommends archive-only there', async () => {
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
    [closeoutScriptPath, 'validate-actions', 'archive-login', 'archive-only'],
    { cwd: projectPath },
  );
  const recommended = await execFileAsync('bash', [closeoutScriptPath, 'recommend-actions', 'archive-login'], {
    cwd: projectPath,
  });

  assert.match(invalid.stdout, /selected_actions: archive-only/);
  assert.match(invalid.stdout, /valid: true/);
  assert.match(invalid.stdout, /允许直接归档当前 change；当前已经在 main，无需额外合并分支，也不自动删除当前工作区。/);
  assert.doesNotMatch(invalid.stdout, /base 分支/);
  assert.match(recommended.stdout, /temporary_worktree: false/);
  assert.match(recommended.stdout, /recommended_actions: archive-only/);
});

test('onespec-closeout inspect recommends archive-only on master without temporary worktree', async () => {
  const projectPath = await tmpProject();
  const closeoutScriptPath = path.resolve('assets/skills/onespec/scripts/onespec-closeout.sh');
  const stateScriptPath = path.resolve('assets/skills/onespec/scripts/onespec-state.sh');

  await initGitRepo(projectPath);
  await execFileAsync('git', ['branch', '-m', 'master'], { cwd: projectPath });
  await initChangeState(projectPath, 'archive-master', {
    origin_branch: 'master',
    origin_workspace_path: projectPath,
    origin_workspace_mode: 'current-branch',
  });
  await advanceChangeToReview(projectPath, 'archive-master');
  await execFileAsync('bash', [stateScriptPath, 'set', 'archive-master', 'origin_branch', 'master'], {
    cwd: projectPath,
  });

  const { stdout } = await execFileAsync('bash', [closeoutScriptPath, 'inspect', 'archive-master'], {
    cwd: projectPath,
  });

  assert.match(stdout, /current_branch: master/);
  assert.match(stdout, /temporary_worktree: false/);
  assert.match(stdout, /recommended_actions: archive-only/);
  assert.match(stdout, /recommended_reason: already-on-target-path/);
});

test('onespec-closeout validate-actions avoids base-branch wording on master target branch', async () => {
  const projectPath = await tmpProject();
  const closeoutScriptPath = path.resolve('assets/skills/onespec/scripts/onespec-closeout.sh');

  await initGitRepo(projectPath);
  await execFileAsync('git', ['branch', '-m', 'master'], { cwd: projectPath });
  await initChangeState(projectPath, 'archive-master', {
    origin_branch: 'master',
    origin_workspace_path: projectPath,
    origin_workspace_mode: 'current-branch',
  });

  const { stdout } = await execFileAsync(
    'bash',
    [closeoutScriptPath, 'validate-actions', 'archive-master', 'archive-only'],
    { cwd: projectPath },
  );

  assert.match(stdout, /selected_actions: archive-only/);
  assert.match(stdout, /valid: true/);
  assert.match(stdout, /允许直接归档当前 change；当前已经在 master，无需额外合并分支，也不自动删除当前工作区。/);
  assert.doesNotMatch(stdout, /base 分支/);
});

test('onespec-closeout validate-actions allows archive-only inside a temporary worktree', async () => {
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
    [closeoutScriptPath, 'validate-actions', 'ship-login', 'archive-only'],
    { cwd: worktreePath },
  );

  assert.match(stdout, /selected_actions: archive-only/);
  assert.match(stdout, /valid: true/);
  assert.match(stdout, /允许直接归档当前 change，不合并到 base 分支，也不自动删除当前 worktree。/);
});

test('onespec-closeout inspect from origin workspace follows the implementation worktree state', async () => {
  const projectPath = await tmpProject();
  const worktreePath = await tmpProject('onespec-closeout-wt-');
  const closeoutScriptPath = path.resolve('assets/skills/onespec/scripts/onespec-closeout.sh');
  const stateScriptPath = path.resolve('assets/skills/onespec/scripts/onespec-state.sh');

  await initGitRepo(projectPath);
  await initChangeState(projectPath, 'inspect-login', {
    origin_branch: 'main',
    origin_workspace_path: projectPath,
    origin_workspace_mode: 'current-branch',
    implementation_workspace_path: worktreePath,
  });
  await execFileAsync('git', ['add', 'openspec/changes/inspect-login/.onespec.yaml'], { cwd: projectPath });
  await execFileAsync('git', ['commit', '-m', 'seed inspect-login state'], { cwd: projectPath });

  await execFileAsync('git', ['worktree', 'add', '-b', 'feature/inspect-login', worktreePath, 'HEAD'], {
    cwd: projectPath,
  });
  await advanceChangeToReview(worktreePath, 'inspect-login');
  await execFileAsync('bash', [stateScriptPath, 'set', 'inspect-login', 'origin_branch', 'main'], {
    cwd: worktreePath,
  });
  await execFileAsync(
    'bash',
    [stateScriptPath, 'set', 'inspect-login', 'origin_workspace_path', projectPath],
    { cwd: worktreePath },
  );
  await execFileAsync(
    'bash',
    [stateScriptPath, 'set', 'inspect-login', 'origin_workspace_mode', 'current-branch'],
    { cwd: worktreePath },
  );
  await execFileAsync(
    'bash',
    [stateScriptPath, 'set', 'inspect-login', 'implementation_workspace_path', worktreePath],
    { cwd: worktreePath },
  );

  const { stdout } = await execFileAsync('bash', [closeoutScriptPath, 'inspect', 'inspect-login'], {
    cwd: projectPath,
  });
  const canonicalWorktreePath = await realpath(worktreePath);

  assert.match(stdout, /current_branch: feature\/inspect-login/);
  assert.match(stdout, new RegExp(`current_workspace_path: ${canonicalWorktreePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.match(stdout, /temporary_worktree: true/);
  assert.match(stdout, /recommended_actions: archive-then-merge-worktree/);
});

test('onespec-closeout validate-actions supports archive-then-merge or discard from a temporary worktree and rejects multiple actions', async () => {
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

  const archiveThenMerge = await execFileAsync(
    'bash',
    [closeoutScriptPath, 'validate-actions', 'trim-login', 'archive-then-merge-worktree'],
    { cwd: worktreePath },
  );
  const discardWorktree = await execFileAsync(
    'bash',
    [closeoutScriptPath, 'validate-actions', 'trim-login', 'discard-worktree'],
    { cwd: worktreePath },
  );
  const multipleActions = await execFileAsync(
    'bash',
    [closeoutScriptPath, 'validate-actions', 'trim-login', 'archive-then-merge-worktree', 'archive-only'],
    { cwd: worktreePath },
  );

  assert.match(archiveThenMerge.stdout, /selected_actions: archive-then-merge-worktree/);
  assert.match(archiveThenMerge.stdout, /valid: true/);
  assert.match(archiveThenMerge.stdout, /允许先归档当前 change，再把临时 worktree 合并到 main 并删除 worktree。/);

  assert.match(discardWorktree.stdout, /selected_actions: discard-worktree/);
  assert.match(discardWorktree.stdout, /valid: true/);
  assert.match(discardWorktree.stdout, /允许删除临时 worktree 并废弃对应本地分支代码；废弃后不归档。/);

  assert.match(multipleActions.stdout, /selected_actions: archive-then-merge-worktree,archive-only/);
  assert.match(multipleActions.stdout, /valid: false/);
  assert.match(multipleActions.stdout, /当前收尾菜单一次只允许选择一个动作。/);
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

test('onespec-closeout run-actions archives first, then merges a temporary worktree into a feature base branch and removes the worktree', async () => {
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
  await writeFile(path.join(worktreePath, 'openspec', 'changes', 'merge-login', 'proposal.md'), '# Proposal\n');
  const { scriptPath: archiveBin, logPath } = await writeFakeArchiveBin(projectPath);

  const { stdout } = await execFileAsync(
    'bash',
    [closeoutScriptPath, 'run-actions', 'merge-login', 'archive-then-merge-worktree'],
    {
      cwd: worktreePath,
      env: { ...process.env, ONESPEC_ARCHIVE_BIN: archiveBin },
    },
  );

  assert.match(stdout, /selected_actions: archive-then-merge-worktree/);
  assert.match(stdout, /worktree_merged: true/);
  assert.match(stdout, /merged_branch: feature\/merge-login/);
  assert.match(stdout, /worktree_deleted: true/);
  assert.match(stdout, /archive_executed: true/);
  assert.match(stdout, /pre_closeout_commit_created: true/);
  assert.match(stdout, /post_archive_commit_created: true/);
  await assert.rejects(access(worktreePath));
  await access(path.join(projectPath, 'src', 'feature.js'));
  await access(path.join(projectPath, 'openspec', 'changes', 'archive', 'merge-login', 'archive-note.txt'));
  assert.match(await readFile(logPath, 'utf8'), /archive merge-login --yes/);

  const { stdout: branch } = await execFileAsync('git', ['branch', '--show-current'], { cwd: projectPath });
  assert.equal(branch.trim(), 'release/risk');

  const branches = await execFileAsync('git', ['branch', '--list', 'feature/merge-login'], { cwd: projectPath });
  assert.equal(branches.stdout.trim(), '');
});

test('onespec-closeout run-actions can archive-only inside a temporary worktree without deleting it', async () => {
  const projectPath = await tmpProject();
  const worktreePath = await tmpProject('onespec-closeout-wt-');
  const closeoutScriptPath = path.resolve('assets/skills/onespec/scripts/onespec-closeout.sh');
  const stateScriptPath = path.resolve('assets/skills/onespec/scripts/onespec-state.sh');
  const commitScriptPath = path.resolve('assets/skills/onespec/scripts/onespec-commit.sh');
  const { scriptPath: archiveBin, logPath } = await writeFakeArchiveBin(projectPath);

  await initGitRepo(projectPath);
  await execFileAsync('git', ['add', path.basename(archiveBin)], { cwd: projectPath });
  await execFileAsync('git', ['commit', '-m', 'seed fake archive bin'], { cwd: projectPath });
  await initChangeState(projectPath, 'merge-archive-login', {
    origin_branch: 'main',
    origin_workspace_path: projectPath,
    origin_workspace_mode: 'worktree',
  });
  await advanceChangeToReview(projectPath, 'merge-archive-login');
  await execFileAsync('git', ['add', 'openspec/changes/merge-archive-login'], { cwd: projectPath });
  await execFileAsync('git', ['commit', '-m', 'seed merge-archive-login state'], { cwd: projectPath });

  await execFileAsync('git', ['worktree', 'add', '-b', 'feature/merge-archive-login', worktreePath, 'HEAD'], {
    cwd: projectPath,
  });
  await mkdir(path.join(worktreePath, 'openspec', 'changes', 'merge-archive-login'), { recursive: true });
  await execFileAsync('bash', [stateScriptPath, 'init', 'merge-archive-login'], { cwd: worktreePath });
  await execFileAsync('bash', [stateScriptPath, 'set', 'merge-archive-login', 'origin_branch', 'main'], {
    cwd: worktreePath,
  });
  await execFileAsync(
    'bash',
    [stateScriptPath, 'set', 'merge-archive-login', 'origin_workspace_path', projectPath],
    { cwd: worktreePath },
  );
  await execFileAsync(
    'bash',
    [stateScriptPath, 'set', 'merge-archive-login', 'origin_workspace_mode', 'worktree'],
    { cwd: worktreePath },
  );
  await mkdir(path.join(worktreePath, 'src'), { recursive: true });
  await writeFile(path.join(worktreePath, 'src', 'feature.js'), 'export const archived = true;\n');
  await execFileAsync('bash', [commitScriptPath, 'track', 'merge-archive-login', 'src/feature.js'], {
    cwd: worktreePath,
  });
  await writeFile(
    path.join(worktreePath, 'openspec', 'changes', 'merge-archive-login', 'proposal.md'),
    '# Proposal\n',
  );

  const { stdout } = await execFileAsync(
    'bash',
    [closeoutScriptPath, 'run-actions', 'merge-archive-login', 'archive-only'],
    {
      cwd: worktreePath,
      env: { ...process.env, ONESPEC_ARCHIVE_BIN: archiveBin },
    },
  );

  assert.match(stdout, /selected_actions: archive-only/);
  assert.match(stdout, /worktree_merged: false/);
  assert.match(stdout, /archive_executed: true/);
  assert.match(stdout, /worktree_deleted: false/);
  assert.match(stdout, /pre_closeout_commit_created: true/);
  assert.match(stdout, /post_archive_commit_created: true/);
  await access(worktreePath);
  await assert.rejects(access(path.join(worktreePath, 'openspec', 'changes', 'merge-archive-login', '.onespec.yaml')));
  await assert.rejects(access(path.join(worktreePath, 'openspec', 'changes', 'merge-archive-login')));
  await access(path.join(worktreePath, 'openspec', 'changes', 'archive', 'merge-archive-login', 'archive-note.txt'));
  assert.match(await readFile(logPath, 'utf8'), /archive merge-archive-login --yes/);

  const branches = await execFileAsync('git', ['branch', '--list', 'feature/merge-archive-login'], {
    cwd: projectPath,
  });
  assert.match(branches.stdout, /feature\/merge-archive-login/);
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

test('onespec-closeout run-actions executes archive-only once and removes runtime state on the target branch', async () => {
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
    [closeoutScriptPath, 'run-actions', 'archive-run', 'archive-only'],
    {
      cwd: projectPath,
      env: { ...process.env, ONESPEC_ARCHIVE_BIN: archiveBin },
    },
  );

  assert.match(stdout, /selected_actions: archive-only/);
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

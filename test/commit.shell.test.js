import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';

const execFileAsync = promisify(execFile);

async function tmpProject() {
  return mkdtemp(path.join(os.tmpdir(), 'onespec-commit-'));
}

async function git(projectPath, args, options = {}) {
  return execFileAsync('git', args, { cwd: projectPath, ...options });
}

async function initChangeState(projectPath, change) {
  const stateScriptPath = path.resolve('assets/skills/onespec/scripts/onespec-state.sh');
  await execFileAsync('bash', [stateScriptPath, 'init', change], { cwd: projectPath });
}

test('onespec-commit tracks touched files and stages only related dirty files', async () => {
  const projectPath = await tmpProject();
  const scriptPath = path.resolve('assets/skills/onespec/scripts/onespec-commit.sh');

  await mkdir(path.join(projectPath, 'src'), { recursive: true });
  await writeFile(path.join(projectPath, 'src', 'app.js'), 'console.log("v1");\n');
  await writeFile(path.join(projectPath, 'README.md'), '# Demo\n');

  await git(projectPath, ['init']);
  await git(projectPath, ['add', 'src/app.js', 'README.md']);
  await git(projectPath, ['-c', 'user.name=Test User', '-c', 'user.email=test@example.com', 'commit', '-m', 'init']);
  await initChangeState(projectPath, 'add-login');

  await execFileAsync('bash', [scriptPath, 'track', 'add-login', 'src/app.js'], { cwd: projectPath });
  await writeFile(path.join(projectPath, 'src', 'app.js'), 'console.log("v2");\n');
  await writeFile(path.join(projectPath, 'notes.txt'), 'unrelated\n');

  const { stdout: related } = await execFileAsync('bash', [scriptPath, 'related-dirty', 'add-login'], {
    cwd: projectPath,
  });

  assert.deepEqual(related.trim().split('\n').sort(), [
    'openspec/changes/add-login/.onespec.yaml',
    'src/app.js',
  ]);

  await execFileAsync('bash', [scriptPath, 'stage-related', 'add-login'], { cwd: projectPath });
  const { stdout: status } = await git(projectPath, ['status', '--porcelain=v1']);
  const lines = status.trim().split('\n');

  assert.ok(lines.includes('A  openspec/changes/add-login/.onespec.yaml'));
  assert.ok(lines.includes('M  src/app.js'));
  assert.ok(lines.includes('?? notes.txt'));

  const state = await readFile(
    path.join(projectPath, 'openspec', 'changes', 'add-login', '.onespec.yaml'),
    'utf8',
  );
  const encoded = state.match(/^touched_files_b64: (.+)$/m)?.[1];
  assert.ok(encoded);
  assert.equal(Buffer.from(encoded, 'base64').toString('utf8').trim(), 'src/app.js');
});

test('onespec-commit detects project commit policy before falling back to defaults', async () => {
  const projectPath = await tmpProject();
  const scriptPath = path.resolve('assets/skills/onespec/scripts/onespec-commit.sh');

  await mkdir(path.join(projectPath, 'docs', 'standards', 'shared'), { recursive: true });
  await mkdir(path.join(projectPath, 'packages', 'web', 'src'), { recursive: true });
  await writeFile(path.join(projectPath, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n');
  await writeFile(
    path.join(projectPath, 'docs', 'standards', 'shared', 'git-workflow.md'),
    [
      '# Git 工作流规范',
      '',
      '提交标题格式必须为：',
      '',
      '<type>(<scope>): <简要描述>',
      '',
      '描述使用简体中文。',
      '',
    ].join('\n'),
  );

  await initChangeState(projectPath, 'add-login');
  await execFileAsync('bash', [scriptPath, 'track', 'add-login', 'packages/web/src/index.ts'], {
    cwd: projectPath,
  });
  const { stdout } = await execFileAsync('bash', [scriptPath, 'detect-policy', 'add-login'], {
    cwd: projectPath,
  });

  assert.match(stdout, /policy_source: docs\/standards\/shared\/git-workflow.md/);
  assert.match(stdout, /policy_origin: project-doc/);
  assert.match(stdout, /policy_confidence: explicit/);
  assert.match(stdout, /commit_format: conventional/);
  assert.match(stdout, /message_language: zh/);
  assert.match(stdout, /repo_layout: multi/);
  assert.match(stdout, /scope_hint: web/);
});

test('onespec-commit includes dirty change artifacts under openspec change directories', async () => {
  const projectPath = await tmpProject();
  const scriptPath = path.resolve('assets/skills/onespec/scripts/onespec-commit.sh');

  await writeFile(path.join(projectPath, 'README.md'), '# Demo\n');

  await git(projectPath, ['init']);
  await git(projectPath, ['add', 'README.md']);
  await git(projectPath, ['-c', 'user.name=Test User', '-c', 'user.email=test@example.com', 'commit', '-m', 'init']);
  await initChangeState(projectPath, 'add-login');

  await writeFile(path.join(projectPath, 'openspec', 'changes', 'add-login', 'proposal.md'), '# Proposal\n');
  await writeFile(
    path.join(projectPath, 'openspec', 'changes', 'add-login', 'review-bundle.zip'),
    'fake zip bytes\n',
  );

  const { stdout: related } = await execFileAsync('bash', [scriptPath, 'related-dirty', 'add-login'], {
    cwd: projectPath,
  });

  assert.deepEqual(related.trim().split('\n').sort(), [
    'openspec/changes/add-login/.onespec.yaml',
    'openspec/changes/add-login/proposal.md',
    'openspec/changes/add-login/review-bundle.zip',
  ]);

  await execFileAsync('bash', [scriptPath, 'stage-related', 'add-login'], { cwd: projectPath });
  const { stdout: status } = await git(projectPath, ['status', '--porcelain=v1']);
  const lines = status.trim().split('\n');

  assert.ok(lines.includes('A  openspec/changes/add-login/.onespec.yaml'));
  assert.ok(lines.includes('A  openspec/changes/add-login/proposal.md'));
  assert.ok(lines.includes('A  openspec/changes/add-login/review-bundle.zip'));
});

test('onespec-commit auto-commits related dirty files with a detected conventional message', async () => {
  const projectPath = await tmpProject();
  const scriptPath = path.resolve('assets/skills/onespec/scripts/onespec-commit.sh');

  await mkdir(path.join(projectPath, 'docs', 'standards'), { recursive: true });
  await mkdir(path.join(projectPath, 'packages', 'web', 'src'), { recursive: true });
  await writeFile(path.join(projectPath, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n');
  await writeFile(
    path.join(projectPath, 'docs', 'standards', 'git-workflow.md'),
    [
      '# Git 工作流规范',
      '',
      '提交标题格式必须为：',
      '',
      '<type>(<scope>): <简要描述>',
      '',
      '描述使用简体中文。',
      '',
    ].join('\n'),
  );
  await writeFile(path.join(projectPath, 'packages', 'web', 'src', 'index.ts'), 'export const value = 1;\n');
  await writeFile(path.join(projectPath, 'README.md'), '# Demo\n');

  await git(projectPath, ['init']);
  await git(projectPath, ['config', 'user.name', 'Test User']);
  await git(projectPath, ['config', 'user.email', 'test@example.com']);
  await git(projectPath, ['add', '.']);
  await git(projectPath, ['commit', '-m', 'init']);
  await initChangeState(projectPath, 'add-login');

  await execFileAsync('bash', [scriptPath, 'track', 'add-login', 'packages/web/src/index.ts'], {
    cwd: projectPath,
  });
  await writeFile(path.join(projectPath, 'packages', 'web', 'src', 'index.ts'), 'export const value = 2;\n');
  await writeFile(path.join(projectPath, 'notes.txt'), 'unrelated\n');

  const { stdout } = await execFileAsync('bash', [scriptPath, 'commit-related', 'add-login', 'closeout'], {
    cwd: projectPath,
  });
  const { stdout: subject } = await git(projectPath, ['log', '-1', '--pretty=%s']);
  const { stdout: status } = await git(projectPath, ['status', '--porcelain=v1']);

  assert.match(stdout, /commit_created: true/);
  assert.match(stdout, /commit_context: closeout/);
  assert.match(stdout, /commit_message: chore\(web\): 提交 add-login 收尾前改动/);
  assert.equal(subject.trim(), 'chore(web): 提交 add-login 收尾前改动');
  assert.equal(status.trim(), '?? notes.txt');
});

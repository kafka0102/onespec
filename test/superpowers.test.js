import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { buildSuperpowersInstallHint, detectSuperpowers, REQUIRED_SUPERPOWERS } from '../src/superpowers.js';

async function tmpProject() {
  return mkdtemp(path.join(os.tmpdir(), 'onespec-superpowers-'));
}

async function addSkill(root, name) {
  const skillDir = path.join(root, name);
  await mkdir(skillDir, { recursive: true });
  await writeFile(path.join(skillDir, 'SKILL.md'), `---\nname: ${name}\ndescription: fixture\n---\n`);
}

test('detectSuperpowers reports every required skill missing when no roots are searched', async () => {
  const projectPath = await tmpProject();
  const result = await detectSuperpowers(projectPath, 'project', 'codex', { skillRoots: [] });

  assert.equal(result.available, false);
  assert.deepEqual(result.missing, REQUIRED_SUPERPOWERS);
});

test('detectSuperpowers passes when all required skills exist in the provided roots', async () => {
  const projectPath = await tmpProject();
  const root = await tmpProject();
  for (const skill of REQUIRED_SUPERPOWERS) {
    await addSkill(root, skill);
  }

  const result = await detectSuperpowers(projectPath, 'project', 'codex', { skillRoots: [root] });

  assert.equal(result.available, true);
  assert.deepEqual(result.missing, []);
});

test('detectSuperpowers reports only the skills that are absent', async () => {
  const projectPath = await tmpProject();
  const root = await tmpProject();
  await addSkill(root, REQUIRED_SUPERPOWERS[0]);

  const result = await detectSuperpowers(projectPath, 'project', 'codex', { skillRoots: [root] });

  assert.equal(result.available, false);
  assert.deepEqual(result.missing, REQUIRED_SUPERPOWERS.slice(1));
});

test('detectSuperpowers discovers skills across multiple roots', async () => {
  const projectPath = await tmpProject();
  const rootA = await tmpProject();
  const rootB = await tmpProject();
  const half = Math.ceil(REQUIRED_SUPERPOWERS.length / 2);
  for (const skill of REQUIRED_SUPERPOWERS.slice(0, half)) {
    await addSkill(rootA, skill);
  }
  for (const skill of REQUIRED_SUPERPOWERS.slice(half)) {
    await addSkill(rootB, skill);
  }

  const result = await detectSuperpowers(projectPath, 'project', 'codex', { skillRoots: [rootA, rootB] });

  assert.equal(result.available, true);
});

test('buildSuperpowersInstallHint targets the requested agent and reflects scope', () => {
  const projectHint = buildSuperpowersInstallHint('project', 'codex');
  assert.match(projectHint, /--agent codex/);
  assert.doesNotMatch(projectHint, / -g[ '"]/);

  const globalHint = buildSuperpowersInstallHint('global', 'claude-code');
  assert.match(globalHint, / -g /);
  assert.match(globalHint, /--agent claude-code/);
  assert.match(globalHint, /obra\/superpowers/);
});

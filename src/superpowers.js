import { access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { getDiscoveryRoots, getSkillDir } from './platforms.js';

export const REQUIRED_SUPERPOWERS = [
  'brainstorming',
  'writing-plans',
  'using-git-worktrees',
  'subagent-driven-development',
  'executing-plans',
  'test-driven-development',
];

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function defaultSuperpowersSkillRoots(projectPath, scope, platformId) {
  const home = os.homedir();
  return [
    getSkillDir(projectPath, scope, platformId),
    ...getDiscoveryRoots(projectPath, platformId),
    path.join(home, '.claude', 'skills'),
    path.join(home, '.codex', 'superpowers', 'skills'),
    path.join(home, '.cursor', 'skills'),
    path.join(home, '.gemini', 'skills'),
    path.join(home, '.copilot', 'skills'),
    path.join(home, '.agents', 'skills'),
  ];
}

async function skillInstalledInRoots(roots, name) {
  for (const root of roots) {
    if (await exists(path.join(root, name, 'SKILL.md'))) {
      return true;
    }
  }
  return false;
}

export async function detectSuperpowers(projectPath, scope, platformId, options = {}) {
  const resolvedProject = path.resolve(projectPath);
  const skillRoots =
    options.skillRoots ??
    [
      ...new Set([
        ...defaultSuperpowersSkillRoots(resolvedProject, scope, platformId),
        ...(options.extraSkillRoots ?? []),
      ]),
    ];

  const missing = [];
  for (const skill of REQUIRED_SUPERPOWERS) {
    if (!(await skillInstalledInRoots(skillRoots, skill))) {
      missing.push(skill);
    }
  }

  return {
    available: missing.length === 0,
    required: REQUIRED_SUPERPOWERS,
    missing,
    searchedRoots: skillRoots,
  };
}

export function buildSuperpowersInstallHint(scope, platformId) {
  const globalFlag = scope === 'global' ? ' -g' : '';
  return `请手动安装 Superpowers，例如：\`npx superpowers skills add obra/superpowers -y${globalFlag} --agent ${platformId}\`。`;
}

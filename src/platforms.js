import os from 'node:os';
import path from 'node:path';

export const PLATFORMS = {
  codex: {
    id: 'codex',
    name: 'Codex',
    skillsDir: '.codex',
    openspecToolId: 'codex',
  },
};

export function getInstallBase(projectPath, scope) {
  return scope === 'global' ? os.homedir() : projectPath;
}

export function getSkillDir(projectPath, scope, platformId = 'codex') {
  const platform = PLATFORMS[platformId];
  if (!platform) {
    throw new Error(`Unsupported platform: ${platformId}`);
  }
  return path.join(getInstallBase(projectPath, scope), platform.skillsDir, 'skills');
}

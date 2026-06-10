import os from 'node:os';
import path from 'node:path';

const home = os.homedir();
const codexHome = process.env.CODEX_HOME?.trim() || path.join(home, '.codex');
const claudeHome = process.env.CLAUDE_CONFIG_DIR?.trim() || path.join(home, '.claude');

export const PLATFORMS = {
  codex: {
    id: 'codex',
    name: 'Codex',
    projectSkillsDir: path.join('.agents', 'skills'),
    globalSkillsDir: path.join(codexHome, 'skills'),
    legacyProjectSkillDirs: [path.join('.codex', 'skills')],
    discoveryRoots: [path.join(home, '.agents', 'skills'), '/etc/codex/skills'],
    openspecToolId: 'codex',
  },
  'claude-code': {
    id: 'claude-code',
    name: 'Claude Code',
    projectSkillsDir: path.join('.claude', 'skills'),
    globalSkillsDir: path.join(claudeHome, 'skills'),
    discoveryRoots: [],
    openspecToolId: 'claude-code',
  },
  cursor: {
    id: 'cursor',
    name: 'Cursor',
    projectSkillsDir: path.join('.agents', 'skills'),
    globalSkillsDir: path.join(home, '.cursor', 'skills'),
    discoveryRoots: [path.join(home, '.agents', 'skills')],
    openspecToolId: 'cursor',
  },
  'gemini-cli': {
    id: 'gemini-cli',
    name: 'Gemini CLI',
    projectSkillsDir: path.join('.agents', 'skills'),
    globalSkillsDir: path.join(home, '.gemini', 'skills'),
    discoveryRoots: [path.join(home, '.agents', 'skills')],
    openspecToolId: 'gemini-cli',
  },
  'github-copilot': {
    id: 'github-copilot',
    name: 'GitHub Copilot',
    projectSkillsDir: path.join('.agents', 'skills'),
    globalSkillsDir: path.join(home, '.copilot', 'skills'),
    discoveryRoots: [path.join(home, '.agents', 'skills')],
    openspecToolId: 'github-copilot',
  },
};

const PLATFORM_ALIASES = {
  codex: 'codex',
  claude: 'claude-code',
  'claude-code': 'claude-code',
  claude_code: 'claude-code',
  cursor: 'cursor',
  gemini: 'gemini-cli',
  'gemini-cli': 'gemini-cli',
  gemini_cli: 'gemini-cli',
  copilot: 'github-copilot',
  'github-copilot': 'github-copilot',
  github_copilot: 'github-copilot',
  'github-copilot-cli': 'github-copilot',
};

export function resolvePlatformId(platformId = 'codex') {
  const resolved = PLATFORM_ALIASES[platformId];
  if (!resolved) {
    throw new Error(`Unsupported platform: ${platformId}`);
  }
  return resolved;
}

export function getPlatform(platformId = 'codex') {
  return PLATFORMS[resolvePlatformId(platformId)];
}

export function getProjectSkillDir(projectPath, platformId = 'codex') {
  const platform = getPlatform(platformId);
  return path.join(projectPath, platform.projectSkillsDir);
}

export function getGlobalSkillDir(platformId = 'codex') {
  const platform = getPlatform(platformId);
  return platform.globalSkillsDir;
}

export function getSkillDir(projectPath, scope, platformId = 'codex') {
  return scope === 'global'
    ? getGlobalSkillDir(platformId)
    : getProjectSkillDir(projectPath, platformId);
}

export function getDiscoveryRoots(projectPath, platformId = 'codex') {
  const platform = getPlatform(platformId);
  return [
    getProjectSkillDir(projectPath, platformId),
    ...(platform.legacyProjectSkillDirs ?? []).map((relativeDir) => path.join(projectPath, relativeDir)),
    getGlobalSkillDir(platformId),
    ...(platform.discoveryRoots ?? []),
  ];
}

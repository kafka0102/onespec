import { execFileSync } from 'node:child_process';
import { access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { initProject, SUPPORTED_LANGUAGES } from './init.js';
import { getGlobalSkillDir, getPlatform, getProjectSkillDir, PLATFORMS } from './platforms.js';

const OPEN_SPEC_CLI_PACKAGE = '@fission-ai/openspec@latest';

export const SUPPORTED_PLATFORM_IDS = Object.keys(PLATFORMS);

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function commandExists(command) {
  try {
    const checker = process.platform === 'win32' ? 'where' : 'which';
    execFileSync(checker, [command], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function getNpmExecutable(platform = process.platform) {
  return platform === 'win32' ? 'npm.cmd' : 'npm';
}

export function parsePlatformList(values) {
  const rawValues = Array.isArray(values) ? values : values ? [values] : [];
  const selected = [];

  for (const rawValue of rawValues) {
    for (const part of String(rawValue).split(',')) {
      const token = part.trim();
      if (!token) {
        continue;
      }
      selected.push(getPlatform(token).id);
    }
  }

  return [...new Set(selected)];
}

export async function detectPlatforms(projectPath) {
  const resolvedProject = path.resolve(projectPath);
  const detected = [];

  for (const platformId of SUPPORTED_PLATFORM_IDS) {
    const projectSkillDir = getProjectSkillDir(resolvedProject, platformId);
    const globalSkillDir = getGlobalSkillDir(platformId);
    if ((await exists(projectSkillDir)) || (await exists(globalSkillDir))) {
      detected.push(platformId);
    }
  }

  return detected;
}

export async function detectExistingOneSpecPlatforms(projectPath, scope, platformIds) {
  const resolvedProject = path.resolve(projectPath);
  const existing = [];

  for (const platformId of platformIds) {
    const skillDir =
      scope === 'global'
        ? getGlobalSkillDir(platformId)
        : getProjectSkillDir(resolvedProject, platformId);
    if (await exists(path.join(skillDir, 'onespec', 'SKILL.md'))) {
      existing.push(platformId);
    }
  }

  return existing;
}

export function buildOpenSpecCliInstallCommand() {
  return {
    command: getNpmExecutable(),
    args: ['install', '-g', OPEN_SPEC_CLI_PACKAGE],
  };
}

export function buildOpenSpecInitCommand(targetPath, platformIds, scope, homeDir = os.homedir()) {
  const resolvedPlatforms = parsePlatformList(platformIds);
  if (resolvedPlatforms.length === 0) {
    throw new Error('At least one platform must be selected.');
  }

  const openSpecToolIds = resolvedPlatforms.map((platformId) => getPlatform(platformId).openspecToolId);
  return {
    command: 'openspec',
    args: ['init', scope === 'global' ? homeDir : targetPath, '--tools', openSpecToolIds.join(',')],
    toolIds: openSpecToolIds,
    targetPath: scope === 'global' ? homeDir : targetPath,
  };
}

function runCommand(command, args, cwd = process.cwd()) {
  execFileSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}

export async function initWorkspace(targetPath, options = {}, dependencies = {}) {
  const projectPath = path.resolve(targetPath);
  const scope = options.scope ?? 'project';
  const language = options.language ?? 'zh';
  const platformIds = parsePlatformList(options.platforms ?? []);
  const selectedPlatformIds = platformIds.length > 0 ? platformIds : ['codex'];

  if (!['project', 'global'].includes(scope)) {
    throw new Error(`Unsupported scope "${scope}". Use "project" or "global".`);
  }
  if (!SUPPORTED_LANGUAGES[language]) {
    throw new Error(
      `Unsupported language "${language}". Use one of: ${Object.keys(SUPPORTED_LANGUAGES).join(', ')}.`,
    );
  }

  const commandChecker = dependencies.commandExists ?? commandExists;
  const commandRunner = dependencies.runCommand ?? runCommand;
  const projectInitializer = dependencies.initProject ?? initProject;
  const homeDir = dependencies.homeDir ?? os.homedir();

  let openspecCliStatus = 'present';
  if (!commandChecker('openspec')) {
    const cliInstall = buildOpenSpecCliInstallCommand();
    commandRunner(cliInstall.command, cliInstall.args, projectPath);
    openspecCliStatus = 'installed';
    if (!commandChecker('openspec')) {
      throw new Error(`OpenSpec CLI installation completed but \`openspec\` is still unavailable.`);
    }
  }

  const openSpecSetup = buildOpenSpecInitCommand(projectPath, selectedPlatformIds, scope, homeDir);
  commandRunner(openSpecSetup.command, openSpecSetup.args, projectPath);

  const results = [];
  for (const platformId of selectedPlatformIds) {
    results.push(
      await projectInitializer(projectPath, {
        ...options,
        platform: platformId,
        scope,
        language,
      }),
    );
  }

  return {
    projectPath,
    scope,
    language,
    languageName: SUPPORTED_LANGUAGES[language].name,
    platforms: selectedPlatformIds,
    platformNames: selectedPlatformIds.map((platformId) => getPlatform(platformId).name),
    openspecCli: {
      status: openspecCliStatus,
      package: OPEN_SPEC_CLI_PACKAGE,
    },
    openspec: {
      targetPath: openSpecSetup.targetPath,
      toolIds: openSpecSetup.toolIds,
    },
    results,
  };
}

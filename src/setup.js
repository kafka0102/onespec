import { access } from 'node:fs/promises';
import path from 'node:path';

import { initProject, SUPPORTED_LANGUAGES } from './init.js';
import { getGlobalSkillDir, getPlatform, getProjectSkillDir, PLATFORMS } from './platforms.js';

export const SUPPORTED_PLATFORM_IDS = Object.keys(PLATFORMS);

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
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

  const projectInitializer = dependencies.initProject ?? initProject;

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
    results,
  };
}

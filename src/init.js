import { access, chmod, cp, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getSkillDir, PLATFORMS } from './platforms.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const BUNDLED_ONESPEC_SKILLS = [
  'onespec',
  'onespec-design',
  'onespec-execute',
  'onespec-archive',
];

function assetsSkillsDir() {
  return path.resolve(__dirname, '..', 'assets', 'skills');
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function chmodExecutable(filePath) {
  const current = await stat(filePath);
  await chmod(filePath, current.mode | 0o111);
}

async function makeBundledScriptsExecutable(skillPath) {
  const scriptsDir = path.join(skillPath, 'scripts');
  if (!(await exists(scriptsDir))) {
    return;
  }
  await chmodExecutable(path.join(scriptsDir, 'onespec-env.sh'));
  await chmodExecutable(path.join(scriptsDir, 'onespec-state.sh'));
  await chmodExecutable(path.join(scriptsDir, 'onespec-handoff.sh'));
}

async function createWorkingDirs(projectPath) {
  await mkdir(path.join(projectPath, 'docs', 'superpowers', 'specs'), { recursive: true });
  await mkdir(path.join(projectPath, 'docs', 'superpowers', 'plans'), { recursive: true });
}

export async function initProject(projectPath, options = {}) {
  const resolvedProject = path.resolve(projectPath);
  const platform = options.platform ?? 'codex';
  const scope = options.scope ?? 'project';
  const overwrite = Boolean(options.overwrite);

  if (!PLATFORMS[platform]) {
    throw new Error(`Unsupported platform "${platform}". Currently only "codex" is supported.`);
  }
  if (!['project', 'global'].includes(scope)) {
    throw new Error(`Unsupported scope "${scope}". Use "project" or "global".`);
  }

  const sourceRoot = assetsSkillsDir();
  const skillsDir = getSkillDir(resolvedProject, scope, platform);
  const destination = path.join(skillsDir, 'onespec');
  const installedSkills = [];
  const skippedSkills = [];

  await mkdir(skillsDir, { recursive: true });

  for (const skillName of BUNDLED_ONESPEC_SKILLS) {
    const source = path.join(sourceRoot, skillName);
    const target = path.join(skillsDir, skillName);
    const hadExisting = await exists(target);

    if (hadExisting && !overwrite) {
      skippedSkills.push(skillName);
      continue;
    }

    if (hadExisting) {
      await rm(target, { recursive: true, force: true });
    }
    await cp(source, target, { recursive: true });
    await makeBundledScriptsExecutable(target);
    installedSkills.push(skillName);
  }

  if (scope === 'project') {
    await createWorkingDirs(resolvedProject);
  }

  return {
    projectPath: resolvedProject,
    platform,
    platformName: PLATFORMS[platform].name,
    scope,
    skillPath: destination,
    installedSkill: installedSkills.length > 0,
    skippedExisting: installedSkills.length === 0 && skippedSkills.length > 0,
    installedSkills,
    skippedSkills,
  };
}

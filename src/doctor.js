import { execFileSync } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { BUNDLED_ONESPEC_SKILLS } from './init.js';
import { getSkillDir, PLATFORMS } from './platforms.js';

const REQUIRED_SUPERPOWERS = [
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

function defaultCommandChecker(command) {
  try {
    const checker = process.platform === 'win32' ? 'where' : 'which';
    execFileSync(checker, [command], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function defaultSkillRoots(projectPath, scope, platform) {
  return [
    getSkillDir(projectPath, scope, platform),
    path.join(os.homedir(), '.codex', 'skills'),
    path.join(os.homedir(), '.codex', 'superpowers', 'skills'),
    path.join(os.homedir(), '.agents', 'skills'),
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

async function isChineseOneSpec(projectPath, scope, platform) {
  const skillsDir = getSkillDir(projectPath, scope, platform);
  const installedSkills = [];
  const missingSkills = [];
  const skillPaths = {};

  for (const skillName of BUNDLED_ONESPEC_SKILLS) {
    const skillPath = path.join(skillsDir, skillName, 'SKILL.md');
    skillPaths[skillName] = skillPath;
    if (await exists(skillPath)) {
      installedSkills.push(skillName);
    } else {
      missingSkills.push(skillName);
    }
  }

  const routerPath = skillPaths.onespec;
  if (!(await exists(routerPath))) {
    return {
      installed: false,
      skillPath: routerPath,
      skillPaths,
      installedSkills,
      missingSkills,
      chinese: false,
    };
  }

  const content = await readFile(routerPath, 'utf8');
  const chinese = content.includes('OneSpec 工作流');
  return {
    installed: missingSkills.length === 0 && chinese,
    skillPath: routerPath,
    skillPaths,
    installedSkills,
    missingSkills,
    chinese,
  };
}

export async function doctorProject(projectPath, options = {}) {
  const resolvedProject = path.resolve(projectPath);
  const platform = options.platform ?? 'codex';
  const scope = options.scope ?? 'project';
  const commandChecker = options.commandChecker ?? defaultCommandChecker;

  if (!PLATFORMS[platform]) {
    throw new Error(`Unsupported platform "${platform}". Currently only "codex" is supported.`);
  }

  const onespec = await isChineseOneSpec(resolvedProject, scope, platform);
  const skillRoots =
    options.skillRoots ??
    [
      ...new Set([
        ...defaultSkillRoots(resolvedProject, scope, platform),
        ...(options.extraSkillRoots ?? []),
      ]),
    ];
  const missing = [];
  for (const skill of REQUIRED_SUPERPOWERS) {
    if (!(await skillInstalledInRoots(skillRoots, skill))) {
      missing.push(skill);
    }
  }

  const openspecCli = {
    available: commandChecker('openspec'),
  };
  const superpowers = {
    available: missing.length === 0,
    required: REQUIRED_SUPERPOWERS,
    missing,
    searchedRoots: skillRoots,
  };

  const nextSteps = [];
  if (onespec.missingSkills.length > 0) {
    nextSteps.push(
      `缺少 OneSpec Skills：${onespec.missingSkills.join(', ')}。运行 \`onespec init --overwrite\` 补齐中文 OneSpec Skill bundle。`,
    );
  } else if (!onespec.installed) {
    nextSteps.push('运行 `onespec init --yes` 安装中文 OneSpec Skill。');
  } else if (!onespec.chinese) {
    nextSteps.push('当前 OneSpec Skill 不是中文版本，运行 `onespec init --overwrite` 覆盖安装。');
  }
  if (!openspecCli.available) {
    nextSteps.push('未找到 OpenSpec CLI，请安装 OpenSpec CLI 并在目标项目运行 `openspec init`。');
  }
  if (!superpowers.available) {
    nextSteps.push(`缺少 Superpowers Skills：${missing.join(', ')}。请先安装 Superpowers。`);
  }
  if (nextSteps.length === 0) {
    nextSteps.push('环境检查通过。可以在 Codex 中使用 `onespec` 工作流。');
  }

  return {
    projectPath: resolvedProject,
    platform,
    platformName: PLATFORMS[platform].name,
    scope,
    onespec,
    openspecCli,
    superpowers,
    nextSteps,
  };
}

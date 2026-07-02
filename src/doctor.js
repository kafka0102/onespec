import { execFileSync } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { BUNDLED_ONESPEC_REFERENCE_FILES, BUNDLED_ONESPEC_SKILLS } from './init.js';
import { getDiscoveryRoots, getPlatform, getSkillDir } from './platforms.js';

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

async function hasOpenSpecProject(projectPath) {
  return exists(path.join(projectPath, 'openspec'));
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
    ...getDiscoveryRoots(projectPath, platform),
    path.join(os.homedir(), '.claude', 'skills'),
    path.join(os.homedir(), '.codex', 'superpowers', 'skills'),
    path.join(os.homedir(), '.cursor', 'skills'),
    path.join(os.homedir(), '.gemini', 'skills'),
    path.join(os.homedir(), '.copilot', 'skills'),
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
  const missingFiles = [];
  const skillPaths = {};
  const referencePaths = {};

  for (const skillName of BUNDLED_ONESPEC_SKILLS) {
    const skillPath = path.join(skillsDir, skillName, 'SKILL.md');
    skillPaths[skillName] = skillPath;
    if (await exists(skillPath)) {
      installedSkills.push(skillName);
    } else {
      missingSkills.push(skillName);
    }
  }

  for (const referenceFile of BUNDLED_ONESPEC_REFERENCE_FILES) {
    const referencePath = path.join(skillsDir, 'onespec', referenceFile);
    referencePaths[referenceFile] = referencePath;
    if (!(await exists(referencePath))) {
      missingFiles.push(path.join('onespec', referenceFile));
    }
  }

  const routerPath = skillPaths.onespec;
  if (!(await exists(routerPath))) {
    return {
      installed: false,
      skillPath: routerPath,
      skillPaths,
      referencePaths,
      installedSkills,
      missingSkills,
      missingFiles,
      chinese: false,
    };
  }

  const content = await readFile(routerPath, 'utf8');
  const chinese = content.includes('OneSpec 工作流');
  const english = content.includes('# OneSpec Workflow');
  return {
    installed: missingSkills.length === 0 && missingFiles.length === 0 && (chinese || english),
    skillPath: routerPath,
    skillPaths,
    referencePaths,
    installedSkills,
    missingSkills,
    missingFiles,
    chinese,
    english,
    language: chinese ? 'zh' : english ? 'en' : 'unknown',
  };
}

export async function doctorProject(projectPath, options = {}) {
  const resolvedProject = path.resolve(projectPath);
  const platform = getPlatform(options.platform ?? 'codex');
  const scope = options.scope ?? 'project';
  const commandChecker = options.commandChecker ?? defaultCommandChecker;

  const onespec = await isChineseOneSpec(resolvedProject, scope, platform.id);
  const skillRoots =
    options.skillRoots ??
    [
      ...new Set([
        ...defaultSkillRoots(resolvedProject, scope, platform.id),
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
  const openSpecProjectInstalled = await hasOpenSpecProject(resolvedProject);
  const superpowers = {
    available: missing.length === 0,
    required: REQUIRED_SUPERPOWERS,
    missing,
    searchedRoots: skillRoots,
  };

  const nextSteps = [];
  if (onespec.missingSkills.length > 0) {
    nextSteps.push(
      `缺少 OneSpec Skills：${onespec.missingSkills.join(', ')}。运行 \`onespec init --platform ${platform.id} --overwrite\` 补齐 OneSpec Skill bundle。`,
    );
  } else if (onespec.missingFiles.length > 0) {
    nextSteps.push(
      `缺少 OneSpec references：${onespec.missingFiles.join(', ')}。运行 \`onespec init --platform ${platform.id} --overwrite\` 补齐 OneSpec Skill bundle。`,
    );
  } else if (!onespec.installed) {
    nextSteps.push(`运行 \`onespec init --platform ${platform.id} --yes\` 安装 OneSpec Skill。`);
  } else if (!onespec.chinese && !onespec.english) {
    nextSteps.push(
      `当前 OneSpec Skill 无法识别语言版本，运行 \`onespec init --platform ${platform.id} --overwrite\` 覆盖安装。`,
    );
  }
  if (!openspecCli.available) {
    nextSteps.push(
      `未找到 OpenSpec CLI。运行 \`onespec init --platform ${platform.id} --scope ${scope}\` 让 OneSpec 自动安装并初始化 OpenSpec。`,
    );
  } else if (scope === 'project' && !openSpecProjectInstalled) {
    nextSteps.push(
      `当前项目尚未初始化 OpenSpec。请重新运行 \`onespec init --platform ${platform.id} --scope project\` 让 OneSpec 自动补齐。`,
    );
  }
  if (!superpowers.available) {
    nextSteps.push(
      `缺少 Superpowers Skills：${missing.join(', ')}。请手动安装 Superpowers，例如：\`npx superpowers skills add obra/superpowers -y${scope === 'global' ? ' -g' : ''} --agent ${platform.id}\`。`,
    );
  }
  if (nextSteps.length === 0) {
    nextSteps.push(`环境检查通过。可以在 ${platform.name} 中使用 \`onespec\` 工作流。`);
  }

  return {
    projectPath: resolvedProject,
    platform: platform.id,
    platformName: platform.name,
    scope,
    onespec,
    openspecCli,
    hasOpenSpecProject: openSpecProjectInstalled,
    superpowers,
    nextSteps,
  };
}

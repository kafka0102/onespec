import { execFileSync } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

import { BUNDLED_ONESPEC_REFERENCE_FILES, BUNDLED_ONESPEC_SKILLS } from './init.js';
import { getPlatform, getSkillDir } from './platforms.js';
import { buildSuperpowersInstallHint, detectSuperpowers } from './superpowers.js';

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
  const superpowers = await detectSuperpowers(resolvedProject, scope, platform.id, {
    skillRoots: options.skillRoots,
    extraSkillRoots: options.extraSkillRoots,
  });

  const openspecCli = {
    available: commandChecker('openspec'),
  };
  const openSpecProjectInstalled = await hasOpenSpecProject(resolvedProject);

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
      `未找到 OpenSpec CLI。请手动安装 OpenSpec，例如运行 \`npm install -g @fission-ai/openspec\`。`,
    );
  } else if (scope === 'project' && !openSpecProjectInstalled) {
    nextSteps.push(
      `当前项目尚未初始化 OpenSpec。请手动运行 \`openspec init <项目路径> --tools ${platform.openspecToolId}\` 完成初始化。`,
    );
  }
  if (!superpowers.available) {
    nextSteps.push(
      `缺少 Superpowers Skills：${superpowers.missing.join(', ')}。${buildSuperpowersInstallHint(scope, platform.id)}`,
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

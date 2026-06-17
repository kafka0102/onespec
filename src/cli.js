import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { checkbox, select, confirm } from '@inquirer/prompts';

import { doctorProject } from './doctor.js';
import { SUPPORTED_LANGUAGES } from './init.js';
import { getPlatform, PLATFORMS } from './platforms.js';
import {
  detectExistingOneSpecPlatforms,
  detectPlatforms,
  initWorkspace,
  parsePlatformList,
  SUPPORTED_PLATFORM_IDS,
} from './setup.js';

function parseArgs(argv) {
  const args = [...argv];
  const command = args.shift() ?? 'help';
  const options = {
    targetPath: process.cwd(),
    platforms: [],
    scope: undefined,
    language: undefined,
    yes: false,
    overwrite: false,
    json: false,
  };

  while (args.length > 0) {
    const arg = args.shift();
    switch (arg) {
      case '--yes':
      case '-y':
        options.yes = true;
        break;
      case '--overwrite':
        options.overwrite = true;
        break;
      case '--json':
        options.json = true;
        break;
      case '--scope':
        options.scope = args.shift();
        break;
      case '--language':
      case '--lang':
        options.language = args.shift();
        break;
      case '--platform':
        options.platforms.push(args.shift() ?? '');
        break;
      default:
        if (arg?.startsWith('-')) {
          throw new Error(`Unknown option: ${arg}`);
        }
        options.targetPath = arg ?? options.targetPath;
        break;
    }
  }

  return { command, options };
}

async function selectScope(options) {
  if (options.scope) return options.scope;
  if (options.yes) return 'project';

  return select({
    message: 'Install scope:',
    choices: [
      { name: 'Project (current directory)', value: 'project' },
      { name: 'Global (home directory)', value: 'global' },
    ],
  });
}

async function selectLanguage(options) {
  if (options.yes) return 'zh';

  const langId = await select({
    message: 'Language for OneSpec skills:',
    choices: Object.entries(SUPPORTED_LANGUAGES).map(([id, lang]) => ({ name: lang.name, value: id })),
  });

  return langId;
}

async function selectPlatforms(detected, options) {
  const choices = SUPPORTED_PLATFORM_IDS.map((platformId) => {
    const platform = getPlatform(platformId);
    return {
      name: `${platform.name}${detected.has(platformId) ? ' (detected)' : ''}`,
      value: platformId,
      checked: detected.has(platformId),
    };
  });

  if (options.yes) {
    const selected = [...detected];
    return selected.length > 0 ? selected : ['codex'];
  }

  return checkbox({ message: 'Select platforms to set up:', choices, required: true });
}

async function askOverwrite(existingPlatforms, options) {
  if (options.overwrite || existingPlatforms.length === 0) {
    return options.overwrite;
  }

  return confirm({
    message: `OneSpec skills already exist for ${existingPlatforms.join(', ')}. Overwrite existing items?`,
    default: false,
  });
}

async function askInitOptions(options) {
  const explicitPlatforms = parsePlatformList(options.platforms);
  const detectedPlatforms = await detectPlatforms(options.targetPath);
  const defaultPlatforms = explicitPlatforms.length > 0 ? explicitPlatforms : detectedPlatforms.length > 0 ? detectedPlatforms : ['codex'];

  if (options.yes) {
    return {
      ...options,
      scope: options.scope ?? 'project',
      language: options.language ?? 'zh',
      platforms: defaultPlatforms,
    };
  }

  const detectedSet = new Set(detectedPlatforms);
  const selectedPlatforms = explicitPlatforms.length > 0 ? explicitPlatforms : await selectPlatforms(detectedSet, options);
  const resolvedScope = await selectScope(options);
  const language = await selectLanguage(options);
  const existingPlatforms = await detectExistingOneSpecPlatforms(
    options.targetPath,
    resolvedScope,
    selectedPlatforms,
  );
  const overwrite = await askOverwrite(existingPlatforms, options);

  return {
    ...options,
    platforms: selectedPlatforms,
    scope: resolvedScope,
    language,
    overwrite,
  };
}

function printHelp() {
  console.log(`OneSpec Skill Installer

用法：
  onespec init [path] [--yes] [--overwrite] [--scope project|global] [--language zh|en] [--platform ${SUPPORTED_PLATFORM_IDS.join('|')}[,...]]
  onespec doctor [path] [--scope project|global] [--platform ${SUPPORTED_PLATFORM_IDS.join('|')}]

说明：
  当前提供中英文 Skill bundle，官方支持 ${SUPPORTED_PLATFORM_IDS.join(' / ')}。
  init 会引导选择 agent，并自动安装 OpenSpec / Superpowers / OneSpec。
`);
}

let cachedVersion;

async function getPackageVersion() {
  if (cachedVersion) {
    return cachedVersion;
  }

  const packageJsonPath = new URL('../package.json', import.meta.url);
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
  cachedVersion = packageJson.version;
  return cachedVersion;
}

function printSummary(result) {
  console.log('\nOneSpec 初始化完成\n');
  console.log(`目标平台：${result.platformNames.join(', ')}`);
  console.log(`安装范围：${result.scope}`);
  console.log(`Skill 语言：${result.languageName} (${result.language})`);
  console.log(`OpenSpec CLI：${result.openspecCli.status === 'installed' ? '已自动安装' : '已存在'}`);
  console.log(`OpenSpec Tools：${result.openspec.toolIds.join(', ')}`);
  console.log(`Superpowers Agents：${result.superpowers.agents.join(', ')}`);
  for (const platformResult of result.results) {
    const platformLabel = `${platformResult.platformName} (${platformResult.platform})`;
    const skillStatus = platformResult.installedSkill ? '已安装/已覆盖' : '已存在，已跳过';
    console.log(`- ${platformLabel}：${skillStatus} -> ${platformResult.skillPath}`);
  }
  if (result.scope === 'project') {
    console.log(`工作目录：${path.join(result.projectPath, 'docs', 'superpowers')}`);
  }
  console.log('\n开始使用：重启对应 agent 会话后，直接输入 “使用 onespec：<你的任务描述>”。\n');
}

function printDoctor(report) {
  console.log('\nOneSpec 环境检查\n');
  console.log(`目标平台：${report.platformName} (${report.platform})`);
  console.log(`OneSpec Skill：${report.onespec.installed ? '已安装' : '未安装'}`);
  console.log(`OneSpec 子 Skills：${report.onespec.installedSkills.join(', ') || '无'}`);
  console.log(`缺少 OneSpec 子 Skills：${report.onespec.missingSkills.join(', ') || '无'}`);
  console.log(`Skill 语言：${report.onespec.language}`);
  console.log(`OpenSpec CLI：${report.openspecCli.available ? '已找到' : '未找到'}`);
  console.log(`OpenSpec 项目：${report.hasOpenSpecProject ? '已初始化' : '未初始化'}`);
  console.log(
    `Superpowers：${report.superpowers.available ? '关键 Skills 已找到' : `缺少 ${report.superpowers.missing.join(', ')}`}`,
  );
  console.log('\n下一步：');
  for (const step of report.nextSteps) {
    console.log(`- ${step}`);
  }
  console.log('');
}

export async function main(argv = process.argv.slice(2)) {
  const { command, options } = parseArgs(argv);

  if (command === 'version' || command === '--version' || command === '-v') {
    console.log(await getPackageVersion());
    return;
  }
  if (command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }
  if (command !== 'init' && command !== 'doctor') {
    throw new Error(`Unknown command: ${command}`);
  }

  if (command === 'doctor') {
    const doctorPlatforms = parsePlatformList(options.platforms);
    const report = await doctorProject(options.targetPath, {
      platform: doctorPlatforms[0],
      scope: options.scope ?? 'project',
    });
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printDoctor(report);
    }
    return;
  }

  const initOptions = await askInitOptions(options);
  if (!SUPPORTED_LANGUAGES[initOptions.language]) {
    throw new Error(`Unsupported language: ${initOptions.language}`);
  }
  const result = await initWorkspace(initOptions.targetPath, initOptions);
  if (initOptions.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printSummary(result);
  }
}

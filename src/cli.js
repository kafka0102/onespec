import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { readFile } from 'node:fs/promises';

import { doctorProject } from './doctor.js';
import { SUPPORTED_LANGUAGES } from './init.js';
import { getPlatform } from './platforms.js';
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

function normalizeYesNo(value) {
  return ['y', 'yes', '是', '覆盖'].includes(value.trim().toLowerCase());
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

  const rl = readline.createInterface({ input, output });
  try {
    if (explicitPlatforms.length === 0) {
      console.log('可选 AI 平台：');
      for (const [index, platformId] of SUPPORTED_PLATFORM_IDS.entries()) {
        const platform = getPlatform(platformId);
        const detectedSuffix = detectedPlatforms.includes(platformId) ? ' [detected]' : '';
        console.log(`  ${index + 1}. ${platform.name} (${platform.id})${detectedSuffix}`);
      }
      console.log('');
    }

    const platformAnswer =
      explicitPlatforms.length > 0
        ? explicitPlatforms.join(',')
        : await rl.question(
            `安装到哪些 AI 平台？输入编号或 id，逗号分隔（默认 ${defaultPlatforms.join(',')}）：`,
          );
    const selectedPlatforms = resolvePlatformSelection(platformAnswer, defaultPlatforms);
    const scopeAnswer =
      options.scope ??
      (await rl.question('安装范围？输入 project 或 global（默认 project）：'));
    const resolvedScope = scopeAnswer.trim() || 'project';
    const languageAnswer =
      options.language ??
      (await rl.question('Skill 语言？输入 zh 或 en（默认 zh）：'));
    const existingPlatforms = await detectExistingOneSpecPlatforms(
      options.targetPath,
      resolvedScope,
      selectedPlatforms,
    );
    const overwriteAnswer =
      options.overwrite || existingPlatforms.length === 0
        ? 'no'
        : await rl.question(
            `检测到这些平台已存在 OneSpec skill：${existingPlatforms.join(', ')}。是否覆盖已存在项？输入 yes 或 no（默认 no）：`,
          );

    return {
      ...options,
      platforms: selectedPlatforms,
      scope: resolvedScope,
      language: languageAnswer.trim() || 'zh',
      overwrite: options.overwrite || normalizeYesNo(overwriteAnswer),
    };
  } finally {
    rl.close();
  }
}

function resolvePlatformSelection(answer, defaultPlatforms) {
  const trimmed = answer.trim();
  if (!trimmed) {
    return defaultPlatforms;
  }

  const numbered = trimmed
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      if (!/^\d+$/.test(value)) {
        return value;
      }

      const index = Number.parseInt(value, 10) - 1;
      if (index < 0 || index >= SUPPORTED_PLATFORM_IDS.length) {
        throw new Error(`Unsupported platform selection: ${value}`);
      }
      return SUPPORTED_PLATFORM_IDS[index];
    });

  return parsePlatformList(numbered);
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

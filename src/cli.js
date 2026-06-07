import { execFileSync } from 'node:child_process';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import { doctorProject } from './doctor.js';
import { initProject, SUPPORTED_LANGUAGES } from './init.js';

const OPEN_SPEC_CLI_PACKAGE = '@fission-ai/openspec@latest';
const SUPERPOWERS_PACKAGE = 'obra/superpowers';

function parseArgs(argv) {
  const args = [...argv];
  const command = args.shift() ?? 'help';
  const options = {
    targetPath: process.cwd(),
    platform: 'codex',
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
        options.platform = args.shift() ?? 'codex';
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

function commandExists(command) {
  try {
    const checker = process.platform === 'win32' ? 'where' : 'which';
    execFileSync(checker, [command], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function askInitOptions(options) {
  if (options.yes) {
    return {
      ...options,
      scope: options.scope ?? 'project',
      language: options.language ?? 'zh',
      installOpenSpecCli: false,
      initOpenSpecProject: false,
      installSuperpowers: false,
    };
  }

  const preflight = await doctorProject(options.targetPath, {
    platform: options.platform,
    scope: options.scope ?? 'project',
  });
  const rl = readline.createInterface({ input, output });
  try {
    const scopeAnswer =
      options.scope ??
      (await rl.question('安装范围？输入 project 或 global（默认 project）：'));
    const resolvedScope = scopeAnswer.trim() || 'project';
    const languageAnswer =
      options.language ??
      (await rl.question('Skill 语言？输入 zh 或 en（默认 zh）：'));
    const overwriteAnswer = options.overwrite
      ? 'yes'
      : await rl.question('如果 OneSpec skill 已存在，是否覆盖？输入 yes 或 no（默认 no）：');
    const installOpenSpecCliAnswer =
      preflight.openspecCli.available
        ? 'no'
        : await rl.question(
            `未检测到 OpenSpec CLI。是否现在执行 npm install -g ${OPEN_SPEC_CLI_PACKAGE} ？输入 yes 或 no（默认 no）：`,
          );
    const initOpenSpecProjectAnswer =
      resolvedScope === 'project' && !preflight.hasOpenSpecProject
        ? await rl.question(
            '当前项目未初始化 OpenSpec。是否在安装 OneSpec 后执行 openspec init？输入 yes 或 no（默认 no）：',
          )
        : 'no';
    const installSuperpowersAnswer = preflight.superpowers.available
      ? 'no'
      : await rl.question(
          `未检测到 Superpowers。是否现在执行 npx skills add ${SUPERPOWERS_PACKAGE} -a codex${resolvedScope === 'global' ? ' -g' : ''} -y ？输入 yes 或 no（默认 no）：`,
        );

    return {
      ...options,
      scope: resolvedScope,
      language: languageAnswer.trim() || 'zh',
      overwrite: options.overwrite || ['y', 'yes', '是', '覆盖'].includes(overwriteAnswer.trim()),
      installOpenSpecCli: ['y', 'yes', '是'].includes(installOpenSpecCliAnswer.trim()),
      initOpenSpecProject: ['y', 'yes', '是'].includes(initOpenSpecProjectAnswer.trim()),
      installSuperpowers: ['y', 'yes', '是'].includes(installSuperpowersAnswer.trim()),
    };
  } finally {
    rl.close();
  }
}

function runCommand(command, args, cwd = process.cwd()) {
  execFileSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}

function getNpxExecutable() {
  return process.platform === 'win32' ? 'npx.cmd' : 'npx';
}

async function ensureRequestedDependencies(targetPath, options, preflight) {
  if (options.installOpenSpecCli && !preflight.openspecCli.available) {
    runCommand('npm', ['install', '-g', OPEN_SPEC_CLI_PACKAGE]);
  }

  if (options.installSuperpowers && !preflight.superpowers.available) {
    const args = ['skills', 'add', SUPERPOWERS_PACKAGE, '-a', 'codex', '-y'];
    if (options.scope === 'global') {
      args.push('-g');
    }
    runCommand(getNpxExecutable(), args, targetPath);
  }

  if (options.initOpenSpecProject && !preflight.hasOpenSpecProject) {
    runCommand('openspec', ['init', targetPath], targetPath);
  }
}

function printHelp() {
  console.log(`OneSpec Skill Installer

用法：
  onespec init [path] [--yes] [--overwrite] [--scope project|global] [--language zh|en]
  onespec doctor [path] [--scope project|global]

说明：
  当前提供中英文 Skill bundle，暂仅支持 Codex 平台。
`);
}

function printSummary(result) {
  console.log('\nOneSpec 初始化完成\n');
  console.log(`安装位置：${result.skillPath}`);
  console.log(`安装范围：${result.scope}`);
  console.log(`Skill 语言：${result.languageName} (${result.language})`);
  console.log(`Skill 状态：${result.installedSkill ? '已安装/已覆盖' : '已存在，已跳过'}`);
  console.log(`已安装 Skills：${result.installedSkills.join(', ') || '无'}`);
  console.log(`已跳过 Skills：${result.skippedSkills.join(', ') || '无'}`);
  console.log(`工作目录：${path.join(result.projectPath, 'docs', 'superpowers')}`);
  console.log('\n环境检查：');
  console.log(`OpenSpec CLI：${commandExists('openspec') ? '已找到' : '未找到，请先安装或运行 openspec init'}`);
  console.log('Superpowers：请确认 Codex 可发现 brainstorming / writing-plans / using-git-worktrees 等 skills');
  console.log('\n开始使用：在 Codex 中输入 “使用 onespec：<你的任务描述>”。\n');
}

function printDoctor(report) {
  console.log('\nOneSpec 环境检查\n');
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

  if (command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }
  if (command !== 'init' && command !== 'doctor') {
    throw new Error(`Unknown command: ${command}`);
  }

  if (command === 'doctor') {
    const report = await doctorProject(options.targetPath, {
      platform: options.platform,
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
  const preflight = await doctorProject(initOptions.targetPath, {
    platform: initOptions.platform,
    scope: initOptions.scope ?? 'project',
  });
  await ensureRequestedDependencies(initOptions.targetPath, initOptions, preflight);
  const result = await initProject(initOptions.targetPath, initOptions);
  if (initOptions.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printSummary(result);
  }
}

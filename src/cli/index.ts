#!/usr/bin/env node
/**
 * WorldEngine CLI
 * 命令行接口入口
 */

import { Command } from 'commander';
import { templateList, templateInit, validate, registryBuild, registryStatus, type SupportedLang } from './commands.js';

const program = new Command();

program
  .name('worldengine')
  .description('世界观设定模板系统 CLI / WorldEngine Template System CLI')
  .version('1.0.0');

// template 命令组
const templateCmd = program
  .command('template')
  .description('模板相关命令 / Template commands');

// worldengine template list
templateCmd
  .command('list')
  .description('列出所有可用模板 / List all available templates')
  .option('-l, --lang <lang>', '输出语言 (zh/en) / Output language', undefined)
  .action(async (options: { lang?: string }) => {
    const lang = options.lang as SupportedLang | undefined;
    await templateList({ lang });
  });

// worldengine template init <category> <id>
templateCmd
  .command('init <category> <id>')
  .description('初始化模板文件 / Initialize template file')
  .option('-l, --lang <lang>', '输出语言 (zh/en) / Output language', undefined)
  .action(async (category: string, id: string, options: { lang?: string }) => {
    const lang = options.lang as SupportedLang | undefined;
    const result = await templateInit(category, id, { lang });
    if (!result.success) {
      process.exit(1);
    }
  });

// validate 命令
program
  .command('validate')
  .description('执行验证 / Run validation')
  .option('--cross', '执行交叉验证 / Run cross-validation')
  .option('-l, --lang <lang>', '输出语言 (zh/en) / Output language', undefined)
  .action(async (options: { cross?: boolean; lang?: string }) => {
    const lang = options.lang as SupportedLang | undefined;
    const result = await validate({ cross: options.cross, lang });
    if (!result.success) {
      process.exit(1);
    }
  });

// registry 命令组
const registryCmd = program
  .command('registry')
  .description('注册表相关命令 / Registry commands');

// worldengine registry build
registryCmd
  .command('build')
  .description('重建注册表 / Rebuild registry')
  .option('-l, --lang <lang>', '输出语言 (zh/en) / Output language', undefined)
  .action(async (options: { lang?: string }) => {
    const lang = options.lang as SupportedLang | undefined;
    const result = await registryBuild({ lang });
    if (!result.success) {
      process.exit(1);
    }
  });

// worldengine registry status
registryCmd
  .command('status')
  .description('显示注册表状态 / Show registry status')
  .option('-l, --lang <lang>', '输出语言 (zh/en) / Output language', undefined)
  .action(async (options: { lang?: string }) => {
    const lang = options.lang as SupportedLang | undefined;
    await registryStatus({ lang });
  });

program.parse();

export * from './commands.js';

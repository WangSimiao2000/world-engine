#!/usr/bin/env node
/**
 * CI Validation Script
 * CI 验证脚本 - 用于 GitHub Actions 工作流
 * 
 * 执行完整的 CI 验证流程：
 * 1. 输出目录保护检查
 * 2. 模板格式校验
 * 3. 必填项校验
 * 4. 交叉引用验证
 * 
 * 支持通过 WORLDENGINE_LANG 环境变量切换输出语言 (zh/en)
 * 
 * **Validates: Requirements 5.1, 5.3, 5.4, 13.2, 13.5**
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { execSync } from 'child_process';
import { createCIValidator, type CIValidationOptions } from '../validator/ci-validator.js';
import { createRegistryManager } from '../registry/manager.js';

/**
 * 支持的语言类型
 */
type SupportedLang = 'zh' | 'en';

/**
 * 获取当前语言设置
 * 优先级：WORLDENGINE_LANG 环境变量 > 默认 zh
 */
function getLanguage(): SupportedLang {
  const envLang = process.env['WORLDENGINE_LANG'];
  if (envLang === 'en' || envLang === 'zh') {
    return envLang;
  }
  return 'zh';
}

/**
 * 获取 Git 变更文件列表
 */
async function getChangedFiles(): Promise<string[]> {
  try {
    // 尝试获取 PR 中的变更文件
    const baseSha = process.env.GITHUB_BASE_REF 
      ? execSync(`git rev-parse origin/${process.env.GITHUB_BASE_REF}`, { encoding: 'utf-8' }).trim()
      : 'HEAD~1';
    
    const output = execSync(`git diff --name-only ${baseSha}`, { encoding: 'utf-8' });
    return output.split('\n').filter(line => line.trim() !== '');
  } catch {
    // 如果无法获取 Git 变更，扫描 submissions 目录
    return await scanSubmissionsDirectory();
  }
}

/**
 * 扫描 submissions 目录获取所有文件
 */
async function scanSubmissionsDirectory(): Promise<string[]> {
  const submissionsDir = 'submissions';
  const files: string[] = [];
  
  try {
    const categories = await fs.readdir(submissionsDir);
    for (const category of categories) {
      const categoryPath = path.join(submissionsDir, category);
      const stat = await fs.stat(categoryPath);
      if (stat.isDirectory()) {
        const categoryFiles = await fs.readdir(categoryPath);
        for (const file of categoryFiles) {
          if (file.endsWith('.yaml') || file.endsWith('.yml')) {
            files.push(path.join(categoryPath, file));
          }
        }
      }
    }
  } catch {
    // submissions 目录不存在，返回空数组
  }
  
  return files;
}

/**
 * 格式化验证错误输出
 */
function formatErrors(errors: import('../types/index.js').ValidationError[], lang: SupportedLang): string {
  if (errors.length === 0) return '';
  
  const title = lang === 'zh'
    ? '❌ 验证错误 / Validation Errors:'
    : '❌ Validation Errors:';
  const fileLabel = lang === 'zh' ? '文件 / File' : 'File';
  const fieldLabel = lang === 'zh' ? '字段 / Field' : 'Field';
  
  const lines: string[] = ['', title, ''];
  
  for (const error of errors) {
    const message = lang === 'zh' ? error.message.zh : (error.message.en || error.message.zh);
    lines.push(`[${error.code}] ${message}`);
    lines.push(`  ${fileLabel}: ${error.location.file}`);
    if (error.location.field) {
      lines.push(`  ${fieldLabel}: ${error.location.field}`);
    }
    lines.push('');
  }
  
  return lines.join('\n');
}

/**
 * 格式化验证警告输出
 */
function formatWarnings(warnings: import('../types/index.js').ValidationWarning[], lang: SupportedLang): string {
  if (warnings.length === 0) return '';
  
  const title = lang === 'zh'
    ? '⚠️ 验证警告 / Validation Warnings:'
    : '⚠️ Validation Warnings:';
  const fileLabel = lang === 'zh' ? '文件 / File' : 'File';
  const fieldLabel = lang === 'zh' ? '字段 / Field' : 'Field';
  
  const lines: string[] = ['', title, ''];
  
  for (const warning of warnings) {
    const message = lang === 'zh' ? warning.message.zh : (warning.message.en || warning.message.zh);
    lines.push(`[${warning.code}] ${message}`);
    lines.push(`  ${fileLabel}: ${warning.location.file}`);
    if (warning.location.field) {
      lines.push(`  ${fieldLabel}: ${warning.location.field}`);
    }
    lines.push('');
  }
  
  return lines.join('\n');
}

/**
 * 主函数
 */
async function main(): Promise<void> {
  const lang = getLanguage();
  
  const title = lang === 'zh'
    ? '🔍 WorldEngine CI Validation'
    : '🔍 WorldEngine CI Validation';
  console.log(title);
  console.log('============================\n');
  
  // 获取变更文件
  const changedFiles = await getChangedFiles();
  const detectedMsg = lang === 'zh'
    ? `📁 检测到 ${changedFiles.length} 个变更文件 / Detected ${changedFiles.length} changed files`
    : `📁 Detected ${changedFiles.length} changed files`;
  console.log(`${detectedMsg}\n`);
  
  // 过滤出需要验证的文件（排除以 _ 开头的文件）
  const filesToValidate = changedFiles.filter(file => {
    const fileName = path.basename(file);
    return !fileName.startsWith('_');
  });
  
  if (filesToValidate.length === 0) {
    const noFilesMsg = lang === 'zh'
      ? '✅ 没有需要验证的文件 / No files to validate'
      : '✅ No files to validate';
    console.log(noFilesMsg);
    process.exit(0);
  }
  
  // 加载注册表（如果存在）
  const registryManager = createRegistryManager();
  let registry;
  try {
    registry = await registryManager.loadRegistry('_build');
  } catch {
    // 注册表不存在，使用空注册表
    registry = {
      entities: new Map(),
      index: {
        entries: [],
        lastUpdated: new Date().toISOString(),
      },
    };
  }
  
  // 加载纪元索引（如果存在）
  let epochIndex: import('../types/index.js').EpochIndex = { epochs: [] };
  try {
    const epochIndexPath = 'world/epochs/_index.yaml';
    const epochIndexContent = await fs.readFile(epochIndexPath, 'utf-8');
    const yaml = await import('js-yaml');
    const loaded = yaml.load(epochIndexContent) as { epochs?: import('../types/index.js').Epoch[] };
    if (loaded && loaded.epochs) {
      epochIndex = { epochs: loaded.epochs };
    }
  } catch {
    // 纪元索引不存在，使用空索引
  }
  
  // 执行验证
  const validator = createCIValidator();
  const options: CIValidationOptions = {
    changedFiles: filesToValidate,
    submissionsDir: 'submissions',
    templatesDir: 'templates',
    buildDir: '_build',
    registry,
    epochIndex,
  };
  
  const result = await validator.validateSubmissions(options);
  
  // 输出结果
  const resultsTitle = lang === 'zh'
    ? '📊 验证结果 / Validation Results:'
    : '📊 Validation Results:';
  const totalLabel = lang === 'zh' ? '总文件数 / Total files' : 'Total files';
  const validatedLabel = lang === 'zh' ? '已验证 / Validated' : 'Validated';
  const skippedLabel = lang === 'zh' ? '已跳过 / Skipped' : 'Skipped';
  const errorsLabel = lang === 'zh' ? '错误数 / Errors' : 'Errors';
  const warningsLabel = lang === 'zh' ? '警告数 / Warnings' : 'Warnings';
  
  console.log(resultsTitle);
  console.log(`   ${totalLabel}: ${result.totalFiles}`);
  console.log(`   ${validatedLabel}: ${result.validatedFiles}`);
  console.log(`   ${skippedLabel}: ${result.skippedFiles}`);
  console.log(`   ${errorsLabel}: ${result.errors.length}`);
  console.log(`   ${warningsLabel}: ${result.warnings.length}`);
  
  // 输出警告
  if (result.warnings.length > 0) {
    console.log(formatWarnings(result.warnings, lang));
  }
  
  // 输出错误
  if (result.errors.length > 0) {
    console.log(formatErrors(result.errors, lang));
    const failedMsg = lang === 'zh'
      ? '❌ 验证失败 / Validation Failed'
      : '❌ Validation Failed';
    console.log(failedMsg);
    process.exit(1);
  }
  
  const passedMsg = lang === 'zh'
    ? '\n✅ 验证通过 / Validation Passed'
    : '\n✅ Validation Passed';
  console.log(passedMsg);
  process.exit(0);
}

// 执行主函数
main().catch(error => {
  const lang = getLanguage();
  const errorMsg = lang === 'zh'
    ? '❌ 验证过程出错 / Validation Error:'
    : '❌ Validation Error:';
  console.error(errorMsg, error);
  process.exit(1);
});

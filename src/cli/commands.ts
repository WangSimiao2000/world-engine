/**
 * CLI Commands
 * CLI 命令定义与实现
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import type { Category, Bilingual, TemplateDefinition, FieldDefinition, EpochIndex, Epoch } from '../types/index.js';
import { CATEGORIES, isCategory } from '../types/index.js';
import { createTemplateLoader } from '../template/loader.js';
import { createCIValidator, type CIValidationOptions } from '../validator/ci-validator.js';
import { createRegistryManager } from '../registry/manager.js';

/**
 * 支持的语言
 */
export type SupportedLang = 'zh' | 'en';

/**
 * CLI 命令选项
 */
export interface CLIOptions {
  lang?: SupportedLang;
}

/**
 * CLI 命令接口
 */
export interface CLICommands {
  /**
   * worldengine template list
   * 列出所有可用模板
   */
  templateList(options: CLIOptions): Promise<void>;
  
  /**
   * worldengine template init <category> <id>
   * 初始化模板文件
   */
  templateInit(category: Category, id: string, options: CLIOptions): Promise<void>;
  
  /**
   * worldengine validate --cross
   * 执行验证
   */
  validate(options: CLIOptions & { cross?: boolean }): Promise<void>;
  
  /**
   * worldengine registry build
   * 重建注册表
   */
  registryBuild(options: CLIOptions): Promise<void>;
  
  /**
   * worldengine registry status
   * 显示注册表状态
   */
  registryStatus(options: CLIOptions): Promise<void>;
}

/**
 * 获取当前语言设置
 * 优先级：--lang 参数 > WORLDENGINE_LANG 环境变量 > 默认 zh
 */
export function getLanguage(options: CLIOptions): SupportedLang {
  if (options.lang) {
    return options.lang;
  }
  const envLang = process.env['WORLDENGINE_LANG'];
  if (envLang === 'en' || envLang === 'zh') {
    return envLang;
  }
  return 'zh';
}

/**
 * 获取双语文本
 */
export function getText(bilingual: Bilingual, lang: SupportedLang): string {
  if (lang === 'en' && bilingual.en) {
    return bilingual.en;
  }
  return bilingual.zh;
}

/**
 * Category 的中文名称映射
 */
const CATEGORY_NAMES: Record<Category, Bilingual> = {
  character: { zh: '人物设定', en: 'Character' },
  race: { zh: '种族设定', en: 'Race' },
  creature: { zh: '动物设定', en: 'Creature' },
  flora: { zh: '植物设定', en: 'Flora' },
  location: { zh: '地理设定', en: 'Location' },
  history: { zh: '历史事件', en: 'History' },
  faction: { zh: '势力设定', en: 'Faction' },
  artifact: { zh: '神器设定', en: 'Artifact' },
  concept: { zh: '概念设定', en: 'Concept' },
};

/**
 * 模板摘要信息
 */
export interface TemplateSummary {
  category: Category;
  categoryName: Bilingual;
  description: Bilingual;
  requiredFields: string[];
}

/**
 * 获取模板摘要列表
 */
export async function getTemplateSummaries(templatesDir: string): Promise<TemplateSummary[]> {
  const loader = createTemplateLoader();
  const templates = await loader.loadTemplates(templatesDir);
  
  const summaries: TemplateSummary[] = [];
  
  for (const [category, template] of templates) {
    summaries.push({
      category,
      categoryName: CATEGORY_NAMES[category],
      description: template.description,
      requiredFields: template.required.map(field => field.name),
    });
  }
  
  // 按 category 名称排序
  summaries.sort((a, b) => a.category.localeCompare(b.category));
  
  return summaries;
}

/**
 * 实现 worldengine template list 命令
 * 列出所有可用模板 Category 及必填项摘要
 */
export async function templateList(options: CLIOptions): Promise<void> {
  const lang = getLanguage(options);
  const templatesDir = path.resolve(process.cwd(), 'templates');
  
  try {
    const summaries = await getTemplateSummaries(templatesDir);
    
    // 输出标题
    const title = lang === 'zh' 
      ? '📋 可用模板 / Available Templates'
      : '📋 Available Templates';
    console.log(title);
    console.log('');
    
    // 输出每个模板的信息
    for (const summary of summaries) {
      const categoryName = getText(summary.categoryName, lang);
      const requiredLabel = lang === 'zh' ? '必填项' : 'Required';
      const requiredFields = summary.requiredFields.join(', ');
      
      console.log(`${summary.category} (${categoryName})`);
      console.log(`  ${requiredLabel}: ${requiredFields}`);
      console.log('');
    }
  } catch (error) {
    const errorMsg = lang === 'zh'
      ? '加载模板失败'
      : 'Failed to load templates';
    console.error(`❌ ${errorMsg}:`, error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

/**
 * 获取字段的默认占位符值（不含注释）
 */
function getFieldPlaceholder(field: FieldDefinition): string {
  const type = field.type;
  
  if (type === 'string') {
    return '""';
  } else if (type === 'integer') {
    return '0';
  } else if (type === 'boolean') {
    return 'false';
  } else if (type === 'epoch_ref') {
    return '""';
  } else if (type === 'entity_ref') {
    return '""';
  } else if (type === 'bilingual') {
    return null as unknown as string; // 特殊处理，返回多行
  } else if (type === 'versioning') {
    return null as unknown as string; // 特殊处理，返回多行
  } else if (type.startsWith('array<')) {
    return '[]';
  }
  return '""';
}

/**
 * 获取字段类型的注释说明
 */
function getTypeHint(field: FieldDefinition): string {
  const type = field.type;
  
  if (type === 'epoch_ref') {
    return '(epoch_ref)';
  } else if (type === 'entity_ref') {
    return field.refCategory ? `(${field.refCategory}_ref)` : '(entity_ref)';
  }
  return '';
}

/**
 * 生成字段的 YAML 内容
 */
function generateFieldYaml(field: FieldDefinition, indent: string = ''): string {
  const type = field.type;
  const descZh = field.description.zh;
  const descEn = field.description.en;
  
  if (type === 'bilingual') {
    const lines = [
      `${indent}${field.name}:`,
      `${indent}  zh: ""  # ${descZh}`,
    ];
    if (descEn) {
      lines.push(`${indent}  en: ""  # ${descEn} (optional)`);
    } else {
      lines.push(`${indent}  en: ""  # English (optional)`);
    }
    return lines.join('\n');
  }
  
  if (type === 'versioning') {
    return [
      `${indent}${field.name}:`,
      `${indent}  canon: true  # true=正史, false=野史`,
      `${indent}  source: ""  # 来源作者 ID`,
      `${indent}  priority: official  # official | secondary`,
    ].join('\n');
  }
  
  const placeholder = getFieldPlaceholder(field);
  const typeHint = getTypeHint(field);
  const comment = descEn ? `${descZh} / ${descEn}` : descZh;
  const fullComment = typeHint ? `${typeHint} ${comment}` : comment;
  return `${indent}${field.name}: ${placeholder}  # ${fullComment}`;
}

/**
 * 生成可选字段的注释 YAML 内容
 */
function generateOptionalFieldYaml(field: FieldDefinition, indent: string = ''): string {
  const type = field.type;
  const descZh = field.description.zh;
  const descEn = field.description.en;
  
  if (type === 'bilingual') {
    const lines = [
      `${indent}# ${field.name}:`,
      `${indent}#   zh: ""  # ${descZh}`,
    ];
    if (descEn) {
      lines.push(`${indent}#   en: ""  # ${descEn} (optional)`);
    } else {
      lines.push(`${indent}#   en: ""  # English (optional)`);
    }
    return lines.join('\n');
  }
  
  if (type === 'versioning') {
    return [
      `${indent}# ${field.name}:`,
      `${indent}#   canon: true  # true=正史, false=野史`,
      `${indent}#   source: ""  # 来源作者 ID`,
      `${indent}#   priority: official  # official | secondary`,
    ].join('\n');
  }
  
  const placeholder = getFieldPlaceholder(field);
  const typeHint = getTypeHint(field);
  const comment = descEn ? `${descZh} / ${descEn}` : descZh;
  const fullComment = typeHint ? `${typeHint} ${comment}` : comment;
  return `${indent}# ${field.name}: ${placeholder}  # ${fullComment}`;
}

/**
 * 生成模板初始化文件内容
 */
export function generateTemplateContent(
  template: TemplateDefinition,
  id: string,
  lang: SupportedLang
): string {
  const categoryName = CATEGORY_NAMES[template.category];
  const headerZh = categoryName.zh;
  const headerEn = categoryName.en || template.category;
  
  const lines: string[] = [];
  
  // 文件头注释
  lines.push(`# ${headerZh} / ${headerEn} Template`);
  lines.push(`# 由 worldengine template init 生成`);
  if (lang === 'en') {
    lines.push(`# Generated by worldengine template init`);
  }
  lines.push('');
  
  // template 和 id 字段
  lines.push(`template: ${template.category}`);
  lines.push(`id: ${id}`);
  lines.push('');
  
  // 必填项
  lines.push(`# 必填项 / Required Fields`);
  
  // 过滤掉 id 字段（已经在上面添加了）
  const requiredFields = template.required.filter(f => f.name !== 'id');
  
  for (const field of requiredFields) {
    lines.push(generateFieldYaml(field));
  }
  
  // 可选项
  if (template.optional.length > 0) {
    lines.push('');
    lines.push(`# 可选项 / Optional Fields`);
    
    for (const field of template.optional) {
      lines.push(generateOptionalFieldYaml(field));
    }
  }
  
  return lines.join('\n') + '\n';
}

/**
 * 模板初始化结果
 */
export interface TemplateInitResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

/**
 * 实现 worldengine template init <category> <id> 命令
 * 在 submissions/<category>/ 目录生成预填充模板结构的 YAML 文件
 */
export async function templateInit(
  category: string,
  id: string,
  options: CLIOptions
): Promise<TemplateInitResult> {
  const lang = getLanguage(options);
  const templatesDir = path.resolve(process.cwd(), 'templates');
  const submissionsDir = path.resolve(process.cwd(), 'submissions');
  
  // 验证 category 是否有效
  if (!isCategory(category)) {
    const errorMsg = lang === 'zh'
      ? `无效的模板类别: ${category}。有效类别: ${CATEGORIES.join(', ')}`
      : `Invalid template category: ${category}. Valid categories: ${CATEGORIES.join(', ')}`;
    console.error(`❌ ${errorMsg}`);
    return { success: false, error: errorMsg };
  }
  
  const validCategory = category as Category;
  
  try {
    // 加载模板定义
    const loader = createTemplateLoader();
    const template = await loader.loadTemplate(templatesDir, validCategory);
    
    // 创建目标目录
    const categoryDir = path.join(submissionsDir, validCategory);
    await fs.mkdir(categoryDir, { recursive: true });
    
    // 生成文件内容
    const content = generateTemplateContent(template, id, lang);
    
    // 写入文件
    const filePath = path.join(categoryDir, `${id}.yaml`);
    await fs.writeFile(filePath, content, 'utf-8');
    
    // 输出成功消息
    const successMsg = lang === 'zh'
      ? `✅ 已创建模板文件: ${filePath}`
      : `✅ Created template file: ${filePath}`;
    console.log(successMsg);
    
    return { success: true, filePath };
  } catch (error) {
    const errorMsg = lang === 'zh'
      ? '创建模板文件失败'
      : 'Failed to create template file';
    const errorDetail = error instanceof Error ? error.message : String(error);
    console.error(`❌ ${errorMsg}: ${errorDetail}`);
    return { success: false, error: errorDetail };
  }
}

/**
 * 验证选项
 */
export interface ValidateOptions extends CLIOptions {
  cross?: boolean;
}

/**
 * 验证结果
 */
export interface ValidateResult {
  success: boolean;
  totalFiles: number;
  validatedFiles: number;
  skippedFiles: number;
  errorCount: number;
  warningCount: number;
}

/**
 * 扫描 submissions 目录获取所有文件
 */
async function scanSubmissionsDirectory(submissionsDir: string): Promise<string[]> {
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
 * 加载纪元索引
 */
async function loadEpochIndex(): Promise<EpochIndex> {
  try {
    const epochIndexPath = path.resolve(process.cwd(), 'world/epochs/_index.yaml');
    const epochIndexContent = await fs.readFile(epochIndexPath, 'utf-8');
    const loaded = yaml.load(epochIndexContent) as { epochs?: Epoch[] };
    if (loaded && loaded.epochs) {
      return { epochs: loaded.epochs };
    }
  } catch {
    // 纪元索引不存在，使用空索引
  }
  return { epochs: [] };
}

/**
 * 格式化验证错误输出
 */
function formatErrors(
  errors: import('../types/index.js').ValidationError[],
  lang: SupportedLang
): string {
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
function formatWarnings(
  warnings: import('../types/index.js').ValidationWarning[],
  lang: SupportedLang
): string {
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
 * 实现 worldengine validate --cross 命令
 * 对 submissions/ 目录执行完整交叉验证
 * 输出与 CI 相同的验证结果
 * 
 * **Validates: Requirements 5.6, 8.3**
 */
export async function validate(options: ValidateOptions): Promise<ValidateResult> {
  const lang = getLanguage(options);
  const submissionsDir = path.resolve(process.cwd(), 'submissions');
  const templatesDir = path.resolve(process.cwd(), 'templates');
  const buildDir = path.resolve(process.cwd(), '_build');
  
  // 输出标题
  const title = lang === 'zh'
    ? '🔍 WorldEngine 验证 / WorldEngine Validation'
    : '🔍 WorldEngine Validation';
  console.log(title);
  console.log('='.repeat(40));
  console.log('');
  
  // 扫描 submissions 目录获取所有文件
  const allFiles = await scanSubmissionsDirectory(submissionsDir);
  
  // 过滤出需要验证的文件（排除以 _ 开头的文件）
  const filesToValidate = allFiles.filter(file => {
    const fileName = path.basename(file);
    return !fileName.startsWith('_');
  });
  
  const detectedMsg = lang === 'zh'
    ? `📁 检测到 ${allFiles.length} 个文件 / Detected ${allFiles.length} files`
    : `📁 Detected ${allFiles.length} files`;
  console.log(detectedMsg);
  console.log('');
  
  if (filesToValidate.length === 0) {
    const noFilesMsg = lang === 'zh'
      ? '✅ 没有需要验证的文件 / No files to validate'
      : '✅ No files to validate';
    console.log(noFilesMsg);
    return {
      success: true,
      totalFiles: 0,
      validatedFiles: 0,
      skippedFiles: 0,
      errorCount: 0,
      warningCount: 0,
    };
  }
  
  // 加载注册表（如果存在）
  const registryManager = createRegistryManager();
  let registry;
  try {
    registry = await registryManager.loadRegistry(buildDir);
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
  const epochIndex = await loadEpochIndex();
  
  // 执行验证
  const validator = createCIValidator();
  const validationOptions: CIValidationOptions = {
    changedFiles: filesToValidate,
    submissionsDir,
    templatesDir,
    buildDir,
    registry,
    epochIndex,
  };
  
  const result = await validator.validateSubmissions(validationOptions);
  
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
  } else {
    const passedMsg = lang === 'zh'
      ? '\n✅ 验证通过 / Validation Passed'
      : '\n✅ Validation Passed';
    console.log(passedMsg);
  }
  
  return {
    success: result.valid,
    totalFiles: result.totalFiles,
    validatedFiles: result.validatedFiles,
    skippedFiles: result.skippedFiles,
    errorCount: result.errors.length,
    warningCount: result.warnings.length,
  };
}

/**
 * 注册表构建结果
 */
export interface RegistryBuildResult {
  success: boolean;
  totalEntities: number;
  byCategory: Record<Category, number>;
  error?: string;
}

/**
 * 实现 worldengine registry build 命令
 * 从 submissions/ 目录重新构建完整的 _build/ 目录
 * 
 * **Validates: Requirements 8.4**
 */
export async function registryBuild(options: CLIOptions): Promise<RegistryBuildResult> {
  const lang = getLanguage(options);
  const submissionsDir = path.resolve(process.cwd(), 'submissions');
  const buildDir = path.resolve(process.cwd(), '_build');
  
  // 输出标题
  const title = lang === 'zh'
    ? '🔨 WorldEngine 注册表重建 / Registry Rebuild'
    : '🔨 WorldEngine Registry Rebuild';
  console.log(title);
  console.log('='.repeat(40));
  console.log('');
  
  // 输出进度：开始重建
  const startMsg = lang === 'zh'
    ? '📂 正在从 submissions/ 重建注册表... / Rebuilding registry from submissions/...'
    : '📂 Rebuilding registry from submissions/...';
  console.log(startMsg);
  
  try {
    // 使用 RegistryManager 重建注册表
    const registryManager = createRegistryManager();
    await registryManager.rebuild(submissionsDir, buildDir);
    
    // 获取重建后的状态统计
    const status = registryManager.getStatus();
    
    // 输出成功消息
    console.log('');
    const successMsg = lang === 'zh'
      ? '✅ 注册表重建完成 / Registry rebuild completed'
      : '✅ Registry rebuild completed';
    console.log(successMsg);
    console.log('');
    
    // 输出统计信息
    const statsTitle = lang === 'zh'
      ? '📊 统计信息 / Statistics:'
      : '📊 Statistics:';
    console.log(statsTitle);
    
    const totalLabel = lang === 'zh' ? '总实体数 / Total entities' : 'Total entities';
    console.log(`   ${totalLabel}: ${status.totalCount}`);
    
    // 按类别输出统计
    const byCategoryLabel = lang === 'zh' ? '按类别 / By category:' : 'By category:';
    console.log(`   ${byCategoryLabel}`);
    
    for (const category of CATEGORIES) {
      const count = status.byCategory[category];
      if (count > 0) {
        const categoryName = getText(CATEGORY_NAMES[category], lang);
        console.log(`     - ${category} (${categoryName}): ${count}`);
      }
    }
    
    // 输出正史/野史统计
    const canonLabel = lang === 'zh' ? '正史 / Canon' : 'Canon';
    const nonCanonLabel = lang === 'zh' ? '野史 / Non-canon' : 'Non-canon';
    console.log(`   ${canonLabel}: ${status.canonCount}`);
    console.log(`   ${nonCanonLabel}: ${status.nonCanonCount}`);
    
    // 输出最后更新时间
    const lastUpdatedLabel = lang === 'zh' ? '最后更新 / Last updated' : 'Last updated';
    console.log(`   ${lastUpdatedLabel}: ${status.lastUpdated}`);
    
    return {
      success: true,
      totalEntities: status.totalCount,
      byCategory: status.byCategory,
    };
  } catch (error) {
    const errorMsg = lang === 'zh'
      ? '注册表重建失败'
      : 'Registry rebuild failed';
    const errorDetail = error instanceof Error ? error.message : String(error);
    console.error(`❌ ${errorMsg}: ${errorDetail}`);
    
    return {
      success: false,
      totalEntities: 0,
      byCategory: {
        character: 0,
        race: 0,
        creature: 0,
        flora: 0,
        location: 0,
        history: 0,
        faction: 0,
        artifact: 0,
        concept: 0,
      },
      error: errorDetail,
    };
  }
}

/**
 * 注册表状态结果
 */
export interface RegistryStatusResult {
  success: boolean;
  totalEntities: number;
  byCategory: Record<Category, number>;
  canonCount: number;
  nonCanonCount: number;
  lastUpdated: string;
  error?: string;
}

/**
 * 实现 worldengine registry status 命令
 * 显示当前注册表中各 Category 的设定数量统计
 * 
 * **Validates: Requirements 8.5**
 */
export async function registryStatus(options: CLIOptions): Promise<RegistryStatusResult> {
  const lang = getLanguage(options);
  const buildDir = path.resolve(process.cwd(), '_build');
  
  // 输出标题
  const title = lang === 'zh'
    ? '📊 WorldEngine 注册表状态 / Registry Status'
    : '📊 WorldEngine Registry Status';
  console.log(title);
  console.log('='.repeat(40));
  console.log('');
  
  try {
    // 使用 RegistryManager 加载注册表
    const registryManager = createRegistryManager();
    await registryManager.loadRegistry(buildDir);
    
    // 获取状态统计
    const status = registryManager.getStatus();
    
    // 输出统计信息
    const statsTitle = lang === 'zh'
      ? '📋 统计信息 / Statistics:'
      : '📋 Statistics:';
    console.log(statsTitle);
    
    const totalLabel = lang === 'zh' ? '总实体数 / Total entities' : 'Total entities';
    console.log(`   ${totalLabel}: ${status.totalCount}`);
    
    // 按类别输出统计
    const byCategoryLabel = lang === 'zh' ? '按类别 / By category:' : 'By category:';
    console.log(`   ${byCategoryLabel}`);
    
    let hasEntities = false;
    for (const category of CATEGORIES) {
      const count = status.byCategory[category];
      if (count > 0) {
        hasEntities = true;
        const categoryName = getText(CATEGORY_NAMES[category], lang);
        console.log(`     - ${category} (${categoryName}): ${count}`);
      }
    }
    
    // 如果没有任何实体，显示提示
    if (!hasEntities && status.totalCount === 0) {
      const emptyMsg = lang === 'zh'
        ? '     (空 / empty)'
        : '     (empty)';
      console.log(emptyMsg);
    }
    
    // 输出正史/野史统计
    const canonLabel = lang === 'zh' ? '正史 / Canon' : 'Canon';
    const nonCanonLabel = lang === 'zh' ? '野史 / Non-canon' : 'Non-canon';
    console.log(`   ${canonLabel}: ${status.canonCount}`);
    console.log(`   ${nonCanonLabel}: ${status.nonCanonCount}`);
    
    // 输出最后更新时间
    const lastUpdatedLabel = lang === 'zh' ? '最后更新 / Last updated' : 'Last updated';
    console.log(`   ${lastUpdatedLabel}: ${status.lastUpdated}`);
    
    return {
      success: true,
      totalEntities: status.totalCount,
      byCategory: status.byCategory,
      canonCount: status.canonCount,
      nonCanonCount: status.nonCanonCount,
      lastUpdated: status.lastUpdated,
    };
  } catch (error) {
    const errorMsg = lang === 'zh'
      ? '获取注册表状态失败'
      : 'Failed to get registry status';
    const errorDetail = error instanceof Error ? error.message : String(error);
    console.error(`❌ ${errorMsg}: ${errorDetail}`);
    
    return {
      success: false,
      totalEntities: 0,
      byCategory: {
        character: 0,
        race: 0,
        creature: 0,
        flora: 0,
        location: 0,
        history: 0,
        faction: 0,
        artifact: 0,
        concept: 0,
      },
      canonCount: 0,
      nonCanonCount: 0,
      lastUpdated: '',
      error: errorDetail,
    };
  }
}

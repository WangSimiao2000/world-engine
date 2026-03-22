/**
 * CI Validator
 * CI 验证流程编排器 - 按顺序执行验证管线并汇总结果
 * 
 * 验证顺序：
 * 1. 输出目录保护检查 (validateOutputProtection)
 * 2. 模板格式校验 (template format validation)
 * 3. 必填项校验 (required fields validation)
 * 4. 交叉引用验证 (cross-reference validation)
 * 
 * **Validates: Requirements 5.2, 5.5**
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type {
  Category,
  ValidationError,
  ValidationWarning,
  TemplateDefinition,
  Registry,
  EpochIndex,
  Submission,
} from '../types/index.js';
import { validateOutputProtection } from './output-protection.js';
import { parseSubmission, type ParsedSubmission } from './submission.js';
import { validateRequiredFields } from './required.js';
import { validateUnknownFields } from './unknown.js';
import { validateFieldTypes } from './type.js';
import { validateConstraints } from './constraint.js';
import { validateAllReferences, isCanonSubmission } from './reference-validator.js';
import { createTemplateLoader } from '../template/loader.js';

/**
 * CI 验证选项
 */
export interface CIValidationOptions {
  /** 变更文件路径列表 */
  changedFiles: string[];
  /** submissions 目录路径 */
  submissionsDir: string;
  /** templates 目录路径 */
  templatesDir: string;
  /** build 目录路径（用于加载 Registry） */
  buildDir: string;
  /** 纪元索引（可选，用于交叉引用验证） */
  epochIndex?: EpochIndex;
  /** 注册表（可选，用于交叉引用验证） */
  registry?: Registry;
}

/**
 * CI 验证结果
 */
export interface CIValidationResult {
  /** 验证是否通过 */
  valid: boolean;
  /** 总文件数 */
  totalFiles: number;
  /** 已验证文件数 */
  validatedFiles: number;
  /** 跳过的文件数 */
  skippedFiles: number;
  /** 所有错误 */
  errors: ValidationError[];
  /** 所有警告 */
  warnings: ValidationWarning[];
}

/**
 * 单个文件的验证结果
 */
interface FileValidationResult {
  filePath: string;
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  submission?: ParsedSubmission;
}

/**
 * CI 验证器接口
 */
export interface CIValidator {
  /**
   * 执行完整的 CI 验证流程
   * @param options 验证选项
   */
  validateSubmissions(options: CIValidationOptions): Promise<CIValidationResult>;
}

/**
 * 创建 CI 验证器实例
 */
export function createCIValidator(): CIValidator {
  return new CIValidatorImpl();
}

/**
 * CI 验证器实现
 */
class CIValidatorImpl implements CIValidator {
  /**
   * 执行完整的 CI 验证流程
   */
  async validateSubmissions(options: CIValidationOptions): Promise<CIValidationResult> {
    const allErrors: ValidationError[] = [];
    const allWarnings: ValidationWarning[] = [];
    let validatedFiles = 0;
    let skippedFiles = 0;

    // 过滤出 submissions 目录下的文件
    const submissionFiles = this.filterSubmissionFiles(options.changedFiles, options.submissionsDir);
    const totalFiles = submissionFiles.length;

    // Step 1: 输出目录保护检查
    const protectionResult = validateOutputProtection(options.changedFiles);
    if (!protectionResult.valid) {
      // 如果输出目录保护检查失败，立即返回
      return {
        valid: false,
        totalFiles,
        validatedFiles: 0,
        skippedFiles: 0,
        errors: protectionResult.hardErrors,
        warnings: protectionResult.softWarnings,
      };
    }

    // 如果没有 submission 文件需要验证，直接返回成功
    if (submissionFiles.length === 0) {
      return {
        valid: true,
        totalFiles: 0,
        validatedFiles: 0,
        skippedFiles: 0,
        errors: [],
        warnings: [],
      };
    }

    // 加载模板定义
    const templateLoader = createTemplateLoader();
    let templates: Map<Category, TemplateDefinition>;
    try {
      templates = await templateLoader.loadTemplates(options.templatesDir);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      allErrors.push({
        code: 'ERR_TEMPLATE_LOAD',
        message: {
          zh: `无法加载模板定义: ${errorMessage}`,
          en: `Failed to load template definitions: ${errorMessage}`,
        },
        location: {
          file: options.templatesDir,
          field: '',
        },
      });
      return {
        valid: false,
        totalFiles,
        validatedFiles: 0,
        skippedFiles: 0,
        errors: allErrors,
        warnings: allWarnings,
      };
    }

    // 准备交叉引用验证所需的数据
    const registry = options.registry || this.createEmptyRegistry();
    const epochIndex = options.epochIndex || { epochs: [] };
    const parsedSubmissions: Submission[] = [];

    // Step 2-4: 对每个文件执行验证
    for (const filePath of submissionFiles) {
      // 跳过以 _ 开头的文件（如 _example.yaml）
      const fileName = path.basename(filePath);
      if (fileName.startsWith('_')) {
        skippedFiles++;
        continue;
      }

      const fileResult = await this.validateSingleFile(
        filePath,
        templates,
        registry,
        parsedSubmissions,
        epochIndex
      );

      if (fileResult.submission) {
        // 将解析后的 submission 添加到当前批次，用于后续交叉引用验证
        parsedSubmissions.push({
          template: fileResult.submission.template,
          id: fileResult.submission.id,
          ...fileResult.submission.data,
        } as Submission);
      }

      allErrors.push(...fileResult.errors);
      allWarnings.push(...fileResult.warnings);
      validatedFiles++;
    }

    return {
      valid: allErrors.length === 0,
      totalFiles,
      validatedFiles,
      skippedFiles,
      errors: allErrors,
      warnings: allWarnings,
    };
  }

  /**
   * 过滤出 submissions 目录下的文件
   */
  private filterSubmissionFiles(changedFiles: string[], submissionsDir: string): string[] {
    const normalizedSubmissionsDir = submissionsDir.replace(/\\/g, '/');
    
    return changedFiles.filter(file => {
      const normalizedFile = file.replace(/\\/g, '/');
      // 检查文件是否在 submissions 目录下
      const isInSubmissions = normalizedFile.startsWith(normalizedSubmissionsDir + '/') ||
                              normalizedFile.startsWith(normalizedSubmissionsDir);
      // 检查是否为 YAML 文件
      const isYaml = normalizedFile.endsWith('.yaml') || normalizedFile.endsWith('.yml');
      return isInSubmissions && isYaml;
    });
  }

  /**
   * 验证单个文件
   */
  private async validateSingleFile(
    filePath: string,
    templates: Map<Category, TemplateDefinition>,
    registry: Registry,
    currentBatch: Submission[],
    epochIndex: EpochIndex
  ): Promise<FileValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // 读取文件内容
    let content: string;
    try {
      content = await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push({
        code: 'ERR_FILE_READ',
        message: {
          zh: `无法读取文件: ${errorMessage}`,
          en: `Failed to read file: ${errorMessage}`,
        },
        location: {
          file: filePath,
          field: '',
        },
      });
      return { filePath, valid: false, errors, warnings };
    }

    // Step 2: 模板格式校验（YAML 解析 + template/id 字段验证）
    const parseResult = parseSubmission(content, filePath);
    if (!parseResult.result.valid || !parseResult.submission) {
      errors.push(...parseResult.result.hardErrors);
      warnings.push(...parseResult.result.softWarnings);
      return { filePath, valid: false, errors, warnings };
    }

    const submission = parseResult.submission;
    const template = templates.get(submission.template);

    if (!template) {
      errors.push({
        code: 'ERR_TEMPLATE_NOT_FOUND',
        message: {
          zh: `找不到模板定义: ${submission.template}`,
          en: `Template definition not found: ${submission.template}`,
        },
        location: {
          file: filePath,
          field: 'template',
        },
      });
      return { filePath, valid: false, errors, warnings, submission };
    }

    // Step 3: 必填项校验
    const requiredResult = validateRequiredFields(submission.data, template, filePath);
    errors.push(...requiredResult.hardErrors);
    warnings.push(...requiredResult.softWarnings);

    // 字段类型验证
    const typeResult = validateFieldTypes(submission.data, template, filePath);
    errors.push(...typeResult.hardErrors);
    warnings.push(...typeResult.softWarnings);

    // 约束条件验证
    const constraintResult = validateConstraints(submission.data, template, filePath);
    errors.push(...constraintResult.hardErrors);
    warnings.push(...constraintResult.softWarnings);

    // 未知字段警告
    const unknownResult = validateUnknownFields(submission.data, template, filePath);
    warnings.push(...unknownResult.softWarnings);

    // Step 4: 交叉引用验证
    const submissionObj: Submission = {
      template: submission.template,
      id: submission.id,
      ...submission.data,
    } as Submission;

    const isCanon = isCanonSubmission(submissionObj);
    const refResult = validateAllReferences(
      submissionObj,
      template,
      registry,
      currentBatch,
      epochIndex,
      {
        isCanon,
        filePath,
      }
    );
    errors.push(...refResult.hardErrors);
    warnings.push(...refResult.softWarnings);

    return {
      filePath,
      valid: errors.length === 0,
      errors,
      warnings,
      submission,
    };
  }

  /**
   * 创建空的注册表
   */
  private createEmptyRegistry(): Registry {
    return {
      entities: new Map(),
      index: {
        entries: [],
        lastUpdated: new Date().toISOString(),
      },
    };
  }
}

/**
 * 便捷函数：执行 CI 验证
 */
export async function validateSubmissions(options: CIValidationOptions): Promise<CIValidationResult> {
  const validator = createCIValidator();
  return validator.validateSubmissions(options);
}

/**
 * Submission Format Validator
 * 提交文件格式验证器 - 负责验证 Submission 文件的基本格式
 */

import * as yaml from 'js-yaml';
import type {
  Category,
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from '../types/index.js';
import { CATEGORIES, isCategory, ErrorCodes } from '../types/index.js';

/**
 * ID 格式正则表达式映射
 * Maps each category to its expected ID format regex
 */
export const ID_PATTERNS: Record<Category, RegExp> = {
  character: /^char-[a-z0-9-]+$/,
  race: /^race-[a-z0-9-]+$/,
  creature: /^creature-[a-z0-9-]+$/,
  flora: /^flora-[a-z0-9-]+$/,
  location: /^loc-[a-z0-9-]+$/,
  history: /^event-[a-z0-9-]+$/,
  faction: /^faction-[a-z0-9-]+$/,
  artifact: /^artifact-[a-z0-9-]+$/,
  concept: /^concept-[a-z0-9-]+$/,
};

/**
 * ID 格式前缀映射（用于错误提示）
 */
export const ID_PREFIXES: Record<Category, string> = {
  character: 'char-<name>',
  race: 'race-<name>',
  creature: 'creature-<name>',
  flora: 'flora-<name>',
  location: 'loc-<name>',
  history: 'event-<name>',
  faction: 'faction-<name>',
  artifact: 'artifact-<name>',
  concept: 'concept-<name>',
};

/**
 * 解析后的 Submission 数据
 */
export interface ParsedSubmission {
  template: Category;
  id: string;
  data: Record<string, unknown>;
}

/**
 * Submission 验证器接口
 */
export interface SubmissionValidator {
  /**
   * 验证 YAML 内容的格式
   * @param content YAML 字符串内容
   * @param filePath 文件路径（用于错误报告）
   */
  validateFormat(content: string, filePath: string): ValidationResult;

  /**
   * 解析并验证 Submission 文件
   * @param content YAML 字符串内容
   * @param filePath 文件路径（用于错误报告）
   * @returns 解析后的 Submission 数据，如果验证失败则返回 null
   */
  parseAndValidate(content: string, filePath: string): { result: ValidationResult; submission: ParsedSubmission | null };
}

/**
 * 创建 Submission 验证器实例
 */
export function createSubmissionValidator(): SubmissionValidator {
  return new SubmissionValidatorImpl();
}

/**
 * Submission 验证器实现
 */
class SubmissionValidatorImpl implements SubmissionValidator {
  /**
   * 验证 YAML 内容的格式
   */
  validateFormat(content: string, filePath: string): ValidationResult {
    const { result } = this.parseAndValidate(content, filePath);
    return result;
  }

  /**
   * 解析并验证 Submission 文件
   */
  parseAndValidate(content: string, filePath: string): { result: ValidationResult; submission: ParsedSubmission | null } {
    const hardErrors: ValidationError[] = [];
    const softWarnings: ValidationWarning[] = [];

    // Step 1: 解析 YAML
    let data: unknown;
    try {
      data = yaml.load(content);
    } catch (error) {
      const yamlError = error as yaml.YAMLException;
      hardErrors.push({
        code: ErrorCodes.YAML_INVALID,
        message: {
          zh: `YAML 格式不合法: ${yamlError.message}`,
          en: `Invalid YAML format: ${yamlError.message}`,
        },
        location: {
          file: filePath,
          field: '',
          line: yamlError.mark?.line ? yamlError.mark.line + 1 : undefined,
        },
      });
      return {
        result: { valid: false, hardErrors, softWarnings },
        submission: null,
      };
    }

    // Step 2: 验证数据是对象
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      hardErrors.push({
        code: ErrorCodes.YAML_INVALID,
        message: {
          zh: 'Submission 文件内容必须是一个对象',
          en: 'Submission file content must be an object',
        },
        location: {
          file: filePath,
          field: '',
        },
      });
      return {
        result: { valid: false, hardErrors, softWarnings },
        submission: null,
      };
    }

    const obj = data as Record<string, unknown>;

    // Step 3: 验证 template 字段存在
    if (obj['template'] === undefined) {
      hardErrors.push({
        code: ErrorCodes.TEMPLATE_MISSING,
        message: {
          zh: '未指定模板类型，缺少 template 字段',
          en: 'Template type not specified, missing template field',
        },
        location: {
          file: filePath,
          field: 'template',
        },
      });
      return {
        result: { valid: false, hardErrors, softWarnings },
        submission: null,
      };
    }

    // Step 4: 验证 template 字段值有效
    if (!isCategory(obj['template'])) {
      hardErrors.push({
        code: ErrorCodes.TEMPLATE_UNKNOWN,
        message: {
          zh: `未知的模板类型: ${String(obj['template'])}，有效值为: ${CATEGORIES.join(', ')}`,
          en: `Unknown template type: ${String(obj['template'])}, valid values are: ${CATEGORIES.join(', ')}`,
        },
        location: {
          file: filePath,
          field: 'template',
        },
      });
      return {
        result: { valid: false, hardErrors, softWarnings },
        submission: null,
      };
    }

    const template = obj['template'] as Category;

    // Step 5: 验证 id 字段存在
    if (obj['id'] === undefined) {
      hardErrors.push({
        code: ErrorCodes.FIELD_REQUIRED,
        message: {
          zh: '缺少必填字段: id',
          en: 'Missing required field: id',
        },
        location: {
          file: filePath,
          field: 'id',
        },
      });
      return {
        result: { valid: false, hardErrors, softWarnings },
        submission: null,
      };
    }

    // Step 6: 验证 id 字段是字符串
    if (typeof obj['id'] !== 'string') {
      hardErrors.push({
        code: ErrorCodes.FIELD_REQUIRED,
        message: {
          zh: 'id 字段必须是字符串',
          en: 'id field must be a string',
        },
        location: {
          file: filePath,
          field: 'id',
        },
      });
      return {
        result: { valid: false, hardErrors, softWarnings },
        submission: null,
      };
    }

    const id = obj['id'] as string;

    // Step 7: 验证 id 格式符合 category 要求
    const idPattern = ID_PATTERNS[template];
    if (!idPattern.test(id)) {
      hardErrors.push({
        code: ErrorCodes.CONSTRAINT_REGEX,
        message: {
          zh: `ID 格式错误，应为 ${ID_PREFIXES[template]}`,
          en: `Invalid ID format, should be ${ID_PREFIXES[template]}`,
        },
        location: {
          file: filePath,
          field: 'id',
        },
      });
      return {
        result: { valid: false, hardErrors, softWarnings },
        submission: null,
      };
    }

    // 验证通过
    return {
      result: { valid: true, hardErrors: [], softWarnings: [] },
      submission: {
        template,
        id,
        data: obj,
      },
    };
  }
}

/**
 * 便捷函数：验证 YAML 格式
 */
export function validateYamlFormat(content: string, filePath: string): ValidationResult {
  const validator = createSubmissionValidator();
  return validator.validateFormat(content, filePath);
}

/**
 * 便捷函数：解析并验证 Submission
 */
export function parseSubmission(content: string, filePath: string): { result: ValidationResult; submission: ParsedSubmission | null } {
  const validator = createSubmissionValidator();
  return validator.parseAndValidate(content, filePath);
}

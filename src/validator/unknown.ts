/**
 * Unknown Fields Validator
 * 未定义字段警告验证器 - 检测 Submission 中模板未定义的字段
 */

import type {
  TemplateDefinition,
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from '../types/index.js';
import { WarningCodes } from '../types/index.js';

/**
 * 系统保留字段，不会触发未知字段警告
 * These fields are always valid and should not trigger warnings
 */
const RESERVED_FIELDS = ['template', 'id'] as const;

/**
 * 验证 Submission 中是否包含模板未定义的字段
 * 
 * @param submission - 提交的数据对象
 * @param template - 模板定义
 * @param filePath - 文件路径（用于警告报告）
 * @returns ValidationResult 包含未知字段的警告信息
 * 
 * **Validates: Requirements 3.3**
 */
export function validateUnknownFields(
  submission: Record<string, unknown>,
  template: TemplateDefinition,
  filePath: string
): ValidationResult {
  const hardErrors: ValidationError[] = [];
  const softWarnings: ValidationWarning[] = [];
  
  // 收集模板中定义的所有字段名
  const definedFields = new Set<string>();
  
  // 添加保留字段
  for (const field of RESERVED_FIELDS) {
    definedFields.add(field);
  }
  
  // 添加必填字段
  for (const field of template.required) {
    definedFields.add(field.name);
  }
  
  // 添加选填字段
  for (const field of template.optional) {
    definedFields.add(field.name);
  }
  
  // 检查 submission 中的每个字段
  for (const fieldName of Object.keys(submission)) {
    if (!definedFields.has(fieldName)) {
      softWarnings.push({
        code: WarningCodes.FIELD_UNKNOWN,
        message: {
          zh: `未知字段: ${fieldName}`,
          en: `Unknown field: ${fieldName}`,
        },
        location: {
          file: filePath,
          field: fieldName,
        },
      });
    }
  }
  
  return {
    valid: true, // 未知字段只产生警告，不影响验证结果
    hardErrors,
    softWarnings,
  };
}

/**
 * 获取 Submission 中模板未定义的字段列表
 * 
 * @param submission - 提交的数据对象
 * @param template - 模板定义
 * @returns 未知字段名称数组
 */
export function getUnknownFields(
  submission: Record<string, unknown>,
  template: TemplateDefinition
): string[] {
  const unknownFields: string[] = [];
  
  // 收集模板中定义的所有字段名
  const definedFields = new Set<string>();
  
  // 添加保留字段
  for (const field of RESERVED_FIELDS) {
    definedFields.add(field);
  }
  
  // 添加必填字段
  for (const field of template.required) {
    definedFields.add(field.name);
  }
  
  // 添加选填字段
  for (const field of template.optional) {
    definedFields.add(field.name);
  }
  
  // 检查 submission 中的每个字段
  for (const fieldName of Object.keys(submission)) {
    if (!definedFields.has(fieldName)) {
      unknownFields.push(fieldName);
    }
  }
  
  return unknownFields;
}

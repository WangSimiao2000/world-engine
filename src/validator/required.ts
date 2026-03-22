/**
 * Required Fields Validator
 * 必填项验证器 - 检查 Submission 是否包含模板定义的所有必填项
 */

import type {
  TemplateDefinition,
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from '../types/index.js';
import { ErrorCodes } from '../types/index.js';

/**
 * 验证 Submission 是否包含模板定义的所有必填项
 * 
 * @param submission - 提交的数据对象
 * @param template - 模板定义
 * @param filePath - 文件路径（用于错误报告）
 * @returns ValidationResult 包含缺失字段的错误信息
 * 
 * **Validates: Requirements 3.1, 3.2**
 */
export function validateRequiredFields(
  submission: Record<string, unknown>,
  template: TemplateDefinition,
  filePath: string
): ValidationResult {
  const hardErrors: ValidationError[] = [];
  const softWarnings: ValidationWarning[] = [];
  
  // 收集所有缺失的必填字段
  const missingFields: string[] = [];
  
  for (const field of template.required) {
    const fieldName = field.name;
    
    // 检查字段是否存在于 submission 中
    // 注意：值为 null 或 undefined 都视为缺失
    // 使用 Object.hasOwn 避免原型链上的属性干扰
    if (!Object.hasOwn(submission, fieldName) || submission[fieldName] === undefined || submission[fieldName] === null) {
      missingFields.push(fieldName);
    }
  }
  
  // 如果有缺失字段，生成错误信息
  if (missingFields.length > 0) {
    const missingFieldsList = missingFields.join(', ');
    
    hardErrors.push({
      code: ErrorCodes.FIELD_REQUIRED,
      message: {
        zh: `缺少必填字段: ${missingFieldsList}`,
        en: `Missing required fields: ${missingFieldsList}`,
      },
      location: {
        file: filePath,
        field: missingFields[0] ?? '', // 主要字段位置指向第一个缺失字段
      },
      relatedEntities: missingFields,
    });
  }
  
  return {
    valid: hardErrors.length === 0,
    hardErrors,
    softWarnings,
  };
}

/**
 * 获取 Submission 中缺失的必填字段列表
 * 
 * @param submission - 提交的数据对象
 * @param template - 模板定义
 * @returns 缺失字段名称数组
 */
export function getMissingRequiredFields(
  submission: Record<string, unknown>,
  template: TemplateDefinition
): string[] {
  const missingFields: string[] = [];
  
  for (const field of template.required) {
    const fieldName = field.name;
    
    // 使用 Object.hasOwn 避免原型链上的属性干扰
    if (!Object.hasOwn(submission, fieldName) || submission[fieldName] === undefined || submission[fieldName] === null) {
      missingFields.push(fieldName);
    }
  }
  
  return missingFields;
}

/**
 * Constraint Validator
 * 约束条件验证器 - 验证字段值是否满足模板定义的约束条件
 * 
 * 支持的约束类型:
 * - regex: 正则表达式约束
 * - enum: 枚举约束
 * - range: 数值范围约束
 * - ref_exists: 引用存在性约束（由 cross-validator 处理，此处跳过）
 */

import type {
  FieldConstraint,
  TemplateDefinition,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  RangeValue,
} from '../types/index.js';
import { ErrorCodes, isRangeValue } from '../types/index.js';

/**
 * 验证单个值是否满足正则表达式约束
 * 
 * @param value - 要验证的值
 * @param pattern - 正则表达式模式字符串
 * @returns true 如果值匹配正则表达式，false 否则
 */
export function validateRegexConstraint(value: unknown, pattern: string): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  try {
    const regex = new RegExp(pattern);
    return regex.test(value);
  } catch {
    // 无效的正则表达式模式，返回 false
    return false;
  }
}

/**
 * 验证单个值是否满足枚举约束
 * 
 * @param value - 要验证的值
 * @param allowedValues - 允许的值列表
 * @returns true 如果值在允许列表中，false 否则
 */
export function validateEnumConstraint(value: unknown, allowedValues: string[]): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  return allowedValues.includes(value);
}

/**
 * 验证单个值是否满足数值范围约束
 * 
 * @param value - 要验证的值
 * @param range - 范围约束 { min?: number, max?: number }
 * @returns true 如果值在范围内，false 否则
 */
export function validateRangeConstraint(value: unknown, range: RangeValue): boolean {
  if (typeof value !== 'number') {
    return false;
  }
  
  if (range.min !== undefined && value < range.min) {
    return false;
  }
  
  if (range.max !== undefined && value > range.max) {
    return false;
  }
  
  return true;
}

/**
 * 验证单个字段值是否满足所有约束条件
 * 
 * @param value - 字段值
 * @param constraints - 约束条件数组
 * @returns 违反的约束列表
 */
export function validateFieldConstraints(
  value: unknown,
  constraints: FieldConstraint[]
): FieldConstraint[] {
  const violations: FieldConstraint[] = [];
  
  for (const constraint of constraints) {
    // 跳过 ref_exists 约束（由 cross-validator 处理）
    if (constraint.type === 'ref_exists') {
      continue;
    }
    
    let isValid = true;
    
    switch (constraint.type) {
      case 'regex':
        if (typeof constraint.value === 'string') {
          isValid = validateRegexConstraint(value, constraint.value);
        }
        break;
        
      case 'enum':
        if (Array.isArray(constraint.value)) {
          isValid = validateEnumConstraint(value, constraint.value);
        }
        break;
        
      case 'range':
        if (isRangeValue(constraint.value)) {
          isValid = validateRangeConstraint(value, constraint.value);
        }
        break;
    }
    
    if (!isValid) {
      violations.push(constraint);
    }
  }
  
  return violations;
}

/**
 * 获取约束类型的中文描述
 */
function getConstraintTypeDescriptionZh(type: string): string {
  switch (type) {
    case 'regex':
      return '正则表达式';
    case 'enum':
      return '枚举值';
    case 'range':
      return '数值范围';
    default:
      return type;
  }
}

/**
 * 获取约束值的描述字符串
 */
function getConstraintValueDescription(constraint: FieldConstraint): { zh: string; en: string } {
  switch (constraint.type) {
    case 'regex':
      return {
        zh: `正则表达式: ${constraint.value}`,
        en: `regex pattern: ${constraint.value}`,
      };
    case 'enum':
      if (Array.isArray(constraint.value)) {
        const values = constraint.value.join(', ');
        return {
          zh: `允许的值: [${values}]`,
          en: `allowed values: [${values}]`,
        };
      }
      return { zh: '', en: '' };
    case 'range':
      if (isRangeValue(constraint.value)) {
        const parts: string[] = [];
        const partsEn: string[] = [];
        if (constraint.value.min !== undefined) {
          parts.push(`最小值: ${constraint.value.min}`);
          partsEn.push(`min: ${constraint.value.min}`);
        }
        if (constraint.value.max !== undefined) {
          parts.push(`最大值: ${constraint.value.max}`);
          partsEn.push(`max: ${constraint.value.max}`);
        }
        return {
          zh: parts.join(', '),
          en: partsEn.join(', '),
        };
      }
      return { zh: '', en: '' };
    default:
      return { zh: '', en: '' };
  }
}

/**
 * 获取约束对应的错误码
 */
function getConstraintErrorCode(constraint: FieldConstraint): string {
  // 优先使用约束定义中的错误码
  if (constraint.errorCode) {
    return constraint.errorCode;
  }
  
  // 否则使用默认错误码
  switch (constraint.type) {
    case 'regex':
      return ErrorCodes.CONSTRAINT_REGEX;
    case 'enum':
      return ErrorCodes.CONSTRAINT_ENUM;
    case 'range':
      return ErrorCodes.CONSTRAINT_RANGE;
    default:
      return 'ERR_CONSTRAINT_UNKNOWN';
  }
}

/**
 * 验证 Submission 中所有字段的约束条件
 * 
 * @param submission - 提交的数据对象
 * @param template - 模板定义
 * @param filePath - 文件路径（用于错误报告）
 * @returns ValidationResult 包含约束违反的错误信息
 * 
 * **Validates: Requirements 3.5**
 */
export function validateConstraints(
  submission: Record<string, unknown>,
  template: TemplateDefinition,
  filePath: string
): ValidationResult {
  const hardErrors: ValidationError[] = [];
  const softWarnings: ValidationWarning[] = [];

  // 合并必填和选填字段定义
  const allFields = [...template.required, ...template.optional];

  for (const fieldDef of allFields) {
    const fieldName = fieldDef.name;

    // 只验证存在的字段
    if (!(fieldName in submission)) {
      continue;
    }

    const value = submission[fieldName];

    // 跳过 null 和 undefined（由必填项验证器处理）
    if (value === null || value === undefined) {
      continue;
    }

    // 如果字段没有约束条件，跳过
    if (!fieldDef.constraints || fieldDef.constraints.length === 0) {
      continue;
    }

    // 验证约束条件
    const violations = validateFieldConstraints(value, fieldDef.constraints);

    // 为每个违反的约束生成错误
    for (const violation of violations) {
      const errorCode = getConstraintErrorCode(violation);
      const constraintDesc = getConstraintValueDescription(violation);
      const constraintTypeZh = getConstraintTypeDescriptionZh(violation.type);

      // 优先使用约束定义中的错误消息
      let messageZh: string;
      let messageEn: string;

      if (violation.errorMessage) {
        messageZh = violation.errorMessage.zh;
        messageEn = violation.errorMessage.en || violation.errorMessage.zh;
      } else {
        messageZh = `字段 "${fieldName}" 不满足${constraintTypeZh}约束: ${constraintDesc.zh}`;
        messageEn = `Field "${fieldName}" violates ${violation.type} constraint: ${constraintDesc.en}`;
      }

      hardErrors.push({
        code: errorCode,
        message: {
          zh: messageZh,
          en: messageEn,
        },
        location: {
          file: filePath,
          field: fieldName,
        },
      });
    }
  }

  return {
    valid: hardErrors.length === 0,
    hardErrors,
    softWarnings,
  };
}

/**
 * 获取 Submission 中违反约束的字段列表
 * 
 * @param submission - 提交的数据对象
 * @param template - 模板定义
 * @returns 违反约束的字段信息数组
 */
export function getConstraintViolations(
  submission: Record<string, unknown>,
  template: TemplateDefinition
): Array<{ field: string; constraintType: string; constraint: FieldConstraint }> {
  const violations: Array<{ field: string; constraintType: string; constraint: FieldConstraint }> = [];

  // 合并必填和选填字段定义
  const allFields = [...template.required, ...template.optional];

  for (const fieldDef of allFields) {
    const fieldName = fieldDef.name;

    // 只验证存在的字段
    if (!(fieldName in submission)) {
      continue;
    }

    const value = submission[fieldName];

    // 跳过 null 和 undefined
    if (value === null || value === undefined) {
      continue;
    }

    // 如果字段没有约束条件，跳过
    if (!fieldDef.constraints || fieldDef.constraints.length === 0) {
      continue;
    }

    // 验证约束条件
    const fieldViolations = validateFieldConstraints(value, fieldDef.constraints);

    for (const violation of fieldViolations) {
      violations.push({
        field: fieldName,
        constraintType: violation.type,
        constraint: violation,
      });
    }
  }

  return violations;
}

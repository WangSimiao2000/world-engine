/**
 * Field Type Validator
 * 字段类型验证器 - 验证字段值类型与模板定义匹配
 */

import type {
  FieldType,
  TemplateDefinition,
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from '../types/index.js';
import { ErrorCodes, isBilingual, isVersioning } from '../types/index.js';

/**
 * 获取值的实际类型描述
 * 
 * @param value - 要检查的值
 * @returns 类型描述字符串
 */
export function getActualType(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (value === undefined) {
    return 'undefined';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  return typeof value;
}

/**
 * 验证单个字段值是否匹配期望类型
 * 
 * @param value - 字段值
 * @param expectedType - 期望的字段类型
 * @returns true 如果类型匹配，false 否则
 */
export function validateFieldType(value: unknown, expectedType: FieldType): boolean {
  // null 和 undefined 不匹配任何类型（应由必填项验证器处理）
  if (value === null || value === undefined) {
    return false;
  }

  switch (expectedType) {
    case 'string':
      return typeof value === 'string';

    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);

    case 'boolean':
      return typeof value === 'boolean';

    case 'epoch_ref':
      // 纪元引用是字符串（格式验证在其他地方进行）
      return typeof value === 'string';

    case 'entity_ref':
      // 实体引用是字符串（格式验证在其他地方进行）
      return typeof value === 'string';

    case 'bilingual':
      // 双语字段：对象，必须有 zh 字符串，可选 en 字符串
      return isBilingual(value);

    case 'versioning':
      // 版本信息：对象，包含 canon (boolean), source (string), priority ('official' | 'secondary')
      return isVersioning(value);

    default:
      // 处理 array<T> 类型
      if (expectedType.startsWith('array<') && expectedType.endsWith('>')) {
        if (!Array.isArray(value)) {
          return false;
        }
        // 提取内部类型
        const innerType = expectedType.slice(6, -1) as FieldType;
        // 验证数组中的每个元素
        return value.every(item => validateFieldType(item, innerType));
      }
      // 未知类型，返回 false
      return false;
  }
}

/**
 * 获取类型的中文描述
 */
function getTypeDescriptionZh(type: FieldType): string {
  switch (type) {
    case 'string':
      return '字符串';
    case 'integer':
      return '整数';
    case 'boolean':
      return '布尔值';
    case 'epoch_ref':
      return '纪元引用（字符串）';
    case 'entity_ref':
      return '实体引用（字符串）';
    case 'bilingual':
      return '双语对象 { zh: string, en?: string }';
    case 'versioning':
      return '版本信息对象 { canon: boolean, source: string, priority: "official" | "secondary" }';
    default:
      if (type.startsWith('array<')) {
        const innerType = type.slice(6, -1) as FieldType;
        return `${getTypeDescriptionZh(innerType)}数组`;
      }
      return type;
  }
}

/**
 * 获取实际值类型的中文描述
 */
function getActualTypeDescriptionZh(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (value === undefined) {
    return 'undefined';
  }
  if (Array.isArray(value)) {
    return '数组';
  }
  switch (typeof value) {
    case 'string':
      return '字符串';
    case 'number':
      return Number.isInteger(value) ? '整数' : '浮点数';
    case 'boolean':
      return '布尔值';
    case 'object':
      return '对象';
    default:
      return typeof value;
  }
}

/**
 * 验证 Submission 中所有字段的类型
 * 
 * @param submission - 提交的数据对象
 * @param template - 模板定义
 * @param filePath - 文件路径（用于错误报告）
 * @returns ValidationResult 包含类型错误的信息
 * 
 * **Validates: Requirements 3.4**
 */
export function validateFieldTypes(
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
    const expectedType = fieldDef.type;

    // 只验证存在的字段（缺失字段由必填项验证器处理）
    if (!(fieldName in submission)) {
      continue;
    }

    const value = submission[fieldName];

    // 跳过 null 和 undefined（由必填项验证器处理）
    if (value === null || value === undefined) {
      continue;
    }

    // 验证类型
    if (!validateFieldType(value, expectedType)) {
      const actualType = getActualType(value);
      const actualTypeZh = getActualTypeDescriptionZh(value);
      const expectedTypeZh = getTypeDescriptionZh(expectedType);

      hardErrors.push({
        code: ErrorCodes.FIELD_TYPE,
        message: {
          zh: `字段 "${fieldName}" 类型错误: 期望 ${expectedTypeZh}, 实际为 ${actualTypeZh}`,
          en: `Field "${fieldName}" type mismatch: expected ${expectedType}, got ${actualType}`,
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
 * 获取 Submission 中类型不匹配的字段列表
 * 
 * @param submission - 提交的数据对象
 * @param template - 模板定义
 * @returns 类型不匹配的字段信息数组
 */
export function getTypeMismatchedFields(
  submission: Record<string, unknown>,
  template: TemplateDefinition
): Array<{ field: string; expected: FieldType; actual: string }> {
  const mismatched: Array<{ field: string; expected: FieldType; actual: string }> = [];

  // 合并必填和选填字段定义
  const allFields = [...template.required, ...template.optional];

  for (const fieldDef of allFields) {
    const fieldName = fieldDef.name;
    const expectedType = fieldDef.type;

    // 只验证存在的字段
    if (!(fieldName in submission)) {
      continue;
    }

    const value = submission[fieldName];

    // 跳过 null 和 undefined
    if (value === null || value === undefined) {
      continue;
    }

    // 验证类型
    if (!validateFieldType(value, expectedType)) {
      mismatched.push({
        field: fieldName,
        expected: expectedType,
        actual: getActualType(value),
      });
    }
  }

  return mismatched;
}

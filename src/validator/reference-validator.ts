/**
 * Reference Validator
 * 引用验证器 - 负责验证实体引用和纪元引用的存在性
 */

import type {
  Submission,
  Registry,
  EpochIndex,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  TemplateDefinition,
  FieldDefinition,
} from '../types/index.js';
import { ErrorCodes, WarningCodes } from '../types/index.js';

/**
 * 引用验证选项
 */
export interface ReferenceValidationOptions {
  /** 是否为正史模式（true=严格验证，false=放宽验证） */
  isCanon: boolean;
  /** 文件路径（用于错误报告） */
  filePath: string;
}

/**
 * 引用验证器接口
 */
export interface ReferenceValidator {
  /**
   * 验证实体引用存在性
   * @param submission 提交文件
   * @param fieldName 字段名
   * @param refId 引用的实体 ID
   * @param registry 注册表
   * @param currentBatch 当前批次的提交文件
   * @param options 验证选项
   */
  validateEntityRef(
    submission: Submission,
    fieldName: string,
    refId: string,
    registry: Registry,
    currentBatch: Submission[],
    options: ReferenceValidationOptions
  ): ValidationResult;

  /**
   * 验证纪元引用存在性
   * @param submission 提交文件
   * @param fieldName 字段名
   * @param epochId 引用的纪元 ID
   * @param epochIndex 纪元索引
   * @param options 验证选项
   */
  validateEpochRef(
    submission: Submission,
    fieldName: string,
    epochId: string,
    epochIndex: EpochIndex,
    options: ReferenceValidationOptions
  ): ValidationResult;

  /**
   * 验证提交文件中所有引用字段
   * @param submission 提交文件
   * @param template 模板定义
   * @param registry 注册表
   * @param currentBatch 当前批次的提交文件
   * @param epochIndex 纪元索引
   * @param options 验证选项
   */
  validateAllReferences(
    submission: Submission,
    template: TemplateDefinition,
    registry: Registry,
    currentBatch: Submission[],
    epochIndex: EpochIndex,
    options: ReferenceValidationOptions
  ): ValidationResult;
}

/**
 * 创建引用验证器实例
 */
export function createReferenceValidator(): ReferenceValidator {
  return new ReferenceValidatorImpl();
}

/**
 * 引用验证器实现
 */
class ReferenceValidatorImpl implements ReferenceValidator {
  /**
   * 验证实体引用存在性
   */
  validateEntityRef(
    _submission: Submission,
    fieldName: string,
    refId: string,
    registry: Registry,
    currentBatch: Submission[],
    options: ReferenceValidationOptions
  ): ValidationResult {
    const hardErrors: ValidationError[] = [];
    const softWarnings: ValidationWarning[] = [];

    // 检查引用是否存在于 Registry
    const existsInRegistry = registry.entities.has(refId);

    // 检查引用是否存在于当前批次
    const existsInBatch = currentBatch.some((s) => s.id === refId);

    const exists = existsInRegistry || existsInBatch;

    if (!exists) {
      if (options.isCanon) {
        // 正史模式：返回硬错误
        hardErrors.push({
          code: ErrorCodes.REF_MISSING,
          message: {
            zh: `引用的实体 ID "${refId}" 不存在`,
            en: `Referenced entity ID "${refId}" does not exist`,
          },
          location: {
            file: options.filePath,
            field: fieldName,
          },
          relatedEntities: [refId],
        });
      } else {
        // 野史模式：返回软警告
        softWarnings.push({
          code: WarningCodes.REF_MISSING,
          message: {
            zh: `引用的实体 ID "${refId}" 不存在（野史模式下允许）`,
            en: `Referenced entity ID "${refId}" does not exist (allowed in non-canon mode)`,
          },
          location: {
            file: options.filePath,
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
   * 验证纪元引用存在性
   */
  validateEpochRef(
    _submission: Submission,
    fieldName: string,
    epochId: string,
    epochIndex: EpochIndex,
    options: ReferenceValidationOptions
  ): ValidationResult {
    const hardErrors: ValidationError[] = [];
    const softWarnings: ValidationWarning[] = [];

    // 检查纪元是否存在于纪元索引
    const exists = epochIndex.epochs.some((epoch) => epoch.id === epochId);

    if (!exists) {
      if (options.isCanon) {
        // 正史模式：返回硬错误
        hardErrors.push({
          code: ErrorCodes.REF_EPOCH,
          message: {
            zh: `引用的纪元 ID "${epochId}" 不存在`,
            en: `Referenced epoch ID "${epochId}" does not exist`,
          },
          location: {
            file: options.filePath,
            field: fieldName,
          },
          relatedEntities: [epochId],
        });
      } else {
        // 野史模式：返回软警告（纪元引用也放宽）
        softWarnings.push({
          code: WarningCodes.REF_MISSING,
          message: {
            zh: `引用的纪元 ID "${epochId}" 不存在（野史模式下允许）`,
            en: `Referenced epoch ID "${epochId}" does not exist (allowed in non-canon mode)`,
          },
          location: {
            file: options.filePath,
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
   * 验证提交文件中所有引用字段
   */
  validateAllReferences(
    submission: Submission,
    template: TemplateDefinition,
    registry: Registry,
    currentBatch: Submission[],
    epochIndex: EpochIndex,
    options: ReferenceValidationOptions
  ): ValidationResult {
    const hardErrors: ValidationError[] = [];
    const softWarnings: ValidationWarning[] = [];

    // 合并 required 和 optional 字段定义
    const allFields = [...template.required, ...template.optional];

    // 遍历所有字段定义
    for (const fieldDef of allFields) {
      const fieldValue = submission[fieldDef.name];

      // 跳过未填写的字段
      if (fieldValue === undefined || fieldValue === null) {
        continue;
      }

      // 处理 entity_ref 类型
      if (fieldDef.type === 'entity_ref') {
        const result = this.validateEntityRefField(
          submission,
          fieldDef,
          fieldValue,
          registry,
          currentBatch,
          options
        );
        hardErrors.push(...result.hardErrors);
        softWarnings.push(...result.softWarnings);
      }

      // 处理 epoch_ref 类型
      if (fieldDef.type === 'epoch_ref') {
        const result = this.validateEpochRefField(
          submission,
          fieldDef,
          fieldValue,
          epochIndex,
          options
        );
        hardErrors.push(...result.hardErrors);
        softWarnings.push(...result.softWarnings);
      }

      // 处理数组类型中的引用
      if (fieldDef.type.startsWith('array<')) {
        const innerType = fieldDef.type.slice(6, -1); // 提取 array<T> 中的 T
        if (innerType === 'entity_ref' || innerType === 'epoch_ref') {
          const result = this.validateArrayRefField(
            submission,
            fieldDef,
            fieldValue,
            innerType,
            registry,
            currentBatch,
            epochIndex,
            options
          );
          hardErrors.push(...result.hardErrors);
          softWarnings.push(...result.softWarnings);
        }
      }
    }

    return {
      valid: hardErrors.length === 0,
      hardErrors,
      softWarnings,
    };
  }

  /**
   * 验证单个 entity_ref 字段
   */
  private validateEntityRefField(
    _submission: Submission,
    fieldDef: FieldDefinition,
    fieldValue: unknown,
    registry: Registry,
    currentBatch: Submission[],
    options: ReferenceValidationOptions
  ): ValidationResult {
    if (typeof fieldValue !== 'string') {
      // 类型错误由类型验证器处理，这里跳过
      return { valid: true, hardErrors: [], softWarnings: [] };
    }

    // 创建一个临时 submission 对象用于验证
    const tempSubmission: Submission = { template: 'character', id: '' };
    return this.validateEntityRef(
      tempSubmission,
      fieldDef.name,
      fieldValue,
      registry,
      currentBatch,
      options
    );
  }

  /**
   * 验证单个 epoch_ref 字段
   */
  private validateEpochRefField(
    _submission: Submission,
    fieldDef: FieldDefinition,
    fieldValue: unknown,
    epochIndex: EpochIndex,
    options: ReferenceValidationOptions
  ): ValidationResult {
    if (typeof fieldValue !== 'string') {
      // 类型错误由类型验证器处理，这里跳过
      return { valid: true, hardErrors: [], softWarnings: [] };
    }

    // 创建一个临时 submission 对象用于验证
    const tempSubmission: Submission = { template: 'character', id: '' };
    return this.validateEpochRef(
      tempSubmission,
      fieldDef.name,
      fieldValue,
      epochIndex,
      options
    );
  }

  /**
   * 验证数组类型中的引用字段
   */
  private validateArrayRefField(
    submission: Submission,
    fieldDef: FieldDefinition,
    fieldValue: unknown,
    innerType: string,
    registry: Registry,
    currentBatch: Submission[],
    epochIndex: EpochIndex,
    options: ReferenceValidationOptions
  ): ValidationResult {
    const hardErrors: ValidationError[] = [];
    const softWarnings: ValidationWarning[] = [];

    if (!Array.isArray(fieldValue)) {
      // 类型错误由类型验证器处理，这里跳过
      return { valid: true, hardErrors: [], softWarnings: [] };
    }

    for (let i = 0; i < fieldValue.length; i++) {
      const item = fieldValue[i];
      if (typeof item !== 'string') {
        continue;
      }

      const fieldPath = `${fieldDef.name}[${i}]`;

      if (innerType === 'entity_ref') {
        const result = this.validateEntityRef(
          submission,
          fieldPath,
          item,
          registry,
          currentBatch,
          options
        );
        hardErrors.push(...result.hardErrors);
        softWarnings.push(...result.softWarnings);
      } else if (innerType === 'epoch_ref') {
        const result = this.validateEpochRef(
          submission,
          fieldPath,
          item,
          epochIndex,
          options
        );
        hardErrors.push(...result.hardErrors);
        softWarnings.push(...result.softWarnings);
      }
    }

    return {
      valid: hardErrors.length === 0,
      hardErrors,
      softWarnings,
    };
  }
}

/**
 * 从 Submission 中提取 canon 状态
 * @param submission 提交文件
 * @returns 是否为正史（默认为 true）
 */
export function isCanonSubmission(submission: Submission): boolean {
  const versioning = submission.versioning;
  if (versioning && typeof versioning === 'object' && 'canon' in versioning) {
    return versioning.canon === true;
  }
  // 默认为正史
  return true;
}

/**
 * 便捷函数：验证实体引用
 */
export function validateEntityRef(
  submission: Submission,
  fieldName: string,
  refId: string,
  registry: Registry,
  currentBatch: Submission[],
  options: ReferenceValidationOptions
): ValidationResult {
  const validator = createReferenceValidator();
  return validator.validateEntityRef(submission, fieldName, refId, registry, currentBatch, options);
}

/**
 * 便捷函数：验证纪元引用
 */
export function validateEpochRef(
  submission: Submission,
  fieldName: string,
  epochId: string,
  epochIndex: EpochIndex,
  options: ReferenceValidationOptions
): ValidationResult {
  const validator = createReferenceValidator();
  return validator.validateEpochRef(submission, fieldName, epochId, epochIndex, options);
}

/**
 * 便捷函数：验证所有引用
 */
export function validateAllReferences(
  submission: Submission,
  template: TemplateDefinition,
  registry: Registry,
  currentBatch: Submission[],
  epochIndex: EpochIndex,
  options: ReferenceValidationOptions
): ValidationResult {
  const validator = createReferenceValidator();
  return validator.validateAllReferences(
    submission,
    template,
    registry,
    currentBatch,
    epochIndex,
    options
  );
}

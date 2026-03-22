/**
 * Canon Validator
 * 正史/野史验证器 - 负责验证正史唯一性和野史模式下的验证放宽
 */

import type {
  Submission,
  Registry,
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from '../types/index.js';
import { ErrorCodes } from '../types/index.js';

/**
 * 正史验证选项
 */
export interface CanonValidationOptions {
  /** 文件路径（用于错误报告） */
  filePath: string;
}

/**
 * 正史验证器接口
 */
export interface CanonValidator {
  /**
   * 验证正史唯一性
   * 检查同一事件 ID 是否已存在 canon: true 版本
   * @param submission 提交文件
   * @param registry 注册表
   * @param currentBatch 当前批次的提交文件
   * @param options 验证选项
   */
  validateCanonUniqueness(
    submission: Submission,
    registry: Registry,
    currentBatch: Submission[],
    options: CanonValidationOptions
  ): ValidationResult;

  /**
   * 检查提交是否为正史
   * @param submission 提交文件
   */
  isCanon(submission: Submission): boolean;

  /**
   * 获取验证模式
   * 根据 canon 状态决定是否执行严格验证
   * @param submission 提交文件
   */
  getValidationMode(submission: Submission): 'strict' | 'relaxed';
}

/**
 * 创建正史验证器实例
 */
export function createCanonValidator(): CanonValidator {
  return new CanonValidatorImpl();
}

/**
 * 正史验证器实现
 */
class CanonValidatorImpl implements CanonValidator {
  /**
   * 验证正史唯一性
   * 检查同一事件 ID 是否已存在 canon: true 版本
   */
  validateCanonUniqueness(
    submission: Submission,
    registry: Registry,
    currentBatch: Submission[],
    options: CanonValidationOptions
  ): ValidationResult {
    const hardErrors: ValidationError[] = [];
    const softWarnings: ValidationWarning[] = [];

    // 如果当前提交不是正史，跳过验证
    if (!this.isCanon(submission)) {
      return { valid: true, hardErrors, softWarnings };
    }

    const submissionId = submission.id;

    // 检查 Registry 中是否已存在同一 ID 的正史版本
    const existingEntity = registry.entities.get(submissionId);
    if (existingEntity) {
      const existingData = existingEntity.data;
      if (this.isCanon(existingData)) {
        hardErrors.push({
          code: ErrorCodes.CANON_DUPLICATE,
          message: {
            zh: `该事件 ID "${submissionId}" 已存在正史版本，不允许重复提交正史`,
            en: `Event ID "${submissionId}" already has a canon version, duplicate canon submission is not allowed`,
          },
          location: {
            file: options.filePath,
            field: 'versioning.canon',
          },
          relatedEntities: [submissionId],
        });
      }
    }

    // 检查当前批次中是否有其他同一 ID 的正史版本
    const duplicateInBatch = currentBatch.find(
      (s) => s.id === submissionId && s !== submission && this.isCanon(s)
    );
    if (duplicateInBatch) {
      hardErrors.push({
        code: ErrorCodes.CANON_DUPLICATE,
        message: {
          zh: `当前批次中已存在事件 ID "${submissionId}" 的正史版本，不允许重复提交正史`,
          en: `Current batch already contains a canon version for event ID "${submissionId}", duplicate canon submission is not allowed`,
        },
        location: {
          file: options.filePath,
          field: 'versioning.canon',
        },
        relatedEntities: [submissionId],
      });
    }

    return {
      valid: hardErrors.length === 0,
      hardErrors,
      softWarnings,
    };
  }

  /**
   * 检查提交是否为正史
   */
  isCanon(submission: Submission): boolean {
    const versioning = submission.versioning;
    if (versioning && typeof versioning === 'object' && 'canon' in versioning) {
      return versioning.canon === true;
    }
    // 默认为正史
    return true;
  }

  /**
   * 获取验证模式
   * 根据 canon 状态决定是否执行严格验证
   */
  getValidationMode(submission: Submission): 'strict' | 'relaxed' {
    return this.isCanon(submission) ? 'strict' : 'relaxed';
  }
}

/**
 * 便捷函数：验证正史唯一性
 */
export function validateCanonUniqueness(
  submission: Submission,
  registry: Registry,
  currentBatch: Submission[],
  options: CanonValidationOptions
): ValidationResult {
  const validator = createCanonValidator();
  return validator.validateCanonUniqueness(submission, registry, currentBatch, options);
}

/**
 * 便捷函数：检查提交是否为正史
 */
export function isCanon(submission: Submission): boolean {
  const validator = createCanonValidator();
  return validator.isCanon(submission);
}

/**
 * 便捷函数：获取验证模式
 */
export function getValidationMode(submission: Submission): 'strict' | 'relaxed' {
  const validator = createCanonValidator();
  return validator.getValidationMode(submission);
}

/**
 * 判断是否应该执行严格的交叉引用验证
 * 对于 canon: false 的设定，放宽交叉引用验证
 * @param submission 提交文件
 */
export function shouldRelaxCrossReferenceValidation(submission: Submission): boolean {
  return !isCanon(submission);
}

/**
 * 判断是否应该执行严格的时间线验证
 * 对于 canon: false 的设定，仅执行格式校验，不执行严格时间线检查
 * @param submission 提交文件
 */
export function shouldRelaxTimelineValidation(submission: Submission): boolean {
  return !isCanon(submission);
}

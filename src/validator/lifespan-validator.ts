/**
 * Lifespan Validator
 * 寿命验证器 - 负责验证人物寿命与种族平均寿命的一致性
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
 * 寿命验证选项
 */
export interface LifespanValidationOptions {
  /** 是否为正史模式（true=严格验证，false=放宽验证） */
  isCanon: boolean;
  /** 文件路径（用于错误报告） */
  filePath: string;
}

/**
 * 寿命验证器接口
 */
export interface LifespanValidator {
  /**
   * 验证人物寿命是否超过种族平均寿命的 150%
   * @param submission 人物提交文件
   * @param registry 注册表
   * @param currentBatch 当前批次的提交文件
   * @param options 验证选项
   */
  validateLifespan(
    submission: Submission,
    registry: Registry,
    currentBatch: Submission[],
    options: LifespanValidationOptions
  ): ValidationResult;
}

/**
 * 创建寿命验证器实例
 */
export function createLifespanValidator(): LifespanValidator {
  return new LifespanValidatorImpl();
}

/**
 * 寿命验证器实现
 */
class LifespanValidatorImpl implements LifespanValidator {
  /**
   * 验证人物寿命是否超过种族平均寿命的 150%
   */
  validateLifespan(
    submission: Submission,
    registry: Registry,
    currentBatch: Submission[],
    options: LifespanValidationOptions
  ): ValidationResult {
    const hardErrors: ValidationError[] = [];
    const softWarnings: ValidationWarning[] = [];

    // 只验证人物类型的 Submission
    if (submission.template !== 'character') {
      return { valid: true, hardErrors, softWarnings };
    }

    // 获取人物的寿命值
    const lifespan = submission['lifespan'];
    if (typeof lifespan !== 'number' || lifespan <= 0) {
      // 寿命字段不存在或无效，跳过验证（由类型验证器处理）
      return { valid: true, hardErrors, softWarnings };
    }

    // 获取人物的种族 ID
    const raceId = submission['race'];
    if (typeof raceId !== 'string') {
      // 种族字段不存在或无效，跳过验证（由引用验证器处理）
      return { valid: true, hardErrors, softWarnings };
    }

    // 查找种族实体
    const raceEntity = this.findRaceEntity(raceId, registry, currentBatch);
    if (!raceEntity) {
      // 种族不存在，跳过验证（由引用验证器处理）
      return { valid: true, hardErrors, softWarnings };
    }

    // 获取种族的平均寿命
    const averageLifespan = raceEntity['average_lifespan'];
    if (typeof averageLifespan !== 'number' || averageLifespan <= 0) {
      // 种族平均寿命无效，跳过验证
      return { valid: true, hardErrors, softWarnings };
    }

    // 计算 150% 阈值
    const threshold = averageLifespan * 1.5;

    // 检查人物寿命是否超过阈值
    if (lifespan > threshold) {
      hardErrors.push({
        code: ErrorCodes.LIFESPAN_EXCEED,
        message: {
          zh: `人物寿命 ${lifespan} 年超过其种族平均寿命 ${averageLifespan} 年的 150%（阈值：${threshold} 年）`,
          en: `Character lifespan ${lifespan} years exceeds 150% of race's average lifespan ${averageLifespan} years (threshold: ${threshold} years)`,
        },
        location: {
          file: options.filePath,
          field: 'lifespan',
        },
        relatedEntities: [raceId],
      });
    }

    return {
      valid: hardErrors.length === 0,
      hardErrors,
      softWarnings,
    };
  }

  /**
   * 从 Registry 或当前批次中查找种族实体
   */
  private findRaceEntity(
    raceId: string,
    registry: Registry,
    currentBatch: Submission[]
  ): Submission | null {
    // 首先在 Registry 中查找
    const registeredEntity = registry.entities.get(raceId);
    if (registeredEntity && registeredEntity.category === 'race') {
      return registeredEntity.data;
    }

    // 然后在当前批次中查找
    const batchEntity = currentBatch.find(
      (s) => s.id === raceId && s.template === 'race'
    );
    if (batchEntity) {
      return batchEntity;
    }

    return null;
  }
}

/**
 * 便捷函数：验证人物寿命
 */
export function validateLifespan(
  submission: Submission,
  registry: Registry,
  currentBatch: Submission[],
  options: LifespanValidationOptions
): ValidationResult {
  const validator = createLifespanValidator();
  return validator.validateLifespan(submission, registry, currentBatch, options);
}

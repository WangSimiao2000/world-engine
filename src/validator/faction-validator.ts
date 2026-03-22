/**
 * Faction Validator
 * 势力验证器 - 负责验证同一势力名称在多个纪元下的设定不重叠
 */

import type {
  Submission,
  Registry,
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from '../types/index.js';
import { ErrorCodes, isBilingual } from '../types/index.js';

/**
 * 势力验证选项
 */
export interface FactionValidationOptions {
  /** 文件路径（用于错误报告） */
  filePath: string;
}

/**
 * 势力验证器接口
 */
export interface FactionValidator {
  /**
   * 验证同一势力名称在多个纪元下的设定不重叠
   * @param submission 势力提交文件
   * @param registry 注册表
   * @param currentBatch 当前批次的提交文件
   * @param options 验证选项
   */
  validateFactionEpochOverlap(
    submission: Submission,
    registry: Registry,
    currentBatch: Submission[],
    options: FactionValidationOptions
  ): ValidationResult;
}

/**
 * 创建势力验证器实例
 */
export function createFactionValidator(): FactionValidator {
  return new FactionValidatorImpl();
}

/**
 * 获取势力名称的中文值（用于比较）
 */
function getFactionNameZh(submission: Submission): string | null {
  const name = submission['name'];
  if (isBilingual(name)) {
    return name.zh;
  }
  return null;
}

/**
 * 势力验证器实现
 */
class FactionValidatorImpl implements FactionValidator {
  /**
   * 验证同一势力名称在多个纪元下的设定不重叠
   */
  validateFactionEpochOverlap(
    submission: Submission,
    registry: Registry,
    currentBatch: Submission[],
    options: FactionValidationOptions
  ): ValidationResult {
    const hardErrors: ValidationError[] = [];
    const softWarnings: ValidationWarning[] = [];

    // 只验证势力类型的 Submission
    if (submission.template !== 'faction') {
      return { valid: true, hardErrors, softWarnings };
    }

    // 获取势力名称
    const factionNameZh = getFactionNameZh(submission);
    if (!factionNameZh) {
      // 名称字段不存在或无效，跳过验证（由类型验证器处理）
      return { valid: true, hardErrors, softWarnings };
    }

    // 获取势力的纪元 ID
    const epoch = submission['epoch'];
    if (typeof epoch !== 'string') {
      // 纪元字段不存在或无效，跳过验证（由引用验证器处理）
      return { valid: true, hardErrors, softWarnings };
    }

    // 查找所有同名势力
    const sameFactions = this.findSameNameFactions(
      factionNameZh,
      submission.id,
      registry,
      currentBatch
    );

    // 检查是否有纪元重叠
    for (const existingFaction of sameFactions) {
      const existingEpoch = existingFaction['epoch'];
      if (typeof existingEpoch === 'string' && existingEpoch === epoch) {
        hardErrors.push({
          code: ErrorCodes.FACTION_EPOCH_OVERLAP,
          message: {
            zh: `势力 "${factionNameZh}" 在纪元 "${epoch}" 下已存在设定（ID: ${existingFaction.id}），同一势力在同一纪元下不能有多份设定`,
            en: `Faction "${factionNameZh}" already has a setting in epoch "${epoch}" (ID: ${existingFaction.id}), same faction cannot have multiple settings in the same epoch`,
          },
          location: {
            file: options.filePath,
            field: 'epoch',
          },
          relatedEntities: [existingFaction.id],
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
   * 从 Registry 和当前批次中查找同名势力（排除当前提交）
   */
  private findSameNameFactions(
    factionNameZh: string,
    currentId: string,
    registry: Registry,
    currentBatch: Submission[]
  ): Submission[] {
    const sameFactions: Submission[] = [];

    // 在 Registry 中查找
    for (const [id, entity] of registry.entities) {
      if (entity.category === 'faction' && id !== currentId) {
        const nameZh = getFactionNameZh(entity.data);
        if (nameZh === factionNameZh) {
          sameFactions.push(entity.data);
        }
      }
    }

    // 在当前批次中查找
    for (const submission of currentBatch) {
      if (
        submission.template === 'faction' &&
        submission.id !== currentId
      ) {
        const nameZh = getFactionNameZh(submission);
        if (nameZh === factionNameZh) {
          sameFactions.push(submission);
        }
      }
    }

    return sameFactions;
  }
}

/**
 * 便捷函数：验证势力纪元重叠
 */
export function validateFactionEpochOverlap(
  submission: Submission,
  registry: Registry,
  currentBatch: Submission[],
  options: FactionValidationOptions
): ValidationResult {
  const validator = createFactionValidator();
  return validator.validateFactionEpochOverlap(
    submission,
    registry,
    currentBatch,
    options
  );
}

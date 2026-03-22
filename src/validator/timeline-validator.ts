/**
 * Timeline Validator
 * 时间线验证器 - 负责验证时间顺序和生命周期一致性
 */

import type {
  Submission,
  Registry,
  EpochIndex,
  TimePoint,
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from '../types/index.js';
import { ErrorCodes, WarningCodes } from '../types/index.js';

/**
 * 时间线验证选项
 */
export interface TimelineValidationOptions {
  /** 是否为正史模式（true=严格验证，false=放宽验证） */
  isCanon: boolean;
  /** 文件路径（用于错误报告） */
  filePath: string;
}

/**
 * 时间线验证器接口
 */
export interface TimelineValidator {
  /**
   * 比较两个时间点
   * @returns 负数表示 a 早于 b，正数表示 a 晚于 b，0 表示相同
   */
  compareTimePoints(a: TimePoint, b: TimePoint, epochIndex: EpochIndex): number;

  /**
   * 计算两个时间点之间的年份差
   */
  calculateYearDifference(start: TimePoint, end: TimePoint, epochIndex: EpochIndex): number;

  /**
   * 验证人物生死时间顺序
   */
  validateLifecycleOrder(submission: Submission, epochIndex: EpochIndex, options: TimelineValidationOptions): ValidationResult;

  /**
   * 验证人物寿命计算一致性
   */
  validateLifespanConsistency(submission: Submission, epochIndex: EpochIndex, options: TimelineValidationOptions): ValidationResult;

  /**
   * 验证历史事件时间顺序
   */
  validateEventTimeOrder(submission: Submission, epochIndex: EpochIndex, options: TimelineValidationOptions): ValidationResult;

  /**
   * 验证历史事件参与人物生命周期
   */
  validateEventParticipants(
    submission: Submission,
    registry: Registry,
    currentBatch: Submission[],
    epochIndex: EpochIndex,
    options: TimelineValidationOptions
  ): ValidationResult;
}

/**
 * 创建时间线验证器实例
 */
export function createTimelineValidator(): TimelineValidator {
  return new TimelineValidatorImpl();
}

/**
 * 时间线验证器实现
 */
class TimelineValidatorImpl implements TimelineValidator {
  /**
   * 比较两个时间点
   * @returns 负数表示 a 早于 b，正数表示 a 晚于 b，0 表示相同
   */
  compareTimePoints(a: TimePoint, b: TimePoint, epochIndex: EpochIndex): number {
    const epochA = epochIndex.epochs.find((e) => e.id === a.epoch);
    const epochB = epochIndex.epochs.find((e) => e.id === b.epoch);

    // 如果找不到纪元，返回 0（无法比较）
    if (!epochA || !epochB) {
      return 0;
    }

    // 首先比较纪元的 order 值
    if (epochA.order !== epochB.order) {
      return epochA.order - epochB.order;
    }

    // 若纪元相同，则比较年份值
    return a.year - b.year;
  }

  /**
   * 计算两个时间点之间的年份差
   * 跨纪元年份差计算需累加中间纪元的 duration
   */
  calculateYearDifference(start: TimePoint, end: TimePoint, epochIndex: EpochIndex): number {
    const startEpoch = epochIndex.epochs.find((e) => e.id === start.epoch);
    const endEpoch = epochIndex.epochs.find((e) => e.id === end.epoch);

    // 如果找不到纪元，返回 0
    if (!startEpoch || !endEpoch) {
      return 0;
    }

    // 如果在同一纪元
    if (startEpoch.id === endEpoch.id) {
      return end.year - start.year;
    }

    // 跨纪元计算
    let totalYears = 0;

    // 按 order 排序纪元
    const sortedEpochs = [...epochIndex.epochs].sort((a, b) => a.order - b.order);

    // 找到起始和结束纪元的索引
    const startIndex = sortedEpochs.findIndex((e) => e.id === startEpoch.id);
    const endIndex = sortedEpochs.findIndex((e) => e.id === endEpoch.id);

    if (startIndex === -1 || endIndex === -1) {
      return 0;
    }

    // 计算从起始年份到起始纪元结束的年数
    const startEpochData = sortedEpochs[startIndex];
    if (startEpochData) {
      totalYears += startEpochData.duration - start.year;
    }

    // 累加中间纪元的 duration
    for (let i = startIndex + 1; i < endIndex; i++) {
      const midEpoch = sortedEpochs[i];
      if (midEpoch) {
        totalYears += midEpoch.duration;
      }
    }

    // 加上结束纪元的年份
    totalYears += end.year;

    return totalYears;
  }

  /**
   * 验证人物生死时间顺序
   * 死亡时间应晚于出生时间
   */
  validateLifecycleOrder(
    submission: Submission,
    epochIndex: EpochIndex,
    options: TimelineValidationOptions
  ): ValidationResult {
    const hardErrors: ValidationError[] = [];
    const softWarnings: ValidationWarning[] = [];

    // 只验证人物类型的 Submission
    if (submission.template !== 'character') {
      return { valid: true, hardErrors, softWarnings };
    }

    // 获取出生时间
    const birthEpoch = submission['birth_epoch'];
    const birthYear = submission['birth_year'];

    // 获取死亡时间
    const deathEpoch = submission['death_epoch'];
    const deathYear = submission['death_year'];

    // 如果没有死亡信息，跳过验证（角色仍存活）
    if (deathEpoch === undefined || deathYear === undefined) {
      return { valid: true, hardErrors, softWarnings };
    }

    // 如果出生信息不完整，跳过验证
    if (typeof birthEpoch !== 'string' || typeof birthYear !== 'number') {
      return { valid: true, hardErrors, softWarnings };
    }

    // 如果死亡信息类型不正确，跳过验证
    if (typeof deathEpoch !== 'string' || typeof deathYear !== 'number') {
      return { valid: true, hardErrors, softWarnings };
    }

    const birthTime: TimePoint = { epoch: birthEpoch, year: birthYear };
    const deathTime: TimePoint = { epoch: deathEpoch, year: deathYear };

    // 比较时间点
    const comparison = this.compareTimePoints(birthTime, deathTime, epochIndex);

    // 如果死亡时间早于或等于出生时间，返回错误
    if (comparison >= 0) {
      hardErrors.push({
        code: ErrorCodes.TIME_ORDER,
        message: {
          zh: `人物死亡时间（${deathEpoch}/${deathYear}）早于或等于出生时间（${birthEpoch}/${birthYear}）`,
          en: `Character death time (${deathEpoch}/${deathYear}) is before or equal to birth time (${birthEpoch}/${birthYear})`,
        },
        location: {
          file: options.filePath,
          field: 'death_epoch/death_year',
        },
      });
    }

    return {
      valid: hardErrors.length === 0,
      hardErrors,
      softWarnings,
    };
  }

  /**
   * 验证人物寿命计算一致性
   * 计算实际寿命与 lifespan 字段值相差不超过 ±5 年
   */
  validateLifespanConsistency(
    submission: Submission,
    epochIndex: EpochIndex,
    options: TimelineValidationOptions
  ): ValidationResult {
    const hardErrors: ValidationError[] = [];
    const softWarnings: ValidationWarning[] = [];

    // 只验证人物类型的 Submission
    if (submission.template !== 'character') {
      return { valid: true, hardErrors, softWarnings };
    }

    // 获取出生时间
    const birthEpoch = submission['birth_epoch'];
    const birthYear = submission['birth_year'];

    // 获取死亡时间
    const deathEpoch = submission['death_epoch'];
    const deathYear = submission['death_year'];

    // 获取声明的寿命
    const declaredLifespan = submission['lifespan'];

    // 如果没有死亡信息或寿命字段，跳过验证
    if (
      deathEpoch === undefined ||
      deathYear === undefined ||
      declaredLifespan === undefined
    ) {
      return { valid: true, hardErrors, softWarnings };
    }

    // 类型检查
    if (
      typeof birthEpoch !== 'string' ||
      typeof birthYear !== 'number' ||
      typeof deathEpoch !== 'string' ||
      typeof deathYear !== 'number' ||
      typeof declaredLifespan !== 'number'
    ) {
      return { valid: true, hardErrors, softWarnings };
    }

    const birthTime: TimePoint = { epoch: birthEpoch, year: birthYear };
    const deathTime: TimePoint = { epoch: deathEpoch, year: deathYear };

    // 计算实际寿命
    const calculatedLifespan = this.calculateYearDifference(birthTime, deathTime, epochIndex);

    // 检查误差是否在 ±5 年内
    const difference = Math.abs(calculatedLifespan - declaredLifespan);
    const tolerance = 5;

    if (difference > tolerance) {
      hardErrors.push({
        code: ErrorCodes.LIFESPAN_MISMATCH,
        message: {
          zh: `人物声明寿命 ${declaredLifespan} 年与计算寿命 ${calculatedLifespan} 年相差 ${difference} 年，超过允许误差 ±${tolerance} 年`,
          en: `Character declared lifespan ${declaredLifespan} years differs from calculated lifespan ${calculatedLifespan} years by ${difference} years, exceeding tolerance of ±${tolerance} years`,
        },
        location: {
          file: options.filePath,
          field: 'lifespan',
        },
      });
    }

    return {
      valid: hardErrors.length === 0,
      hardErrors,
      softWarnings,
    };
  }

  /**
   * 验证历史事件时间顺序
   * 结束时间应晚于起始时间
   */
  validateEventTimeOrder(
    submission: Submission,
    epochIndex: EpochIndex,
    options: TimelineValidationOptions
  ): ValidationResult {
    const hardErrors: ValidationError[] = [];
    const softWarnings: ValidationWarning[] = [];

    // 只验证历史事件类型的 Submission
    if (submission.template !== 'history') {
      return { valid: true, hardErrors, softWarnings };
    }

    // 获取起始时间
    const startEpoch = submission['start_epoch'];
    const startYear = submission['start_year'];

    // 获取结束时间
    const endEpoch = submission['end_epoch'];
    const endYear = submission['end_year'];

    // 如果没有结束时间，跳过验证（瞬时事件）
    if (endEpoch === undefined || endYear === undefined) {
      return { valid: true, hardErrors, softWarnings };
    }

    // 类型检查
    if (
      typeof startEpoch !== 'string' ||
      typeof startYear !== 'number' ||
      typeof endEpoch !== 'string' ||
      typeof endYear !== 'number'
    ) {
      return { valid: true, hardErrors, softWarnings };
    }

    const startTime: TimePoint = { epoch: startEpoch, year: startYear };
    const endTime: TimePoint = { epoch: endEpoch, year: endYear };

    // 比较时间点
    const comparison = this.compareTimePoints(startTime, endTime, epochIndex);

    // 如果结束时间早于或等于起始时间，返回错误
    if (comparison >= 0) {
      hardErrors.push({
        code: ErrorCodes.TIME_ORDER,
        message: {
          zh: `历史事件结束时间（${endEpoch}/${endYear}）早于或等于起始时间（${startEpoch}/${startYear}）`,
          en: `History event end time (${endEpoch}/${endYear}) is before or equal to start time (${startEpoch}/${startYear})`,
        },
        location: {
          file: options.filePath,
          field: 'end_epoch/end_year',
        },
      });
    }

    return {
      valid: hardErrors.length === 0,
      hardErrors,
      softWarnings,
    };
  }

  /**
   * 验证历史事件参与人物生命周期
   * 事件的时间范围应落在每个参与人物的生命周期内
   */
  validateEventParticipants(
    submission: Submission,
    registry: Registry,
    currentBatch: Submission[],
    epochIndex: EpochIndex,
    options: TimelineValidationOptions
  ): ValidationResult {
    const hardErrors: ValidationError[] = [];
    const softWarnings: ValidationWarning[] = [];

    // 只验证历史事件类型的 Submission
    if (submission.template !== 'history') {
      return { valid: true, hardErrors, softWarnings };
    }

    // 获取事件时间范围
    const startEpoch = submission['start_epoch'];
    const startYear = submission['start_year'];
    const endEpoch = submission['end_epoch'];
    const endYear = submission['end_year'];

    // 类型检查起始时间
    if (typeof startEpoch !== 'string' || typeof startYear !== 'number') {
      return { valid: true, hardErrors, softWarnings };
    }

    const eventStart: TimePoint = { epoch: startEpoch, year: startYear };

    // 事件结束时间（如果没有则使用起始时间，表示瞬时事件）
    let eventEnd: TimePoint;
    if (typeof endEpoch === 'string' && typeof endYear === 'number') {
      eventEnd = { epoch: endEpoch, year: endYear };
    } else {
      eventEnd = eventStart;
    }

    // 获取参与人物列表
    const participants = submission['participants'];
    if (!Array.isArray(participants)) {
      return { valid: true, hardErrors, softWarnings };
    }

    // 验证每个参与人物
    for (let i = 0; i < participants.length; i++) {
      const participantId = participants[i];
      if (typeof participantId !== 'string') {
        continue;
      }

      // 查找人物实体
      const character = this.findCharacterEntity(participantId, registry, currentBatch);
      if (!character) {
        // 人物不存在，由引用验证器处理
        continue;
      }

      // 获取人物生命周期
      const charBirthEpoch = character['birth_epoch'];
      const charBirthYear = character['birth_year'];
      const charDeathEpoch = character['death_epoch'];
      const charDeathYear = character['death_year'];

      // 类型检查出生时间
      if (typeof charBirthEpoch !== 'string' || typeof charBirthYear !== 'number') {
        continue;
      }

      const charBirth: TimePoint = { epoch: charBirthEpoch, year: charBirthYear };

      // 检查事件起始时间是否在人物出生之后
      const startComparison = this.compareTimePoints(eventStart, charBirth, epochIndex);
      if (startComparison < 0) {
        // 事件起始时间早于人物出生时间
        this.addEventLifetimeError(
          hardErrors,
          softWarnings,
          options,
          participantId,
          `事件起始时间（${startEpoch}/${startYear}）早于人物 "${participantId}" 出生时间（${charBirthEpoch}/${charBirthYear}）`,
          `Event start time (${startEpoch}/${startYear}) is before character "${participantId}" birth time (${charBirthEpoch}/${charBirthYear})`,
          `participants[${i}]`
        );
        continue;
      }

      // 如果人物有死亡时间，检查事件结束时间是否在人物死亡之前
      if (typeof charDeathEpoch === 'string' && typeof charDeathYear === 'number') {
        const charDeath: TimePoint = { epoch: charDeathEpoch, year: charDeathYear };
        const endComparison = this.compareTimePoints(eventEnd, charDeath, epochIndex);
        if (endComparison > 0) {
          // 事件结束时间晚于人物死亡时间
          this.addEventLifetimeError(
            hardErrors,
            softWarnings,
            options,
            participantId,
            `事件结束时间（${endEpoch || startEpoch}/${endYear || startYear}）晚于人物 "${participantId}" 死亡时间（${charDeathEpoch}/${charDeathYear}）`,
            `Event end time (${endEpoch || startEpoch}/${endYear || startYear}) is after character "${participantId}" death time (${charDeathEpoch}/${charDeathYear})`,
            `participants[${i}]`
          );
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
   * 添加事件生命周期错误
   */
  private addEventLifetimeError(
    hardErrors: ValidationError[],
    softWarnings: ValidationWarning[],
    options: TimelineValidationOptions,
    participantId: string,
    zhMessage: string,
    enMessage: string,
    field: string
  ): void {
    if (options.isCanon) {
      hardErrors.push({
        code: ErrorCodes.EVENT_LIFETIME,
        message: {
          zh: zhMessage,
          en: enMessage,
        },
        location: {
          file: options.filePath,
          field,
        },
        relatedEntities: [participantId],
      });
    } else {
      softWarnings.push({
        code: WarningCodes.EVENT_LIFETIME,
        message: {
          zh: `${zhMessage}（野史模式下允许）`,
          en: `${enMessage} (allowed in non-canon mode)`,
        },
        location: {
          file: options.filePath,
          field,
        },
      });
    }
  }

  /**
   * 从 Registry 或当前批次中查找人物实体
   */
  private findCharacterEntity(
    characterId: string,
    registry: Registry,
    currentBatch: Submission[]
  ): Submission | null {
    // 首先在 Registry 中查找
    const registeredEntity = registry.entities.get(characterId);
    if (registeredEntity && registeredEntity.category === 'character') {
      return registeredEntity.data;
    }

    // 然后在当前批次中查找
    const batchEntity = currentBatch.find(
      (s) => s.id === characterId && s.template === 'character'
    );
    if (batchEntity) {
      return batchEntity;
    }

    return null;
  }
}

/**
 * 便捷函数：比较两个时间点
 */
export function compareTimePoints(a: TimePoint, b: TimePoint, epochIndex: EpochIndex): number {
  const validator = createTimelineValidator();
  return validator.compareTimePoints(a, b, epochIndex);
}

/**
 * 便捷函数：计算两个时间点之间的年份差
 */
export function calculateYearDifference(
  start: TimePoint,
  end: TimePoint,
  epochIndex: EpochIndex
): number {
  const validator = createTimelineValidator();
  return validator.calculateYearDifference(start, end, epochIndex);
}

/**
 * 便捷函数：验证人物生死时间顺序
 */
export function validateLifecycleOrder(
  submission: Submission,
  epochIndex: EpochIndex,
  options: TimelineValidationOptions
): ValidationResult {
  const validator = createTimelineValidator();
  return validator.validateLifecycleOrder(submission, epochIndex, options);
}

/**
 * 便捷函数：验证人物寿命计算一致性
 */
export function validateLifespanConsistency(
  submission: Submission,
  epochIndex: EpochIndex,
  options: TimelineValidationOptions
): ValidationResult {
  const validator = createTimelineValidator();
  return validator.validateLifespanConsistency(submission, epochIndex, options);
}

/**
 * 便捷函数：验证历史事件时间顺序
 */
export function validateEventTimeOrder(
  submission: Submission,
  epochIndex: EpochIndex,
  options: TimelineValidationOptions
): ValidationResult {
  const validator = createTimelineValidator();
  return validator.validateEventTimeOrder(submission, epochIndex, options);
}

/**
 * 便捷函数：验证历史事件参与人物生命周期
 */
export function validateEventParticipants(
  submission: Submission,
  registry: Registry,
  currentBatch: Submission[],
  epochIndex: EpochIndex,
  options: TimelineValidationOptions
): ValidationResult {
  const validator = createTimelineValidator();
  return validator.validateEventParticipants(submission, registry, currentBatch, epochIndex, options);
}

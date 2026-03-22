/**
 * Cross Validator
 * 交叉验证器 - 负责跨设定的引用完整性和数值一致性检查
 */

import type { 
  Submission, 
  Registry, 
  EpochIndex, 
  ValidationResult,
  ValidationError,
  ValidationWarning 
} from '../types/index.js';

/**
 * 交叉验证结果
 */
export interface CrossValidationResult {
  valid: boolean;
  hardErrors: ValidationError[];
  softWarnings: ValidationWarning[];
}

/**
 * 交叉验证器接口
 */
export interface CrossValidator {
  /**
   * 执行完整的交叉验证
   */
  validate(
    submissions: Submission[],
    registry: Registry,
    epochIndex: EpochIndex
  ): CrossValidationResult;
  
  /**
   * 验证引用完整性
   */
  validateReferences(
    submission: Submission,
    registry: Registry
  ): ValidationResult;
  
  /**
   * 验证时间线一致性
   */
  validateTimeline(
    submission: Submission,
    registry: Registry,
    epochIndex: EpochIndex
  ): ValidationResult;
  
  /**
   * 验证数值一致性（如寿命与种族平均寿命）
   */
  validateNumericConsistency(
    submission: Submission,
    registry: Registry
  ): ValidationResult;
}

// 实现将在后续任务中完成

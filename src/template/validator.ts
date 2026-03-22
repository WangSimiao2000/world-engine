/**
 * Template Validator
 * 模板验证器 - 负责验证 Submission 文件是否符合模板定义
 */

import type { Submission, TemplateDefinition, ValidationResult } from '../types/index.js';

/**
 * 模板验证器接口
 */
export interface TemplateValidator {
  /**
   * 验证单个 Submission 文件
   * @param submission 提交文件
   * @param template 模板定义
   */
  validateSubmission(submission: Submission, template: TemplateDefinition): ValidationResult;
}

// 实现将在后续任务中完成

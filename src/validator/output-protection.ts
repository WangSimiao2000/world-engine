/**
 * Output Protection Validator
 * 输出目录保护验证器 - 检查提交是否包含 _build/ 目录文件变更
 */

import type {
  ValidationResult,
  ValidationError,
} from '../types/index.js';
import { ErrorCodes } from '../types/index.js';

/**
 * 受保护的输出目录
 */
export const PROTECTED_OUTPUT_DIR = '_build/';

/**
 * 检查文件路径是否在受保护的输出目录中
 * @param filePath 文件路径
 * @returns 如果文件在 _build/ 目录中返回 true
 */
export function isProtectedPath(filePath: string): boolean {
  // 标准化路径分隔符为正斜杠
  const normalizedPath = filePath.replace(/\\/g, '/');
  
  // 检查是否以 _build/ 开头或包含 /_build/
  return normalizedPath.startsWith('_build/') || normalizedPath.includes('/_build/');
}

/**
 * 验证输出目录保护
 * 检查变更文件列表中是否包含 _build/ 目录下的文件
 * 
 * @param changedFiles 变更文件路径列表
 * @returns 验证结果，如果包含受保护文件则返回硬错误
 */
export function validateOutputProtection(changedFiles: string[]): ValidationResult {
  const protectedFiles = changedFiles.filter(isProtectedPath);
  
  if (protectedFiles.length === 0) {
    return {
      valid: true,
      hardErrors: [],
      softWarnings: [],
    };
  }
  
  // 构建错误信息
  const error: ValidationError = {
    code: ErrorCodes.OUTPUT_MODIFIED,
    message: {
      zh: '禁止直接修改输出目录 _build/ 中的文件',
      en: 'Direct modification of output directory _build/ is not allowed',
    },
    location: {
      file: protectedFiles[0] ?? '', // 第一个受保护文件作为主要位置
      field: '',
    },
    relatedEntities: protectedFiles,
  };
  
  return {
    valid: false,
    hardErrors: [error],
    softWarnings: [],
  };
}

/**
 * 输出目录保护验证器接口
 */
export interface OutputProtectionValidator {
  /**
   * 验证变更文件列表是否包含受保护的输出目录文件
   * @param changedFiles 变更文件路径列表
   */
  validate(changedFiles: string[]): ValidationResult;
  
  /**
   * 检查单个文件路径是否受保护
   * @param filePath 文件路径
   */
  isProtected(filePath: string): boolean;
}

/**
 * 创建输出目录保护验证器实例
 */
export function createOutputProtectionValidator(): OutputProtectionValidator {
  return {
    validate: validateOutputProtection,
    isProtected: isProtectedPath,
  };
}

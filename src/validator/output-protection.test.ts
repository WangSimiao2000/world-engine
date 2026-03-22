/**
 * Output Protection Validator Unit Tests
 * 输出目录保护验证器单元测试
 */

import { describe, it, expect } from 'vitest';
import {
  validateOutputProtection,
  isProtectedPath,
  createOutputProtectionValidator,
  PROTECTED_OUTPUT_DIR,
} from './output-protection.js';
import { ErrorCodes } from '../types/index.js';

describe('OutputProtectionValidator', () => {
  describe('isProtectedPath', () => {
    it('应该识别以 _build/ 开头的路径', () => {
      expect(isProtectedPath('_build/index.yaml')).toBe(true);
      expect(isProtectedPath('_build/character/char-test.yaml')).toBe(true);
      expect(isProtectedPath('_build/_index.yaml')).toBe(true);
    });

    it('应该识别包含 /_build/ 的路径', () => {
      expect(isProtectedPath('some/path/_build/file.yaml')).toBe(true);
      expect(isProtectedPath('nested/_build/character/char-test.yaml')).toBe(true);
    });

    it('应该处理 Windows 风格的路径分隔符', () => {
      expect(isProtectedPath('_build\\index.yaml')).toBe(true);
      expect(isProtectedPath('_build\\character\\char-test.yaml')).toBe(true);
      expect(isProtectedPath('some\\path\\_build\\file.yaml')).toBe(true);
    });

    it('应该不匹配非 _build 目录的路径', () => {
      expect(isProtectedPath('submissions/character/char-test.yaml')).toBe(false);
      expect(isProtectedPath('templates/character.yaml')).toBe(false);
      expect(isProtectedPath('src/validator/output-protection.ts')).toBe(false);
    });

    it('应该不匹配包含 _build 但不是目录的路径', () => {
      expect(isProtectedPath('_build_backup/file.yaml')).toBe(false);
      expect(isProtectedPath('my_build/file.yaml')).toBe(false);
      expect(isProtectedPath('_builder/file.yaml')).toBe(false);
    });

    it('应该不匹配文件名包含 _build 的路径', () => {
      expect(isProtectedPath('submissions/_build.yaml')).toBe(false);
      expect(isProtectedPath('docs/_build_notes.md')).toBe(false);
    });

    it('应该处理空路径', () => {
      expect(isProtectedPath('')).toBe(false);
    });

    it('应该处理只有目录名的路径', () => {
      expect(isProtectedPath('_build/')).toBe(true);
    });
  });

  describe('validateOutputProtection', () => {
    it('应该对空文件列表返回有效结果', () => {
      const result = validateOutputProtection([]);
      
      expect(result.valid).toBe(true);
      expect(result.hardErrors).toHaveLength(0);
      expect(result.softWarnings).toHaveLength(0);
    });

    it('应该对不包含 _build/ 文件的列表返回有效结果', () => {
      const changedFiles = [
        'submissions/character/char-test.yaml',
        'templates/character.yaml',
        'src/validator/output-protection.ts',
      ];
      
      const result = validateOutputProtection(changedFiles);
      
      expect(result.valid).toBe(true);
      expect(result.hardErrors).toHaveLength(0);
    });

    it('应该对包含 _build/ 文件的列表返回硬错误', () => {
      const changedFiles = [
        'submissions/character/char-test.yaml',
        '_build/character/char-test.yaml',
      ];
      
      const result = validateOutputProtection(changedFiles);
      
      expect(result.valid).toBe(false);
      expect(result.hardErrors).toHaveLength(1);
      expect(result.hardErrors[0].code).toBe(ErrorCodes.OUTPUT_MODIFIED);
    });

    it('应该在错误信息中包含中英文描述', () => {
      const changedFiles = ['_build/index.yaml'];
      
      const result = validateOutputProtection(changedFiles);
      
      expect(result.hardErrors[0].message.zh).toBe('禁止直接修改输出目录 _build/ 中的文件');
      expect(result.hardErrors[0].message.en).toBe('Direct modification of output directory _build/ is not allowed');
    });

    it('应该在错误位置中包含第一个受保护文件', () => {
      const changedFiles = [
        '_build/character/char-a.yaml',
        '_build/race/race-b.yaml',
      ];
      
      const result = validateOutputProtection(changedFiles);
      
      expect(result.hardErrors[0].location.file).toBe('_build/character/char-a.yaml');
    });

    it('应该在 relatedEntities 中列出所有受保护文件', () => {
      const changedFiles = [
        'submissions/character/char-test.yaml',
        '_build/character/char-a.yaml',
        '_build/race/race-b.yaml',
        '_build/_index.yaml',
      ];
      
      const result = validateOutputProtection(changedFiles);
      
      expect(result.hardErrors[0].relatedEntities).toEqual([
        '_build/character/char-a.yaml',
        '_build/race/race-b.yaml',
        '_build/_index.yaml',
      ]);
    });

    it('应该只返回一个错误，即使有多个受保护文件', () => {
      const changedFiles = [
        '_build/file1.yaml',
        '_build/file2.yaml',
        '_build/file3.yaml',
      ];
      
      const result = validateOutputProtection(changedFiles);
      
      expect(result.hardErrors).toHaveLength(1);
    });

    it('应该处理嵌套的 _build/ 目录', () => {
      const changedFiles = [
        'project/submodule/_build/output.yaml',
      ];
      
      const result = validateOutputProtection(changedFiles);
      
      expect(result.valid).toBe(false);
      expect(result.hardErrors[0].relatedEntities).toContain('project/submodule/_build/output.yaml');
    });
  });

  describe('createOutputProtectionValidator', () => {
    it('应该创建有效的验证器实例', () => {
      const validator = createOutputProtectionValidator();
      
      expect(validator.validate).toBeDefined();
      expect(validator.isProtected).toBeDefined();
    });

    it('validate 方法应该正常工作', () => {
      const validator = createOutputProtectionValidator();
      
      const validResult = validator.validate(['submissions/test.yaml']);
      expect(validResult.valid).toBe(true);
      
      const invalidResult = validator.validate(['_build/test.yaml']);
      expect(invalidResult.valid).toBe(false);
    });

    it('isProtected 方法应该正常工作', () => {
      const validator = createOutputProtectionValidator();
      
      expect(validator.isProtected('_build/test.yaml')).toBe(true);
      expect(validator.isProtected('submissions/test.yaml')).toBe(false);
    });
  });

  describe('PROTECTED_OUTPUT_DIR', () => {
    it('应该定义为 _build/', () => {
      expect(PROTECTED_OUTPUT_DIR).toBe('_build/');
    });
  });

  describe('边界情况', () => {
    it('应该处理只有 _build 目录本身的变更', () => {
      const result = validateOutputProtection(['_build/']);
      
      expect(result.valid).toBe(false);
    });

    it('应该处理混合路径分隔符', () => {
      const changedFiles = [
        '_build\\character/char-test.yaml',
        'submissions/character\\char-test.yaml',
      ];
      
      const result = validateOutputProtection(changedFiles);
      
      expect(result.valid).toBe(false);
      expect(result.hardErrors[0].relatedEntities).toHaveLength(1);
    });

    it('应该处理带有特殊字符的文件名', () => {
      const changedFiles = [
        '_build/character/char-nü-wa.yaml',
        '_build/race/race-神族.yaml',
      ];
      
      const result = validateOutputProtection(changedFiles);
      
      expect(result.valid).toBe(false);
      expect(result.hardErrors[0].relatedEntities).toHaveLength(2);
    });

    it('应该处理深层嵌套的路径', () => {
      const changedFiles = [
        '_build/a/b/c/d/e/f/g/file.yaml',
      ];
      
      const result = validateOutputProtection(changedFiles);
      
      expect(result.valid).toBe(false);
    });

    it('应该正确区分 _build 和类似名称的目录', () => {
      const changedFiles = [
        '_build_old/file.yaml',
        '_build-backup/file.yaml',
        '_builds/file.yaml',
        'pre_build/file.yaml',
      ];
      
      const result = validateOutputProtection(changedFiles);
      
      expect(result.valid).toBe(true);
    });
  });
});

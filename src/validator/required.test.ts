/**
 * Required Fields Validator Tests
 * 必填项验证器单元测试
 */

import { describe, it, expect } from 'vitest';
import { validateRequiredFields, getMissingRequiredFields } from './required.js';
import type { TemplateDefinition, Category } from '../types/index.js';
import { ErrorCodes } from '../types/index.js';

// 创建测试用的模板定义
function createTestTemplate(requiredFields: string[]): TemplateDefinition {
  return {
    category: 'character' as Category,
    description: { zh: '测试模板', en: 'Test template' },
    required: requiredFields.map(name => ({
      name,
      type: 'string' as const,
      description: { zh: `${name} 字段`, en: `${name} field` },
    })),
    optional: [],
  };
}

describe('validateRequiredFields', () => {
  describe('当所有必填项都存在时', () => {
    it('应返回 valid: true', () => {
      const template = createTestTemplate(['id', 'name', 'race']);
      const submission = {
        template: 'character',
        id: 'char-test',
        name: { zh: '测试' },
        race: 'race-human',
      };

      const result = validateRequiredFields(submission, template, 'test.yaml');

      expect(result.valid).toBe(true);
      expect(result.hardErrors).toHaveLength(0);
    });

    it('应处理空的必填项列表', () => {
      const template = createTestTemplate([]);
      const submission = { template: 'character' };

      const result = validateRequiredFields(submission, template, 'test.yaml');

      expect(result.valid).toBe(true);
      expect(result.hardErrors).toHaveLength(0);
    });
  });

  describe('当缺少必填项时', () => {
    it('应返回 valid: false 并列出缺失字段', () => {
      const template = createTestTemplate(['id', 'name', 'race']);
      const submission = {
        template: 'character',
        id: 'char-test',
      };

      const result = validateRequiredFields(submission, template, 'test.yaml');

      expect(result.valid).toBe(false);
      expect(result.hardErrors).toHaveLength(1);
      expect(result.hardErrors[0].code).toBe(ErrorCodes.FIELD_REQUIRED);
      expect(result.hardErrors[0].message.zh).toContain('name');
      expect(result.hardErrors[0].message.zh).toContain('race');
      expect(result.hardErrors[0].message.en).toContain('name');
      expect(result.hardErrors[0].message.en).toContain('race');
    });

    it('应在 relatedEntities 中包含所有缺失字段', () => {
      const template = createTestTemplate(['id', 'name', 'race', 'birth_epoch']);
      const submission = {
        template: 'character',
        id: 'char-test',
      };

      const result = validateRequiredFields(submission, template, 'test.yaml');

      expect(result.hardErrors[0].relatedEntities).toEqual(['name', 'race', 'birth_epoch']);
    });

    it('应正确设置错误位置信息', () => {
      const template = createTestTemplate(['id', 'name']);
      const submission = { template: 'character' };

      const result = validateRequiredFields(submission, template, 'submissions/character/test.yaml');

      expect(result.hardErrors[0].location.file).toBe('submissions/character/test.yaml');
      expect(result.hardErrors[0].location.field).toBe('id');
    });
  });

  describe('边界情况处理', () => {
    it('应将 null 值视为缺失', () => {
      const template = createTestTemplate(['id', 'name']);
      const submission = {
        template: 'character',
        id: 'char-test',
        name: null,
      };

      const result = validateRequiredFields(submission, template, 'test.yaml');

      expect(result.valid).toBe(false);
      expect(result.hardErrors[0].message.zh).toContain('name');
    });

    it('应将 undefined 值视为缺失', () => {
      const template = createTestTemplate(['id', 'name']);
      const submission = {
        template: 'character',
        id: 'char-test',
        name: undefined,
      };

      const result = validateRequiredFields(submission, template, 'test.yaml');

      expect(result.valid).toBe(false);
      expect(result.hardErrors[0].message.zh).toContain('name');
    });

    it('应接受空字符串作为有效值', () => {
      const template = createTestTemplate(['id', 'name']);
      const submission = {
        template: 'character',
        id: 'char-test',
        name: '',
      };

      const result = validateRequiredFields(submission, template, 'test.yaml');

      expect(result.valid).toBe(true);
    });

    it('应接受 0 作为有效值', () => {
      const template = createTestTemplate(['id', 'count']);
      const submission = {
        template: 'character',
        id: 'char-test',
        count: 0,
      };

      const result = validateRequiredFields(submission, template, 'test.yaml');

      expect(result.valid).toBe(true);
    });

    it('应接受 false 作为有效值', () => {
      const template = createTestTemplate(['id', 'active']);
      const submission = {
        template: 'character',
        id: 'char-test',
        active: false,
      };

      const result = validateRequiredFields(submission, template, 'test.yaml');

      expect(result.valid).toBe(true);
    });

    it('应接受空数组作为有效值', () => {
      const template = createTestTemplate(['id', 'items']);
      const submission = {
        template: 'character',
        id: 'char-test',
        items: [],
      };

      const result = validateRequiredFields(submission, template, 'test.yaml');

      expect(result.valid).toBe(true);
    });

    it('应接受空对象作为有效值', () => {
      const template = createTestTemplate(['id', 'metadata']);
      const submission = {
        template: 'character',
        id: 'char-test',
        metadata: {},
      };

      const result = validateRequiredFields(submission, template, 'test.yaml');

      expect(result.valid).toBe(true);
    });
  });
});

describe('getMissingRequiredFields', () => {
  it('应返回所有缺失字段的名称列表', () => {
    const template = createTestTemplate(['id', 'name', 'race', 'birth_epoch']);
    const submission = {
      template: 'character',
      id: 'char-test',
      race: 'race-human',
    };

    const missing = getMissingRequiredFields(submission, template);

    expect(missing).toEqual(['name', 'birth_epoch']);
  });

  it('当所有字段都存在时应返回空数组', () => {
    const template = createTestTemplate(['id', 'name']);
    const submission = {
      template: 'character',
      id: 'char-test',
      name: { zh: '测试' },
    };

    const missing = getMissingRequiredFields(submission, template);

    expect(missing).toEqual([]);
  });

  it('当所有字段都缺失时应返回所有字段名', () => {
    const template = createTestTemplate(['id', 'name', 'race']);
    const submission = { template: 'character' };

    const missing = getMissingRequiredFields(submission, template);

    expect(missing).toEqual(['id', 'name', 'race']);
  });
});

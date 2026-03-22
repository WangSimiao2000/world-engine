/**
 * Unknown Fields Validator Tests
 * 未定义字段警告验证器单元测试
 */

import { describe, it, expect } from 'vitest';
import { validateUnknownFields, getUnknownFields } from './unknown.js';
import type { TemplateDefinition, Category } from '../types/index.js';
import { WarningCodes } from '../types/index.js';

// 创建测试用的模板定义
function createTestTemplate(
  requiredFields: string[],
  optionalFields: string[] = []
): TemplateDefinition {
  return {
    category: 'character' as Category,
    description: { zh: '测试模板', en: 'Test template' },
    required: requiredFields.map(name => ({
      name,
      type: 'string' as const,
      description: { zh: `${name} 字段`, en: `${name} field` },
    })),
    optional: optionalFields.map(name => ({
      name,
      type: 'string' as const,
      description: { zh: `${name} 字段`, en: `${name} field` },
    })),
  };
}

describe('validateUnknownFields', () => {
  describe('当所有字段都在模板中定义时', () => {
    it('应返回 valid: true 且无警告', () => {
      const template = createTestTemplate(['name', 'race'], ['description']);
      const submission = {
        template: 'character',
        id: 'char-test',
        name: { zh: '测试' },
        race: 'race-human',
        description: { zh: '描述' },
      };

      const result = validateUnknownFields(submission, template, 'test.yaml');

      expect(result.valid).toBe(true);
      expect(result.softWarnings).toHaveLength(0);
      expect(result.hardErrors).toHaveLength(0);
    });

    it('应处理空的字段列表', () => {
      const template = createTestTemplate([], []);
      const submission = {
        template: 'character',
        id: 'char-test',
      };

      const result = validateUnknownFields(submission, template, 'test.yaml');

      expect(result.valid).toBe(true);
      expect(result.softWarnings).toHaveLength(0);
    });
  });

  describe('当存在未定义字段时', () => {
    it('应为每个未知字段生成警告', () => {
      const template = createTestTemplate(['name'], []);
      const submission = {
        template: 'character',
        id: 'char-test',
        name: { zh: '测试' },
        unknownField1: 'value1',
        unknownField2: 'value2',
      };

      const result = validateUnknownFields(submission, template, 'test.yaml');

      expect(result.valid).toBe(true); // 警告不影响验证结果
      expect(result.softWarnings).toHaveLength(2);
      expect(result.hardErrors).toHaveLength(0);
    });

    it('应使用正确的警告码', () => {
      const template = createTestTemplate(['name'], []);
      const submission = {
        template: 'character',
        id: 'char-test',
        name: { zh: '测试' },
        unknownField: 'value',
      };

      const result = validateUnknownFields(submission, template, 'test.yaml');

      expect(result.softWarnings[0].code).toBe(WarningCodes.FIELD_UNKNOWN);
    });

    it('应在警告消息中包含字段名', () => {
      const template = createTestTemplate(['name'], []);
      const submission = {
        template: 'character',
        id: 'char-test',
        name: { zh: '测试' },
        customField: 'value',
      };

      const result = validateUnknownFields(submission, template, 'test.yaml');

      expect(result.softWarnings[0].message.zh).toContain('customField');
      expect(result.softWarnings[0].message.en).toContain('customField');
    });

    it('应正确设置警告位置信息', () => {
      const template = createTestTemplate(['name'], []);
      const submission = {
        template: 'character',
        id: 'char-test',
        name: { zh: '测试' },
        unknownField: 'value',
      };

      const result = validateUnknownFields(submission, template, 'submissions/character/test.yaml');

      expect(result.softWarnings[0].location.file).toBe('submissions/character/test.yaml');
      expect(result.softWarnings[0].location.field).toBe('unknownField');
    });
  });

  describe('保留字段处理', () => {
    it('template 字段不应触发警告', () => {
      const template = createTestTemplate(['name'], []);
      const submission = {
        template: 'character',
        id: 'char-test',
        name: { zh: '测试' },
      };

      const result = validateUnknownFields(submission, template, 'test.yaml');

      expect(result.softWarnings).toHaveLength(0);
    });

    it('id 字段不应触发警告', () => {
      const template = createTestTemplate(['name'], []);
      const submission = {
        template: 'character',
        id: 'char-test',
        name: { zh: '测试' },
      };

      const result = validateUnknownFields(submission, template, 'test.yaml');

      expect(result.softWarnings).toHaveLength(0);
    });

    it('即使模板未定义 template 和 id，也不应触发警告', () => {
      const template = createTestTemplate([], []);
      const submission = {
        template: 'character',
        id: 'char-test',
      };

      const result = validateUnknownFields(submission, template, 'test.yaml');

      expect(result.softWarnings).toHaveLength(0);
    });
  });

  describe('必填项和选填项区分', () => {
    it('必填字段不应触发警告', () => {
      const template = createTestTemplate(['name', 'race'], []);
      const submission = {
        template: 'character',
        id: 'char-test',
        name: { zh: '测试' },
        race: 'race-human',
      };

      const result = validateUnknownFields(submission, template, 'test.yaml');

      expect(result.softWarnings).toHaveLength(0);
    });

    it('选填字段不应触发警告', () => {
      const template = createTestTemplate(['name'], ['description', 'notes']);
      const submission = {
        template: 'character',
        id: 'char-test',
        name: { zh: '测试' },
        description: { zh: '描述' },
        notes: '备注',
      };

      const result = validateUnknownFields(submission, template, 'test.yaml');

      expect(result.softWarnings).toHaveLength(0);
    });
  });

  describe('边界情况处理', () => {
    it('应处理空的 submission', () => {
      const template = createTestTemplate(['name'], []);
      const submission = {};

      const result = validateUnknownFields(submission, template, 'test.yaml');

      expect(result.valid).toBe(true);
      expect(result.softWarnings).toHaveLength(0);
    });

    it('应处理只有保留字段的 submission', () => {
      const template = createTestTemplate(['name'], []);
      const submission = {
        template: 'character',
        id: 'char-test',
      };

      const result = validateUnknownFields(submission, template, 'test.yaml');

      expect(result.valid).toBe(true);
      expect(result.softWarnings).toHaveLength(0);
    });

    it('应处理字段值为各种类型的情况', () => {
      const template = createTestTemplate(['name'], []);
      const submission = {
        template: 'character',
        id: 'char-test',
        name: { zh: '测试' },
        unknownString: 'string',
        unknownNumber: 123,
        unknownBoolean: true,
        unknownArray: [1, 2, 3],
        unknownObject: { key: 'value' },
        unknownNull: null,
      };

      const result = validateUnknownFields(submission, template, 'test.yaml');

      expect(result.softWarnings).toHaveLength(6);
    });
  });
});

describe('getUnknownFields', () => {
  it('应返回所有未知字段的名称列表', () => {
    const template = createTestTemplate(['name'], ['description']);
    const submission = {
      template: 'character',
      id: 'char-test',
      name: { zh: '测试' },
      unknownField1: 'value1',
      unknownField2: 'value2',
    };

    const unknown = getUnknownFields(submission, template);

    expect(unknown).toEqual(['unknownField1', 'unknownField2']);
  });

  it('当所有字段都已定义时应返回空数组', () => {
    const template = createTestTemplate(['name', 'race'], ['description']);
    const submission = {
      template: 'character',
      id: 'char-test',
      name: { zh: '测试' },
      race: 'race-human',
      description: { zh: '描述' },
    };

    const unknown = getUnknownFields(submission, template);

    expect(unknown).toEqual([]);
  });

  it('应排除保留字段 template 和 id', () => {
    const template = createTestTemplate([], []);
    const submission = {
      template: 'character',
      id: 'char-test',
      unknownField: 'value',
    };

    const unknown = getUnknownFields(submission, template);

    expect(unknown).toEqual(['unknownField']);
    expect(unknown).not.toContain('template');
    expect(unknown).not.toContain('id');
  });

  it('应处理空的 submission', () => {
    const template = createTestTemplate(['name'], []);
    const submission = {};

    const unknown = getUnknownFields(submission, template);

    expect(unknown).toEqual([]);
  });
});

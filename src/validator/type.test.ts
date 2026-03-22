/**
 * Field Type Validator Tests
 * 字段类型验证器单元测试
 */

import { describe, it, expect } from 'vitest';
import {
  validateFieldType,
  validateFieldTypes,
  getTypeMismatchedFields,
  getActualType,
} from './type.js';
import type { TemplateDefinition, Category, FieldType, FieldDefinition } from '../types/index.js';
import { ErrorCodes } from '../types/index.js';

// 创建测试用的字段定义
function createFieldDef(name: string, type: FieldType): FieldDefinition {
  return {
    name,
    type,
    description: { zh: `${name} 字段`, en: `${name} field` },
  };
}

// 创建测试用的模板定义
function createTestTemplate(
  requiredFields: Array<{ name: string; type: FieldType }>,
  optionalFields: Array<{ name: string; type: FieldType }> = []
): TemplateDefinition {
  return {
    category: 'character' as Category,
    description: { zh: '测试模板', en: 'Test template' },
    required: requiredFields.map(f => createFieldDef(f.name, f.type)),
    optional: optionalFields.map(f => createFieldDef(f.name, f.type)),
  };
}

describe('getActualType', () => {
  it('应正确识别 null', () => {
    expect(getActualType(null)).toBe('null');
  });

  it('应正确识别 undefined', () => {
    expect(getActualType(undefined)).toBe('undefined');
  });

  it('应正确识别数组', () => {
    expect(getActualType([])).toBe('array');
    expect(getActualType([1, 2, 3])).toBe('array');
  });

  it('应正确识别基本类型', () => {
    expect(getActualType('hello')).toBe('string');
    expect(getActualType(42)).toBe('number');
    expect(getActualType(true)).toBe('boolean');
    expect(getActualType({})).toBe('object');
  });
});

describe('validateFieldType', () => {
  describe('string 类型', () => {
    it('应接受字符串', () => {
      expect(validateFieldType('hello', 'string')).toBe(true);
      expect(validateFieldType('', 'string')).toBe(true);
    });

    it('应拒绝非字符串', () => {
      expect(validateFieldType(123, 'string')).toBe(false);
      expect(validateFieldType(true, 'string')).toBe(false);
      expect(validateFieldType({}, 'string')).toBe(false);
      expect(validateFieldType([], 'string')).toBe(false);
      expect(validateFieldType(null, 'string')).toBe(false);
      expect(validateFieldType(undefined, 'string')).toBe(false);
    });
  });

  describe('integer 类型', () => {
    it('应接受整数', () => {
      expect(validateFieldType(42, 'integer')).toBe(true);
      expect(validateFieldType(0, 'integer')).toBe(true);
      expect(validateFieldType(-100, 'integer')).toBe(true);
    });

    it('应拒绝浮点数', () => {
      expect(validateFieldType(3.14, 'integer')).toBe(false);
      expect(validateFieldType(0.5, 'integer')).toBe(false);
    });

    it('应拒绝非数字', () => {
      expect(validateFieldType('42', 'integer')).toBe(false);
      expect(validateFieldType(true, 'integer')).toBe(false);
      expect(validateFieldType(null, 'integer')).toBe(false);
    });
  });

  describe('boolean 类型', () => {
    it('应接受布尔值', () => {
      expect(validateFieldType(true, 'boolean')).toBe(true);
      expect(validateFieldType(false, 'boolean')).toBe(true);
    });

    it('应拒绝非布尔值', () => {
      expect(validateFieldType(1, 'boolean')).toBe(false);
      expect(validateFieldType(0, 'boolean')).toBe(false);
      expect(validateFieldType('true', 'boolean')).toBe(false);
      expect(validateFieldType(null, 'boolean')).toBe(false);
    });
  });

  describe('epoch_ref 类型', () => {
    it('应接受字符串', () => {
      expect(validateFieldType('epoch-01', 'epoch_ref')).toBe(true);
      expect(validateFieldType('epoch-chaos', 'epoch_ref')).toBe(true);
    });

    it('应拒绝非字符串', () => {
      expect(validateFieldType(1, 'epoch_ref')).toBe(false);
      expect(validateFieldType({}, 'epoch_ref')).toBe(false);
      expect(validateFieldType(null, 'epoch_ref')).toBe(false);
    });
  });

  describe('entity_ref 类型', () => {
    it('应接受字符串', () => {
      expect(validateFieldType('race-human', 'entity_ref')).toBe(true);
      expect(validateFieldType('char-nü-wa', 'entity_ref')).toBe(true);
    });

    it('应拒绝非字符串', () => {
      expect(validateFieldType(1, 'entity_ref')).toBe(false);
      expect(validateFieldType({}, 'entity_ref')).toBe(false);
      expect(validateFieldType(null, 'entity_ref')).toBe(false);
    });
  });

  describe('bilingual 类型', () => {
    it('应接受有效的双语对象', () => {
      expect(validateFieldType({ zh: '中文' }, 'bilingual')).toBe(true);
      expect(validateFieldType({ zh: '中文', en: 'English' }, 'bilingual')).toBe(true);
    });

    it('应拒绝缺少 zh 的对象', () => {
      expect(validateFieldType({ en: 'English' }, 'bilingual')).toBe(false);
      expect(validateFieldType({}, 'bilingual')).toBe(false);
    });

    it('应拒绝 zh 不是字符串的对象', () => {
      expect(validateFieldType({ zh: 123 }, 'bilingual')).toBe(false);
      expect(validateFieldType({ zh: null }, 'bilingual')).toBe(false);
    });

    it('应拒绝 en 不是字符串的对象', () => {
      expect(validateFieldType({ zh: '中文', en: 123 }, 'bilingual')).toBe(false);
    });

    it('应拒绝非对象', () => {
      expect(validateFieldType('中文', 'bilingual')).toBe(false);
      expect(validateFieldType(null, 'bilingual')).toBe(false);
      expect(validateFieldType([], 'bilingual')).toBe(false);
    });
  });

  describe('versioning 类型', () => {
    it('应接受有效的版本信息对象', () => {
      expect(
        validateFieldType(
          { canon: true, source: 'author-1', priority: 'official' },
          'versioning'
        )
      ).toBe(true);
      expect(
        validateFieldType(
          { canon: false, source: 'author-2', priority: 'secondary' },
          'versioning'
        )
      ).toBe(true);
    });

    it('应拒绝缺少必填字段的对象', () => {
      expect(validateFieldType({ canon: true, source: 'author-1' }, 'versioning')).toBe(false);
      expect(validateFieldType({ canon: true, priority: 'official' }, 'versioning')).toBe(false);
      expect(validateFieldType({ source: 'author-1', priority: 'official' }, 'versioning')).toBe(
        false
      );
    });

    it('应拒绝字段类型错误的对象', () => {
      expect(
        validateFieldType({ canon: 'true', source: 'author-1', priority: 'official' }, 'versioning')
      ).toBe(false);
      expect(
        validateFieldType({ canon: true, source: 123, priority: 'official' }, 'versioning')
      ).toBe(false);
    });

    it('应拒绝 priority 值无效的对象', () => {
      expect(
        validateFieldType({ canon: true, source: 'author-1', priority: 'invalid' }, 'versioning')
      ).toBe(false);
    });

    it('应拒绝非对象', () => {
      expect(validateFieldType('versioning', 'versioning')).toBe(false);
      expect(validateFieldType(null, 'versioning')).toBe(false);
    });
  });

  describe('array<T> 类型', () => {
    it('应接受元素类型正确的数组', () => {
      expect(validateFieldType(['a', 'b', 'c'], 'array<string>')).toBe(true);
      expect(validateFieldType([1, 2, 3], 'array<integer>')).toBe(true);
      expect(validateFieldType([true, false], 'array<boolean>')).toBe(true);
      expect(validateFieldType(['epoch-01', 'epoch-02'], 'array<epoch_ref>')).toBe(true);
      expect(validateFieldType(['char-1', 'char-2'], 'array<entity_ref>')).toBe(true);
    });

    it('应接受空数组', () => {
      expect(validateFieldType([], 'array<string>')).toBe(true);
      expect(validateFieldType([], 'array<integer>')).toBe(true);
    });

    it('应拒绝包含错误类型元素的数组', () => {
      expect(validateFieldType(['a', 1, 'c'], 'array<string>')).toBe(false);
      expect(validateFieldType([1, 2, 3.5], 'array<integer>')).toBe(false);
      expect(validateFieldType([true, 'false'], 'array<boolean>')).toBe(false);
    });

    it('应拒绝非数组', () => {
      expect(validateFieldType('not an array', 'array<string>')).toBe(false);
      expect(validateFieldType({ 0: 'a', 1: 'b' }, 'array<string>')).toBe(false);
      expect(validateFieldType(null, 'array<string>')).toBe(false);
    });

    it('应支持嵌套数组类型', () => {
      expect(
        validateFieldType(
          [{ zh: '中文1' }, { zh: '中文2', en: 'English2' }],
          'array<bilingual>'
        )
      ).toBe(true);
      expect(
        validateFieldType(
          [{ zh: '中文1' }, { en: 'English2' }],
          'array<bilingual>'
        )
      ).toBe(false);
    });
  });
});

describe('validateFieldTypes', () => {
  describe('当所有字段类型正确时', () => {
    it('应返回 valid: true', () => {
      const template = createTestTemplate([
        { name: 'id', type: 'string' },
        { name: 'name', type: 'bilingual' },
        { name: 'age', type: 'integer' },
      ]);
      const submission = {
        template: 'character',
        id: 'char-test',
        name: { zh: '测试' },
        age: 25,
      };

      const result = validateFieldTypes(submission, template, 'test.yaml');

      expect(result.valid).toBe(true);
      expect(result.hardErrors).toHaveLength(0);
    });

    it('应处理空模板', () => {
      const template = createTestTemplate([]);
      const submission = { template: 'character' };

      const result = validateFieldTypes(submission, template, 'test.yaml');

      expect(result.valid).toBe(true);
    });
  });

  describe('当字段类型不匹配时', () => {
    it('应返回 valid: false 并报告类型错误', () => {
      const template = createTestTemplate([
        { name: 'id', type: 'string' },
        { name: 'age', type: 'integer' },
      ]);
      const submission = {
        template: 'character',
        id: 'char-test',
        age: '25', // 应该是整数
      };

      const result = validateFieldTypes(submission, template, 'test.yaml');

      expect(result.valid).toBe(false);
      expect(result.hardErrors).toHaveLength(1);
      expect(result.hardErrors[0].code).toBe(ErrorCodes.FIELD_TYPE);
      expect(result.hardErrors[0].message.zh).toContain('age');
      expect(result.hardErrors[0].message.zh).toContain('整数');
      expect(result.hardErrors[0].message.zh).toContain('字符串');
      expect(result.hardErrors[0].message.en).toContain('age');
      expect(result.hardErrors[0].message.en).toContain('integer');
      expect(result.hardErrors[0].message.en).toContain('string');
    });

    it('应报告多个类型错误', () => {
      const template = createTestTemplate([
        { name: 'id', type: 'string' },
        { name: 'age', type: 'integer' },
        { name: 'active', type: 'boolean' },
      ]);
      const submission = {
        template: 'character',
        id: 123, // 应该是字符串
        age: '25', // 应该是整数
        active: 'yes', // 应该是布尔值
      };

      const result = validateFieldTypes(submission, template, 'test.yaml');

      expect(result.valid).toBe(false);
      expect(result.hardErrors).toHaveLength(3);
    });

    it('应正确设置错误位置信息', () => {
      const template = createTestTemplate([{ name: 'age', type: 'integer' }]);
      const submission = {
        template: 'character',
        age: 'not a number',
      };

      const result = validateFieldTypes(submission, template, 'submissions/character/test.yaml');

      expect(result.hardErrors[0].location.file).toBe('submissions/character/test.yaml');
      expect(result.hardErrors[0].location.field).toBe('age');
    });
  });

  describe('可选字段处理', () => {
    it('应验证存在的可选字段类型', () => {
      const template = createTestTemplate(
        [{ name: 'id', type: 'string' }],
        [{ name: 'description', type: 'bilingual' }]
      );
      const submission = {
        template: 'character',
        id: 'char-test',
        description: 'not bilingual', // 应该是双语对象
      };

      const result = validateFieldTypes(submission, template, 'test.yaml');

      expect(result.valid).toBe(false);
      expect(result.hardErrors[0].location.field).toBe('description');
    });

    it('应跳过不存在的可选字段', () => {
      const template = createTestTemplate(
        [{ name: 'id', type: 'string' }],
        [{ name: 'description', type: 'bilingual' }]
      );
      const submission = {
        template: 'character',
        id: 'char-test',
        // description 未提供
      };

      const result = validateFieldTypes(submission, template, 'test.yaml');

      expect(result.valid).toBe(true);
    });
  });

  describe('null 和 undefined 处理', () => {
    it('应跳过 null 值（由必填项验证器处理）', () => {
      const template = createTestTemplate([{ name: 'age', type: 'integer' }]);
      const submission = {
        template: 'character',
        age: null,
      };

      const result = validateFieldTypes(submission, template, 'test.yaml');

      expect(result.valid).toBe(true);
      expect(result.hardErrors).toHaveLength(0);
    });

    it('应跳过 undefined 值（由必填项验证器处理）', () => {
      const template = createTestTemplate([{ name: 'age', type: 'integer' }]);
      const submission = {
        template: 'character',
        age: undefined,
      };

      const result = validateFieldTypes(submission, template, 'test.yaml');

      expect(result.valid).toBe(true);
      expect(result.hardErrors).toHaveLength(0);
    });
  });

  describe('复杂类型验证', () => {
    it('应验证 versioning 类型', () => {
      const template = createTestTemplate([{ name: 'versioning', type: 'versioning' }]);
      const submission = {
        template: 'character',
        versioning: { canon: true, source: 'author-1', priority: 'official' },
      };

      const result = validateFieldTypes(submission, template, 'test.yaml');

      expect(result.valid).toBe(true);
    });

    it('应验证 array<entity_ref> 类型', () => {
      const template = createTestTemplate([{ name: 'participants', type: 'array<entity_ref>' }]);
      const submission = {
        template: 'history',
        participants: ['char-1', 'char-2', 'char-3'],
      };

      const result = validateFieldTypes(submission, template, 'test.yaml');

      expect(result.valid).toBe(true);
    });

    it('应拒绝无效的 array<entity_ref> 类型', () => {
      const template = createTestTemplate([{ name: 'participants', type: 'array<entity_ref>' }]);
      const submission = {
        template: 'history',
        participants: ['char-1', 123, 'char-3'], // 包含非字符串
      };

      const result = validateFieldTypes(submission, template, 'test.yaml');

      expect(result.valid).toBe(false);
    });
  });
});

describe('getTypeMismatchedFields', () => {
  it('应返回所有类型不匹配的字段信息', () => {
    const template = createTestTemplate([
      { name: 'id', type: 'string' },
      { name: 'age', type: 'integer' },
      { name: 'active', type: 'boolean' },
    ]);
    const submission = {
      template: 'character',
      id: 'char-test',
      age: '25', // 类型错误
      active: 1, // 类型错误
    };

    const mismatched = getTypeMismatchedFields(submission, template);

    expect(mismatched).toHaveLength(2);
    expect(mismatched).toContainEqual({ field: 'age', expected: 'integer', actual: 'string' });
    expect(mismatched).toContainEqual({ field: 'active', expected: 'boolean', actual: 'number' });
  });

  it('当所有字段类型正确时应返回空数组', () => {
    const template = createTestTemplate([
      { name: 'id', type: 'string' },
      { name: 'age', type: 'integer' },
    ]);
    const submission = {
      template: 'character',
      id: 'char-test',
      age: 25,
    };

    const mismatched = getTypeMismatchedFields(submission, template);

    expect(mismatched).toEqual([]);
  });

  it('应跳过不存在的字段', () => {
    const template = createTestTemplate([
      { name: 'id', type: 'string' },
      { name: 'age', type: 'integer' },
    ]);
    const submission = {
      template: 'character',
      id: 'char-test',
      // age 未提供
    };

    const mismatched = getTypeMismatchedFields(submission, template);

    expect(mismatched).toEqual([]);
  });
});

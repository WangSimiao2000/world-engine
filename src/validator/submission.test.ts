/**
 * Submission Validator Unit Tests
 * 提交文件格式验证器单元测试
 */

import { describe, it, expect } from 'vitest';
import {
  createSubmissionValidator,
  validateYamlFormat,
  parseSubmission,
  ID_PATTERNS,
  ID_PREFIXES,
} from './submission.js';
import { ErrorCodes, CATEGORIES } from '../types/index.js';

describe('SubmissionValidator', () => {
  const validator = createSubmissionValidator();

  describe('YAML 格式验证', () => {
    it('应该拒绝无效的 YAML 格式', () => {
      const invalidYaml = `
template: character
id: char-test
  - invalid: [unclosed bracket
`;
      const result = validator.validateFormat(invalidYaml, 'test.yaml');
      
      expect(result.valid).toBe(false);
      expect(result.hardErrors).toHaveLength(1);
      expect(result.hardErrors[0].code).toBe(ErrorCodes.YAML_INVALID);
      expect(result.hardErrors[0].location.file).toBe('test.yaml');
    });

    it('应该拒绝非对象类型的 YAML 内容', () => {
      const arrayYaml = '- item1\n- item2';
      const result = validator.validateFormat(arrayYaml, 'test.yaml');
      
      expect(result.valid).toBe(false);
      expect(result.hardErrors).toHaveLength(1);
      expect(result.hardErrors[0].code).toBe(ErrorCodes.YAML_INVALID);
      expect(result.hardErrors[0].message.zh).toContain('必须是一个对象');
    });

    it('应该拒绝 null 内容', () => {
      const nullYaml = 'null';
      const result = validator.validateFormat(nullYaml, 'test.yaml');
      
      expect(result.valid).toBe(false);
      expect(result.hardErrors[0].code).toBe(ErrorCodes.YAML_INVALID);
    });

    it('应该拒绝纯字符串内容', () => {
      const stringYaml = 'just a string';
      const result = validator.validateFormat(stringYaml, 'test.yaml');
      
      expect(result.valid).toBe(false);
      expect(result.hardErrors[0].code).toBe(ErrorCodes.YAML_INVALID);
    });
  });

  describe('template 字段验证', () => {
    it('应该拒绝缺少 template 字段的文件', () => {
      const yaml = `
id: char-test
name:
  zh: 测试角色
`;
      const result = validator.validateFormat(yaml, 'test.yaml');
      
      expect(result.valid).toBe(false);
      expect(result.hardErrors).toHaveLength(1);
      expect(result.hardErrors[0].code).toBe(ErrorCodes.TEMPLATE_MISSING);
      expect(result.hardErrors[0].location.field).toBe('template');
    });

    it('应该拒绝无效的 template 值', () => {
      const yaml = `
template: invalid_category
id: test-123
`;
      const result = validator.validateFormat(yaml, 'test.yaml');
      
      expect(result.valid).toBe(false);
      expect(result.hardErrors).toHaveLength(1);
      expect(result.hardErrors[0].code).toBe(ErrorCodes.TEMPLATE_UNKNOWN);
      expect(result.hardErrors[0].message.zh).toContain('invalid_category');
      expect(result.hardErrors[0].message.zh).toContain(CATEGORIES.join(', '));
    });

    it('应该接受所有有效的 Category 值', () => {
      for (const category of CATEGORIES) {
        const prefix = ID_PREFIXES[category].split('-')[0];
        const yaml = `
template: ${category}
id: ${prefix}-test
`;
        const result = validator.validateFormat(yaml, 'test.yaml');
        
        // 验证 template 字段被接受（可能因为 id 格式问题失败，但不应该是 TEMPLATE_UNKNOWN）
        const templateError = result.hardErrors.find(e => e.code === ErrorCodes.TEMPLATE_UNKNOWN);
        expect(templateError).toBeUndefined();
      }
    });
  });

  describe('id 字段验证', () => {
    it('应该拒绝缺少 id 字段的文件', () => {
      const yaml = `
template: character
name:
  zh: 测试角色
`;
      const result = validator.validateFormat(yaml, 'test.yaml');
      
      expect(result.valid).toBe(false);
      expect(result.hardErrors).toHaveLength(1);
      expect(result.hardErrors[0].code).toBe(ErrorCodes.FIELD_REQUIRED);
      expect(result.hardErrors[0].location.field).toBe('id');
    });

    it('应该拒绝非字符串类型的 id', () => {
      const yaml = `
template: character
id: 12345
`;
      const result = validator.validateFormat(yaml, 'test.yaml');
      
      expect(result.valid).toBe(false);
      expect(result.hardErrors).toHaveLength(1);
      expect(result.hardErrors[0].code).toBe(ErrorCodes.FIELD_REQUIRED);
      expect(result.hardErrors[0].message.zh).toContain('字符串');
    });

    it('应该拒绝格式不正确的 character id', () => {
      const yaml = `
template: character
id: invalid-id
`;
      const result = validator.validateFormat(yaml, 'test.yaml');
      
      expect(result.valid).toBe(false);
      expect(result.hardErrors).toHaveLength(1);
      expect(result.hardErrors[0].code).toBe(ErrorCodes.CONSTRAINT_REGEX);
      expect(result.hardErrors[0].message.zh).toContain('char-<name>');
    });

    it('应该拒绝格式不正确的 race id', () => {
      const yaml = `
template: race
id: char-wrong-prefix
`;
      const result = validator.validateFormat(yaml, 'test.yaml');
      
      expect(result.valid).toBe(false);
      expect(result.hardErrors[0].code).toBe(ErrorCodes.CONSTRAINT_REGEX);
      expect(result.hardErrors[0].message.zh).toContain('race-<name>');
    });

    it('应该拒绝格式不正确的 location id', () => {
      const yaml = `
template: location
id: location-wrong
`;
      const result = validator.validateFormat(yaml, 'test.yaml');
      
      expect(result.valid).toBe(false);
      expect(result.hardErrors[0].code).toBe(ErrorCodes.CONSTRAINT_REGEX);
      expect(result.hardErrors[0].message.zh).toContain('loc-<name>');
    });

    it('应该拒绝格式不正确的 history id', () => {
      const yaml = `
template: history
id: history-wrong
`;
      const result = validator.validateFormat(yaml, 'test.yaml');
      
      expect(result.valid).toBe(false);
      expect(result.hardErrors[0].code).toBe(ErrorCodes.CONSTRAINT_REGEX);
      expect(result.hardErrors[0].message.zh).toContain('event-<name>');
    });

    it('应该拒绝包含大写字母的 id', () => {
      const yaml = `
template: character
id: char-TestName
`;
      const result = validator.validateFormat(yaml, 'test.yaml');
      
      expect(result.valid).toBe(false);
      expect(result.hardErrors[0].code).toBe(ErrorCodes.CONSTRAINT_REGEX);
    });

    it('应该拒绝包含特殊字符的 id', () => {
      const yaml = `
template: character
id: char-test_name
`;
      const result = validator.validateFormat(yaml, 'test.yaml');
      
      expect(result.valid).toBe(false);
      expect(result.hardErrors[0].code).toBe(ErrorCodes.CONSTRAINT_REGEX);
    });
  });

  describe('有效 Submission 验证', () => {
    it('应该接受有效的 character submission', () => {
      const yaml = `
template: character
id: char-nu-wa
name:
  zh: 女娲
`;
      const result = validator.validateFormat(yaml, 'test.yaml');
      
      expect(result.valid).toBe(true);
      expect(result.hardErrors).toHaveLength(0);
    });

    it('应该接受有效的 race submission', () => {
      const yaml = `
template: race
id: race-shen-zu
name:
  zh: 神族
`;
      const result = validator.validateFormat(yaml, 'test.yaml');
      
      expect(result.valid).toBe(true);
      expect(result.hardErrors).toHaveLength(0);
    });

    it('应该接受有效的 location submission', () => {
      const yaml = `
template: location
id: loc-kun-lun
name:
  zh: 昆仑山
`;
      const result = validator.validateFormat(yaml, 'test.yaml');
      
      expect(result.valid).toBe(true);
      expect(result.hardErrors).toHaveLength(0);
    });

    it('应该接受有效的 history submission', () => {
      const yaml = `
template: history
id: event-creation
name:
  zh: 创世
`;
      const result = validator.validateFormat(yaml, 'test.yaml');
      
      expect(result.valid).toBe(true);
      expect(result.hardErrors).toHaveLength(0);
    });

    it('应该接受带有数字的 id', () => {
      const yaml = `
template: character
id: char-hero-01
name:
  zh: 英雄一号
`;
      const result = validator.validateFormat(yaml, 'test.yaml');
      
      expect(result.valid).toBe(true);
    });

    it('应该接受带有多个连字符的 id', () => {
      const yaml = `
template: character
id: char-great-hero-of-the-north
name:
  zh: 北方大英雄
`;
      const result = validator.validateFormat(yaml, 'test.yaml');
      
      expect(result.valid).toBe(true);
    });
  });

  describe('parseAndValidate', () => {
    it('应该返回解析后的 submission 数据', () => {
      const yaml = `
template: character
id: char-test
name:
  zh: 测试
extra_field: value
`;
      const { result, submission } = validator.parseAndValidate(yaml, 'test.yaml');
      
      expect(result.valid).toBe(true);
      expect(submission).not.toBeNull();
      expect(submission?.template).toBe('character');
      expect(submission?.id).toBe('char-test');
      expect(submission?.data['name']).toEqual({ zh: '测试' });
      expect(submission?.data['extra_field']).toBe('value');
    });

    it('验证失败时应该返回 null submission', () => {
      const yaml = `
template: invalid
id: test
`;
      const { result, submission } = validator.parseAndValidate(yaml, 'test.yaml');
      
      expect(result.valid).toBe(false);
      expect(submission).toBeNull();
    });
  });

  describe('便捷函数', () => {
    it('validateYamlFormat 应该正常工作', () => {
      const yaml = `
template: character
id: char-test
`;
      const result = validateYamlFormat(yaml, 'test.yaml');
      
      expect(result.valid).toBe(true);
    });

    it('parseSubmission 应该正常工作', () => {
      const yaml = `
template: race
id: race-test
`;
      const { result, submission } = parseSubmission(yaml, 'test.yaml');
      
      expect(result.valid).toBe(true);
      expect(submission?.template).toBe('race');
    });
  });

  describe('ID_PATTERNS', () => {
    it('应该为所有 Category 定义 ID 模式', () => {
      for (const category of CATEGORIES) {
        expect(ID_PATTERNS[category]).toBeDefined();
        expect(ID_PATTERNS[category]).toBeInstanceOf(RegExp);
      }
    });
  });

  describe('ID_PREFIXES', () => {
    it('应该为所有 Category 定义 ID 前缀', () => {
      for (const category of CATEGORIES) {
        expect(ID_PREFIXES[category]).toBeDefined();
        expect(typeof ID_PREFIXES[category]).toBe('string');
      }
    });
  });

  describe('所有 Category 的 ID 格式验证', () => {
    const testCases: Array<{ category: string; validId: string; invalidId: string }> = [
      { category: 'character', validId: 'char-test', invalidId: 'character-test' },
      { category: 'race', validId: 'race-test', invalidId: 'char-test' },
      { category: 'creature', validId: 'creature-test', invalidId: 'animal-test' },
      { category: 'flora', validId: 'flora-test', invalidId: 'plant-test' },
      { category: 'location', validId: 'loc-test', invalidId: 'location-test' },
      { category: 'history', validId: 'event-test', invalidId: 'history-test' },
      { category: 'faction', validId: 'faction-test', invalidId: 'group-test' },
      { category: 'artifact', validId: 'artifact-test', invalidId: 'item-test' },
      { category: 'concept', validId: 'concept-test', invalidId: 'idea-test' },
    ];

    for (const { category, validId, invalidId } of testCases) {
      it(`应该接受有效的 ${category} id: ${validId}`, () => {
        const yaml = `
template: ${category}
id: ${validId}
`;
        const result = validator.validateFormat(yaml, 'test.yaml');
        expect(result.valid).toBe(true);
      });

      it(`应该拒绝无效的 ${category} id: ${invalidId}`, () => {
        const yaml = `
template: ${category}
id: ${invalidId}
`;
        const result = validator.validateFormat(yaml, 'test.yaml');
        expect(result.valid).toBe(false);
        expect(result.hardErrors[0].code).toBe(ErrorCodes.CONSTRAINT_REGEX);
      });
    }
  });
});

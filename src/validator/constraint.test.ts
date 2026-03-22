/**
 * Constraint Validator Tests
 * 约束条件验证器单元测试
 * 
 * **Validates: Requirements 3.5**
 */

import { describe, it, expect } from 'vitest';
import {
  validateRegexConstraint,
  validateEnumConstraint,
  validateRangeConstraint,
  validateFieldConstraints,
  validateConstraints,
  getConstraintViolations,
} from './constraint.js';
import type { TemplateDefinition, Category, FieldType, FieldDefinition, FieldConstraint } from '../types/index.js';
import { ErrorCodes } from '../types/index.js';

function createFieldDef(
  name: string,
  type: FieldType,
  constraints?: FieldConstraint[]
): FieldDefinition {
  return {
    name,
    type,
    description: { zh: name + ' 字段', en: name + ' field' },
    constraints,
  };
}

function createTestTemplate(
  requiredFields: Array<{ name: string; type: FieldType; constraints?: FieldConstraint[] }>,
  optionalFields: Array<{ name: string; type: FieldType; constraints?: FieldConstraint[] }> = []
): TemplateDefinition {
  return {
    category: 'character' as Category,
    description: { zh: '测试模板', en: 'Test template' },
    required: requiredFields.map(f => createFieldDef(f.name, f.type, f.constraints)),
    optional: optionalFields.map(f => createFieldDef(f.name, f.type, f.constraints)),
  };
}

function createRegexConstraint(pattern: string, errorCode?: string): FieldConstraint {
  return {
    type: 'regex',
    value: pattern,
    errorCode: errorCode || ErrorCodes.CONSTRAINT_REGEX,
    errorMessage: {
      zh: '不满足正则表达式: ' + pattern,
      en: 'Does not match regex: ' + pattern,
    },
  };
}

function createEnumConstraint(values: string[], errorCode?: string): FieldConstraint {
  return {
    type: 'enum',
    value: values,
    errorCode: errorCode || ErrorCodes.CONSTRAINT_ENUM,
    errorMessage: {
      zh: '值必须是以下之一: ' + values.join(', '),
      en: 'Value must be one of: ' + values.join(', '),
    },
  };
}

function createRangeConstraint(min?: number, max?: number, errorCode?: string): FieldConstraint {
  return {
    type: 'range',
    value: { min, max },
    errorCode: errorCode || ErrorCodes.CONSTRAINT_RANGE,
    errorMessage: {
      zh: '值必须在范围内',
      en: 'Value must be in range',
    },
  };
}

describe('validateRegexConstraint', () => {
  it('应匹配简单字符串模式', () => {
    expect(validateRegexConstraint('hello', 'hello')).toBe(true);
  });

  it('应匹配 ID 格式模式', () => {
    expect(validateRegexConstraint('char-test-123', '^char-[a-z0-9-]+$')).toBe(true);
  });

  it('应拒绝不匹配的字符串', () => {
    expect(validateRegexConstraint('CHAR-test', '^char-[a-z0-9-]+$')).toBe(false);
  });

  it('应拒绝非字符串值', () => {
    expect(validateRegexConstraint(123, '^[0-9]+$')).toBe(false);
    expect(validateRegexConstraint(null, '.*')).toBe(false);
  });
});

describe('validateEnumConstraint', () => {
  it('应接受在枚举列表中的值', () => {
    expect(validateEnumConstraint('official', ['official', 'secondary'])).toBe(true);
  });

  it('应拒绝不在枚举列表中的值', () => {
    expect(validateEnumConstraint('invalid', ['official', 'secondary'])).toBe(false);
  });

  it('应拒绝非字符串值', () => {
    expect(validateEnumConstraint(1, ['1', '2', '3'])).toBe(false);
  });
});

describe('validateRangeConstraint', () => {
  it('应接受在范围内的值', () => {
    expect(validateRangeConstraint(5, { min: 1, max: 10 })).toBe(true);
  });

  it('应拒绝小于最小值的值', () => {
    expect(validateRangeConstraint(0, { min: 1, max: 10 })).toBe(false);
  });

  it('应拒绝大于最大值的值', () => {
    expect(validateRangeConstraint(11, { min: 1, max: 10 })).toBe(false);
  });

  it('应拒绝非数字值', () => {
    expect(validateRangeConstraint('5', { min: 1, max: 10 })).toBe(false);
  });
});

describe('validateFieldConstraints', () => {
  it('应返回空数组当所有约束都满足时', () => {
    const constraints: FieldConstraint[] = [createRegexConstraint('^char-[a-z0-9-]+$')];
    const violations = validateFieldConstraints('char-test', constraints);
    expect(violations).toHaveLength(0);
  });

  it('应返回违反的约束列表', () => {
    const constraints: FieldConstraint[] = [createRegexConstraint('^char-[a-z0-9-]+$')];
    const violations = validateFieldConstraints('invalid-id', constraints);
    expect(violations).toHaveLength(1);
  });

  it('应跳过 ref_exists 约束', () => {
    const constraints: FieldConstraint[] = [{
      type: 'ref_exists',
      value: 'race',
      errorCode: 'ERR_REF_MISSING',
      errorMessage: { zh: '引用不存在', en: 'Reference not found' },
    }];
    const violations = validateFieldConstraints('race-unknown', constraints);
    expect(violations).toHaveLength(0);
  });
});

describe('validateConstraints', () => {
  it('应返回 valid: true 当所有约束都满足时', () => {
    const template = createTestTemplate([
      { name: 'id', type: 'string', constraints: [createRegexConstraint('^char-[a-z0-9-]+$')] },
    ]);
    const submission = { template: 'character', id: 'char-test' };
    const result = validateConstraints(submission, template, 'test.yaml');
    expect(result.valid).toBe(true);
  });

  it('应返回正则约束错误', () => {
    const template = createTestTemplate([
      { name: 'id', type: 'string', constraints: [createRegexConstraint('^char-[a-z0-9-]+$', 'ERR_INVALID_ID')] },
    ]);
    const submission = { template: 'character', id: 'INVALID-ID' };
    const result = validateConstraints(submission, template, 'test.yaml');
    expect(result.valid).toBe(false);
    expect(result.hardErrors[0].code).toBe('ERR_INVALID_ID');
  });

  it('应返回枚举约束错误', () => {
    const template = createTestTemplate([
      { name: 'priority', type: 'string', constraints: [createEnumConstraint(['official', 'secondary'], 'ERR_INVALID_PRIORITY')] },
    ]);
    const submission = { template: 'character', priority: 'invalid' };
    const result = validateConstraints(submission, template, 'test.yaml');
    expect(result.valid).toBe(false);
    expect(result.hardErrors[0].code).toBe('ERR_INVALID_PRIORITY');
  });

  it('应返回范围约束错误', () => {
    const template = createTestTemplate([
      { name: 'year', type: 'integer', constraints: [createRangeConstraint(1, undefined, 'ERR_INVALID_YEAR')] },
    ]);
    const submission = { template: 'character', year: 0 };
    const result = validateConstraints(submission, template, 'test.yaml');
    expect(result.valid).toBe(false);
    expect(result.hardErrors[0].code).toBe('ERR_INVALID_YEAR');
  });

  it('应跳过 null 值', () => {
    const template = createTestTemplate([
      { name: 'id', type: 'string', constraints: [createRegexConstraint('^char-[a-z0-9-]+$')] },
    ]);
    const submission = { template: 'character', id: null };
    const result = validateConstraints(submission, template, 'test.yaml');
    expect(result.valid).toBe(true);
  });
});

describe('getConstraintViolations', () => {
  it('应返回所有违反约束的字段信息', () => {
    const template = createTestTemplate([
      { name: 'id', type: 'string', constraints: [createRegexConstraint('^char-[a-z0-9-]+$')] },
      { name: 'priority', type: 'string', constraints: [createEnumConstraint(['official', 'secondary'])] },
    ]);
    const submission = { template: 'character', id: 'INVALID', priority: 'invalid' };
    const violations = getConstraintViolations(submission, template);
    expect(violations).toHaveLength(2);
  });

  it('当所有约束都满足时应返回空数组', () => {
    const template = createTestTemplate([
      { name: 'id', type: 'string', constraints: [createRegexConstraint('^char-[a-z0-9-]+$')] },
    ]);
    const submission = { template: 'character', id: 'char-test' };
    const violations = getConstraintViolations(submission, template);
    expect(violations).toEqual([]);
  });
});

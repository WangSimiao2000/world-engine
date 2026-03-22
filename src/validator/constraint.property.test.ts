/**
 * Constraint Validator Property-Based Tests
 * 约束条件验证器属性测试
 * 
 * Feature: initialize, Property 8: 约束条件验证
 * **Validates: Requirements 3.5**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  validateRegexConstraint,
  validateEnumConstraint,
  validateRangeConstraint,
  validateFieldConstraints,
  validateConstraints,
  getConstraintViolations,
} from './constraint.js';
import type { TemplateDefinition, FieldType, FieldDefinition, FieldConstraint, Category } from '../types/index.js';
import { CATEGORIES, ErrorCodes } from '../types/index.js';

// ============================================================================
// Arbitraries - 数据生成器
// ============================================================================

/**
 * Arbitrary: Generate a random category
 */
const categoryArb = fc.constantFrom(...CATEGORIES);

/**
 * Arbitrary: Generate a valid field name (alphanumeric with underscores)
 */
const fieldNameArb = fc.stringMatching(/^[a-z][a-z_]{1,19}$/);

/**
 * Arbitrary: Generate a list of unique field names
 */
const uniqueFieldNamesArb = (minLength: number, maxLength: number): fc.Arbitrary<string[]> =>
  fc.array(fieldNameArb, { minLength: Math.max(minLength, 1), maxLength: maxLength + 2 })
    .map((names) => [...new Set(names)])
    .filter((names) => names.length >= minLength);

/**
 * Arbitrary: Generate a file path
 */
const filePathArb = fc.stringMatching(/^submissions\/[a-z]+\/[a-z0-9-]+\.yaml$/);


/**
 * Arbitrary: Generate a valid regex pattern
 */
const validRegexPatternArb = fc.constantFrom(
  '^[a-z]+$',
  '^[a-z0-9-]+$',
  '^char-[a-z0-9-]+$',
  '^race-[a-z0-9-]+$',
  '^epoch-[0-9]+$',
  '^[A-Z][a-z]+$',
  '.*',
  '^\\d+$'
);

/**
 * Arbitrary: Generate a string that matches a given regex pattern
 */
const stringMatchingPatternArb = (pattern: string): fc.Arbitrary<string> => {
  switch (pattern) {
    case '^[a-z]+$':
      return fc.stringMatching(/^[a-z]{1,20}$/);
    case '^[a-z0-9-]+$':
      return fc.stringMatching(/^[a-z0-9-]{1,20}$/);
    case '^char-[a-z0-9-]+$':
      return fc.stringMatching(/^char-[a-z0-9-]{1,15}$/);
    case '^race-[a-z0-9-]+$':
      return fc.stringMatching(/^race-[a-z0-9-]{1,15}$/);
    case '^epoch-[0-9]+$':
      return fc.stringMatching(/^epoch-[0-9]{1,5}$/);
    case '^[A-Z][a-z]+$':
      return fc.stringMatching(/^[A-Z][a-z]{1,15}$/);
    case '.*':
      return fc.string({ minLength: 0, maxLength: 20 });
    case '^\\d+$':
      return fc.stringMatching(/^[0-9]{1,10}$/);
    default:
      return fc.string({ minLength: 1, maxLength: 20 });
  }
};

/**
 * Arbitrary: Generate a string that does NOT match a given regex pattern
 */
const stringNotMatchingPatternArb = (pattern: string): fc.Arbitrary<string> => {
  switch (pattern) {
    case '^[a-z]+$':
      return fc.oneof(
        fc.stringMatching(/^[A-Z][a-z]*$/),
        fc.stringMatching(/^[a-z]*[0-9]+[a-z]*$/),
        fc.constant('123'),
        fc.constant('ABC')
      );
    case '^[a-z0-9-]+$':
      return fc.oneof(
        fc.stringMatching(/^[A-Z][a-z0-9-]*$/),
        fc.constant('test_underscore'),
        fc.constant('Test!')
      );
    case '^char-[a-z0-9-]+$':
      return fc.oneof(
        fc.constant('race-test'),
        fc.constant('CHAR-test'),
        fc.constant('character-test'),
        fc.constant('test')
      );
    case '^race-[a-z0-9-]+$':
      return fc.oneof(
        fc.constant('char-test'),
        fc.constant('RACE-test'),
        fc.constant('races-test'),
        fc.constant('test')
      );
    case '^epoch-[0-9]+$':
      return fc.oneof(
        fc.constant('epoch-abc'),
        fc.constant('EPOCH-01'),
        fc.constant('era-01'),
        fc.constant('01')
      );
    case '^[A-Z][a-z]+$':
      return fc.oneof(
        fc.constant('lowercase'),
        fc.constant('ALLCAPS'),
        fc.constant('123'),
        fc.constant('a')
      );
    case '.*':
      // '.*' matches everything, so we return empty string which still matches
      // Instead, return a non-string type scenario (handled elsewhere)
      return fc.constant(''); // This will actually match, but we handle non-string separately
    case '^\\d+$':
      return fc.oneof(
        fc.constant('abc'),
        fc.constant('12a34'),
        fc.constant('-123'),
        fc.constant('12.34')
      );
    default:
      return fc.constant('INVALID_VALUE');
  }
};


/**
 * Arbitrary: Generate a list of enum values
 */
const enumValuesArb = fc.array(
  fc.stringMatching(/^[a-z][a-z_]{0,14}$/),
  { minLength: 2, maxLength: 6 }
).map((values) => [...new Set(values)]).filter((values) => values.length >= 2);

/**
 * Arbitrary: Generate a value that is in the enum list
 */
const valueInEnumArb = (enumValues: string[]): fc.Arbitrary<string> =>
  fc.constantFrom(...enumValues);

/**
 * Arbitrary: Generate a value that is NOT in the enum list
 */
const valueNotInEnumArb = (enumValues: string[]): fc.Arbitrary<string> =>
  fc.string({ minLength: 1, maxLength: 20 })
    .filter((v) => !enumValues.includes(v));

/**
 * Arbitrary: Generate a range constraint with min and/or max
 */
const rangeConstraintArb = fc.oneof(
  fc.record({ min: fc.integer({ min: -1000, max: 1000 }) }),
  fc.record({ max: fc.integer({ min: -1000, max: 1000 }) }),
  fc.tuple(
    fc.integer({ min: -1000, max: 500 }),
    fc.integer({ min: 0, max: 1000 })
  ).filter(([min, max]) => min < max).map(([min, max]) => ({ min, max }))
);

/**
 * Arbitrary: Generate a number within a given range
 */
const numberInRangeArb = (range: { min?: number; max?: number }): fc.Arbitrary<number> => {
  const min = range.min ?? -10000;
  const max = range.max ?? 10000;
  return fc.integer({ min, max });
};

/**
 * Arbitrary: Generate a number outside a given range
 */
const numberOutOfRangeArb = (range: { min?: number; max?: number }): fc.Arbitrary<number> => {
  if (range.min !== undefined && range.max !== undefined) {
    return fc.oneof(
      fc.integer({ min: range.min - 1000, max: range.min - 1 }),
      fc.integer({ min: range.max + 1, max: range.max + 1000 })
    );
  } else if (range.min !== undefined) {
    return fc.integer({ min: range.min - 1000, max: range.min - 1 });
  } else if (range.max !== undefined) {
    return fc.integer({ min: range.max + 1, max: range.max + 1000 });
  }
  // Should not reach here
  return fc.integer();
};


// ============================================================================
// Helper Functions - 辅助函数
// ============================================================================

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
  category: Category,
  requiredFields: FieldDefinition[],
  optionalFields: FieldDefinition[] = []
): TemplateDefinition {
  return {
    category,
    description: { zh: '测试模板', en: 'Test template' },
    required: requiredFields,
    optional: optionalFields,
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

function createRangeConstraint(range: { min?: number; max?: number }, errorCode?: string): FieldConstraint {
  return {
    type: 'range',
    value: range,
    errorCode: errorCode || ErrorCodes.CONSTRAINT_RANGE,
    errorMessage: {
      zh: '值必须在范围内',
      en: 'Value must be in range',
    },
  };
}


// ============================================================================
// Property Tests - 属性测试
// ============================================================================

describe('Feature: initialize, Property 8: 约束条件验证', () => {
  /**
   * Property 8.1: Regex constraint - valid values should pass
   * 
   * For any string value that matches the regex pattern,
   * validateRegexConstraint should return true.
   */
  it('should pass regex validation when value matches pattern', () => {
    fc.assert(
      fc.property(
        validRegexPatternArb,
        (pattern) => {
          const validValue = fc.sample(stringMatchingPatternArb(pattern), 1)[0];
          const result = validateRegexConstraint(validValue, pattern);
          expect(result).toBe(true);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8.2: Regex constraint - invalid values should fail
   * 
   * For any string value that does NOT match the regex pattern,
   * validateRegexConstraint should return false.
   */
  it('should fail regex validation when value does not match pattern', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          '^[a-z]+$',
          '^char-[a-z0-9-]+$',
          '^race-[a-z0-9-]+$',
          '^epoch-[0-9]+$',
          '^[A-Z][a-z]+$',
          '^\\d+$'
        ),
        (pattern) => {
          const invalidValue = fc.sample(stringNotMatchingPatternArb(pattern), 1)[0];
          const result = validateRegexConstraint(invalidValue, pattern);
          expect(result).toBe(false);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8.3: Regex constraint - non-string values should fail
   * 
   * For any non-string value, validateRegexConstraint should return false.
   */
  it('should fail regex validation for non-string values', () => {
    fc.assert(
      fc.property(
        validRegexPatternArb,
        fc.oneof(
          fc.integer(),
          fc.boolean(),
          fc.constant(null),
          fc.constant(undefined),
          fc.array(fc.string()),
          fc.record({ key: fc.string() })
        ),
        (pattern, nonStringValue) => {
          const result = validateRegexConstraint(nonStringValue, pattern);
          expect(result).toBe(false);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });


  /**
   * Property 8.4: Enum constraint - valid values should pass
   * 
   * For any value that is in the allowed enum list,
   * validateEnumConstraint should return true.
   */
  it('should pass enum validation when value is in allowed list', () => {
    fc.assert(
      fc.property(
        enumValuesArb,
        (enumValues) => {
          const validValue = fc.sample(valueInEnumArb(enumValues), 1)[0];
          const result = validateEnumConstraint(validValue, enumValues);
          expect(result).toBe(true);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8.5: Enum constraint - invalid values should fail
   * 
   * For any value that is NOT in the allowed enum list,
   * validateEnumConstraint should return false.
   */
  it('should fail enum validation when value is not in allowed list', () => {
    fc.assert(
      fc.property(
        enumValuesArb,
        (enumValues) => {
          const invalidValue = fc.sample(valueNotInEnumArb(enumValues), 1)[0];
          const result = validateEnumConstraint(invalidValue, enumValues);
          expect(result).toBe(false);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8.6: Enum constraint - non-string values should fail
   * 
   * For any non-string value, validateEnumConstraint should return false.
   */
  it('should fail enum validation for non-string values', () => {
    fc.assert(
      fc.property(
        enumValuesArb,
        fc.oneof(
          fc.integer(),
          fc.boolean(),
          fc.constant(null),
          fc.constant(undefined),
          fc.array(fc.string())
        ),
        (enumValues, nonStringValue) => {
          const result = validateEnumConstraint(nonStringValue, enumValues);
          expect(result).toBe(false);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });


  /**
   * Property 8.7: Range constraint - valid values should pass
   * 
   * For any numeric value within the specified range,
   * validateRangeConstraint should return true.
   */
  it('should pass range validation when value is within range', () => {
    fc.assert(
      fc.property(
        rangeConstraintArb,
        (range) => {
          const validValue = fc.sample(numberInRangeArb(range), 1)[0];
          const result = validateRangeConstraint(validValue, range);
          expect(result).toBe(true);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8.8: Range constraint - values below min should fail
   * 
   * For any numeric value below the minimum,
   * validateRangeConstraint should return false.
   */
  it('should fail range validation when value is below minimum', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -500, max: 500 }),
        fc.integer({ min: 1, max: 100 }),
        (min, offset) => {
          const range = { min };
          const invalidValue = min - offset;
          const result = validateRangeConstraint(invalidValue, range);
          expect(result).toBe(false);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8.9: Range constraint - values above max should fail
   * 
   * For any numeric value above the maximum,
   * validateRangeConstraint should return false.
   */
  it('should fail range validation when value is above maximum', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -500, max: 500 }),
        fc.integer({ min: 1, max: 100 }),
        (max, offset) => {
          const range = { max };
          const invalidValue = max + offset;
          const result = validateRangeConstraint(invalidValue, range);
          expect(result).toBe(false);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8.10: Range constraint - non-numeric values should fail
   * 
   * For any non-numeric value, validateRangeConstraint should return false.
   */
  it('should fail range validation for non-numeric values', () => {
    fc.assert(
      fc.property(
        rangeConstraintArb,
        fc.oneof(
          fc.string(),
          fc.boolean(),
          fc.constant(null),
          fc.constant(undefined),
          fc.array(fc.integer())
        ),
        (range, nonNumericValue) => {
          const result = validateRangeConstraint(nonNumericValue, range);
          expect(result).toBe(false);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });


  /**
   * Property 8.11: validateFieldConstraints should return empty array for valid values
   * 
   * For any field value that satisfies all constraints,
   * validateFieldConstraints should return an empty violations array.
   */
  it('should return empty violations when all constraints are satisfied', () => {
    fc.assert(
      fc.property(
        validRegexPatternArb,
        (pattern) => {
          const constraints: FieldConstraint[] = [createRegexConstraint(pattern)];
          const validValue = fc.sample(stringMatchingPatternArb(pattern), 1)[0];
          const violations = validateFieldConstraints(validValue, constraints);
          expect(violations).toHaveLength(0);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8.12: validateFieldConstraints should return violated constraints
   * 
   * For any field value that violates a constraint,
   * validateFieldConstraints should return the violated constraint.
   */
  it('should return violated constraints when value fails validation', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          '^[a-z]+$',
          '^char-[a-z0-9-]+$',
          '^epoch-[0-9]+$'
        ),
        (pattern) => {
          const constraints: FieldConstraint[] = [createRegexConstraint(pattern)];
          const invalidValue = fc.sample(stringNotMatchingPatternArb(pattern), 1)[0];
          const violations = validateFieldConstraints(invalidValue, constraints);
          expect(violations).toHaveLength(1);
          expect(violations[0].type).toBe('regex');
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8.13: validateFieldConstraints should skip ref_exists constraints
   * 
   * ref_exists constraints should be handled by cross-validator,
   * so validateFieldConstraints should skip them.
   */
  it('should skip ref_exists constraints', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }),
        (value) => {
          const constraints: FieldConstraint[] = [{
            type: 'ref_exists',
            value: 'race',
            errorCode: 'ERR_REF_MISSING',
            errorMessage: { zh: '引用不存在', en: 'Reference not found' },
          }];
          const violations = validateFieldConstraints(value, constraints);
          expect(violations).toHaveLength(0);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });


  /**
   * Property 8.14: validateConstraints should return valid=true when all constraints pass
   * 
   * For any Submission where all field values satisfy their constraints,
   * validateConstraints should return valid=true with no hard errors.
   */
  it('should return valid=true when all constraints are satisfied', () => {
    fc.assert(
      fc.property(
        categoryArb,
        fieldNameArb,
        validRegexPatternArb,
        filePathArb,
        (category, fieldName, pattern) => {
          const fieldDef = createFieldDef(fieldName, 'string', [createRegexConstraint(pattern)]);
          const template = createTestTemplate(category, [fieldDef]);
          const validValue = fc.sample(stringMatchingPatternArb(pattern), 1)[0];
          const submission = { template: category, id: 'test-id', [fieldName]: validValue };
          
          const result = validateConstraints(submission, template, 'test.yaml');
          
          expect(result.valid).toBe(true);
          expect(result.hardErrors).toHaveLength(0);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8.15: validateConstraints should return hard error with correct error code for regex violation
   * 
   * For any Submission where a field value violates a regex constraint,
   * the error should have the correct error code (ERR_CONSTRAINT_REGEX or custom).
   */
  it('should return ERR_CONSTRAINT_REGEX for regex violations', () => {
    fc.assert(
      fc.property(
        categoryArb,
        fieldNameArb,
        fc.constantFrom('^[a-z]+$', '^char-[a-z0-9-]+$', '^epoch-[0-9]+$'),
        filePathArb,
        (category, fieldName, pattern) => {
          const fieldDef = createFieldDef(fieldName, 'string', [createRegexConstraint(pattern)]);
          const template = createTestTemplate(category, [fieldDef]);
          const invalidValue = fc.sample(stringNotMatchingPatternArb(pattern), 1)[0];
          const submission = { template: category, id: 'test-id', [fieldName]: invalidValue };
          
          const result = validateConstraints(submission, template, 'test.yaml');
          
          expect(result.valid).toBe(false);
          expect(result.hardErrors.length).toBeGreaterThan(0);
          expect(result.hardErrors[0].code).toBe(ErrorCodes.CONSTRAINT_REGEX);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });


  /**
   * Property 8.16: validateConstraints should return hard error with correct error code for enum violation
   * 
   * For any Submission where a field value violates an enum constraint,
   * the error should have the correct error code (ERR_CONSTRAINT_ENUM or custom).
   */
  it('should return ERR_CONSTRAINT_ENUM for enum violations', () => {
    fc.assert(
      fc.property(
        categoryArb,
        fieldNameArb,
        enumValuesArb,
        filePathArb,
        (category, fieldName, enumValues) => {
          const fieldDef = createFieldDef(fieldName, 'string', [createEnumConstraint(enumValues)]);
          const template = createTestTemplate(category, [fieldDef]);
          const invalidValue = fc.sample(valueNotInEnumArb(enumValues), 1)[0];
          const submission = { template: category, id: 'test-id', [fieldName]: invalidValue };
          
          const result = validateConstraints(submission, template, 'test.yaml');
          
          expect(result.valid).toBe(false);
          expect(result.hardErrors.length).toBeGreaterThan(0);
          expect(result.hardErrors[0].code).toBe(ErrorCodes.CONSTRAINT_ENUM);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8.17: validateConstraints should return hard error with correct error code for range violation
   * 
   * For any Submission where a field value violates a range constraint,
   * the error should have the correct error code (ERR_CONSTRAINT_RANGE or custom).
   */
  it('should return ERR_CONSTRAINT_RANGE for range violations', () => {
    fc.assert(
      fc.property(
        categoryArb,
        fieldNameArb,
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 1, max: 50 }),
        filePathArb,
        (category, fieldName, min, offset) => {
          const range = { min };
          const fieldDef = createFieldDef(fieldName, 'integer', [createRangeConstraint(range)]);
          const template = createTestTemplate(category, [fieldDef]);
          const invalidValue = min - offset;
          const submission = { template: category, id: 'test-id', [fieldName]: invalidValue };
          
          const result = validateConstraints(submission, template, 'test.yaml');
          
          expect(result.valid).toBe(false);
          expect(result.hardErrors.length).toBeGreaterThan(0);
          expect(result.hardErrors[0].code).toBe(ErrorCodes.CONSTRAINT_RANGE);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });


  /**
   * Property 8.18: Error message should describe the constraint violation
   * 
   * For any constraint violation, the error message should contain
   * information about the specific constraint that was violated.
   */
  it('should include constraint description in error message', () => {
    fc.assert(
      fc.property(
        categoryArb,
        fieldNameArb,
        enumValuesArb,
        filePathArb,
        (category, fieldName, enumValues) => {
          const fieldDef = createFieldDef(fieldName, 'string', [createEnumConstraint(enumValues)]);
          const template = createTestTemplate(category, [fieldDef]);
          const invalidValue = fc.sample(valueNotInEnumArb(enumValues), 1)[0];
          const submission = { template: category, id: 'test-id', [fieldName]: invalidValue };
          
          const result = validateConstraints(submission, template, 'test.yaml');
          
          expect(result.valid).toBe(false);
          const error = result.hardErrors[0];
          
          // Error message should exist in both languages
          expect(error.message.zh).toBeDefined();
          expect(error.message.en).toBeDefined();
          expect(error.message.zh.length).toBeGreaterThan(0);
          expect(error.message.en.length).toBeGreaterThan(0);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8.19: Error location should include file path and field name
   * 
   * For any constraint violation, the error location should include
   * the file path and the field name that violated the constraint.
   */
  it('should include file path and field name in error location', () => {
    fc.assert(
      fc.property(
        categoryArb,
        fieldNameArb,
        fc.constantFrom('^[a-z]+$', '^char-[a-z0-9-]+$'),
        filePathArb,
        (category, fieldName, pattern, filePath) => {
          const fieldDef = createFieldDef(fieldName, 'string', [createRegexConstraint(pattern)]);
          const template = createTestTemplate(category, [fieldDef]);
          const invalidValue = fc.sample(stringNotMatchingPatternArb(pattern), 1)[0];
          const submission = { template: category, id: 'test-id', [fieldName]: invalidValue };
          
          const result = validateConstraints(submission, template, filePath);
          
          expect(result.valid).toBe(false);
          const error = result.hardErrors[0];
          
          expect(error.location.file).toBe(filePath);
          expect(error.location.field).toBe(fieldName);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });


  /**
   * Property 8.20: Multiple constraint violations should all be reported
   * 
   * For any Submission with multiple fields violating constraints,
   * all violations should be reported, not just the first one.
   */
  it('should report all constraint violations when multiple fields fail', () => {
    fc.assert(
      fc.property(
        categoryArb,
        uniqueFieldNamesArb(2, 4),
        filePathArb,
        (category, fieldNames) => {
          // Create fields with different constraint types
          const fields = fieldNames.map((name, i) => {
            if (i % 3 === 0) {
              return createFieldDef(name, 'string', [createRegexConstraint('^[a-z]+$')]);
            } else if (i % 3 === 1) {
              return createFieldDef(name, 'string', [createEnumConstraint(['valid1', 'valid2'])]);
            } else {
              return createFieldDef(name, 'integer', [createRangeConstraint({ min: 1 })]);
            }
          });
          const template = createTestTemplate(category, fields);
          
          // Create submission with all fields having invalid values
          const submission: Record<string, unknown> = { template: category, id: 'test-id' };
          fieldNames.forEach((name, i) => {
            if (i % 3 === 0) {
              submission[name] = 'INVALID123';
            } else if (i % 3 === 1) {
              submission[name] = 'not_in_enum';
            } else {
              submission[name] = -100;
            }
          });
          
          const result = validateConstraints(submission, template, 'test.yaml');
          
          expect(result.valid).toBe(false);
          expect(result.hardErrors.length).toBe(fieldNames.length);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8.21: Custom error codes should be used when provided
   * 
   * When a constraint defines a custom errorCode, that code should be
   * used in the validation error instead of the default.
   */
  it('should use custom error code when provided in constraint', () => {
    fc.assert(
      fc.property(
        categoryArb,
        fieldNameArb,
        fc.stringMatching(/^ERR_[A-Z_]{3,20}$/),
        filePathArb,
        (category, fieldName, customErrorCode) => {
          const constraint = createRegexConstraint('^[a-z]+$', customErrorCode);
          const fieldDef = createFieldDef(fieldName, 'string', [constraint]);
          const template = createTestTemplate(category, [fieldDef]);
          const submission = { template: category, id: 'test-id', [fieldName]: 'INVALID123' };
          
          const result = validateConstraints(submission, template, 'test.yaml');
          
          expect(result.valid).toBe(false);
          expect(result.hardErrors[0].code).toBe(customErrorCode);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });


  /**
   * Property 8.22: Missing fields should not trigger constraint errors
   * 
   * Fields that are not present in the submission should not trigger
   * constraint errors (they should be handled by required fields validator).
   */
  it('should not report constraint errors for missing fields', () => {
    fc.assert(
      fc.property(
        categoryArb,
        fieldNameArb,
        validRegexPatternArb,
        filePathArb,
        (category, fieldName, pattern) => {
          const fieldDef = createFieldDef(fieldName, 'string', [createRegexConstraint(pattern)]);
          const template = createTestTemplate(category, [fieldDef]);
          // Submission without the constrained field
          const submission = { template: category, id: 'test-id' };
          
          const result = validateConstraints(submission, template, 'test.yaml');
          
          expect(result.valid).toBe(true);
          expect(result.hardErrors).toHaveLength(0);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8.23: null and undefined values should not trigger constraint errors
   * 
   * Fields with null or undefined values should not trigger constraint errors
   * (they should be handled by required fields validator).
   */
  it('should not report constraint errors for null or undefined values', () => {
    fc.assert(
      fc.property(
        categoryArb,
        fieldNameArb,
        validRegexPatternArb,
        fc.constantFrom(null, undefined),
        filePathArb,
        (category, fieldName, pattern, nullValue) => {
          const fieldDef = createFieldDef(fieldName, 'string', [createRegexConstraint(pattern)]);
          const template = createTestTemplate(category, [fieldDef]);
          const submission = { template: category, id: 'test-id', [fieldName]: nullValue };
          
          const result = validateConstraints(submission, template, 'test.yaml');
          
          expect(result.valid).toBe(true);
          expect(result.hardErrors).toHaveLength(0);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8.24: getConstraintViolations should return all violations with details
   * 
   * For any Submission with constraint violations, getConstraintViolations
   * should return field name, constraint type, and the violated constraint.
   */
  it('should return violation details via getConstraintViolations', () => {
    fc.assert(
      fc.property(
        categoryArb,
        fieldNameArb,
        enumValuesArb,
        (category, fieldName, enumValues) => {
          const constraint = createEnumConstraint(enumValues);
          const fieldDef = createFieldDef(fieldName, 'string', [constraint]);
          const template = createTestTemplate(category, [fieldDef]);
          const invalidValue = fc.sample(valueNotInEnumArb(enumValues), 1)[0];
          const submission = { template: category, id: 'test-id', [fieldName]: invalidValue };
          
          const violations = getConstraintViolations(submission, template);
          
          expect(violations.length).toBe(1);
          expect(violations[0].field).toBe(fieldName);
          expect(violations[0].constraintType).toBe('enum');
          expect(violations[0].constraint.type).toBe('enum');
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });


  /**
   * Property 8.25: Validation result consistency
   * 
   * The valid field should be true if and only if there are no hard errors.
   */
  it('should have consistent valid field with hardErrors', () => {
    fc.assert(
      fc.property(
        categoryArb,
        fieldNameArb,
        validRegexPatternArb,
        fc.boolean(),
        filePathArb,
        (category, fieldName, pattern, useValidValue) => {
          const fieldDef = createFieldDef(fieldName, 'string', [createRegexConstraint(pattern)]);
          const template = createTestTemplate(category, [fieldDef]);
          
          let value: string;
          if (useValidValue) {
            value = fc.sample(stringMatchingPatternArb(pattern), 1)[0];
          } else {
            // Use a pattern that has clear invalid values
            if (pattern === '.*') {
              // '.*' matches everything, so skip this case
              return true;
            }
            value = fc.sample(stringNotMatchingPatternArb(pattern), 1)[0];
          }
          
          const submission = { template: category, id: 'test-id', [fieldName]: value };
          const result = validateConstraints(submission, template, 'test.yaml');
          
          // valid should be true iff hardErrors is empty
          expect(result.valid).toBe(result.hardErrors.length === 0);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8.26: Optional fields with constraints should also be validated
   * 
   * Constraints on optional fields should be validated when the field is present.
   */
  it('should validate constraints on optional fields when present', () => {
    fc.assert(
      fc.property(
        categoryArb,
        fieldNameArb,
        fc.constantFrom('^[a-z]+$', '^char-[a-z0-9-]+$'),
        filePathArb,
        (category, fieldName, pattern) => {
          const fieldDef = createFieldDef(fieldName, 'string', [createRegexConstraint(pattern)]);
          // Field is optional
          const template = createTestTemplate(category, [], [fieldDef]);
          const invalidValue = fc.sample(stringNotMatchingPatternArb(pattern), 1)[0];
          const submission = { template: category, id: 'test-id', [fieldName]: invalidValue };
          
          const result = validateConstraints(submission, template, 'test.yaml');
          
          expect(result.valid).toBe(false);
          expect(result.hardErrors.length).toBeGreaterThan(0);
          expect(result.hardErrors[0].code).toBe(ErrorCodes.CONSTRAINT_REGEX);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

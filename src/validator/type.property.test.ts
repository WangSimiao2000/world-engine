/**
 * Field Type Validator Property-Based Tests
 * 字段类型验证器属性测试
 * 
 * Feature: initialize, Property 7: 字段类型验证
 * **Validates: Requirements 3.4**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateFieldTypes, validateFieldType, getTypeMismatchedFields, getActualType } from './type.js';
import type { TemplateDefinition, FieldType } from '../types/index.js';
import { CATEGORIES, ErrorCodes } from '../types/index.js';

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
 * Arbitrary: Generate a simple field type (non-array)
 */
const simpleFieldTypeArb: fc.Arbitrary<FieldType> = fc.constantFrom(
  'string',
  'integer',
  'boolean',
  'epoch_ref',
  'entity_ref',
  'bilingual',
  'versioning'
);

/**
 * Arbitrary: Generate any field type including arrays
 */
const fieldTypeArb: fc.Arbitrary<FieldType> = fc.oneof(
  simpleFieldTypeArb,
  fc.constantFrom('array<string>', 'array<integer>', 'array<entity_ref>', 'array<epoch_ref>')
);

/**
 * Arbitrary: Generate a template definition with specified field types
 */
const templateDefinitionArb = (
  fields: Array<{ name: string; type: FieldType }>
): fc.Arbitrary<TemplateDefinition> =>
  categoryArb.map((category) => ({
    category,
    description: { zh: '测试模板', en: 'Test template' },
    required: fields.map(({ name, type }) => ({
      name,
      type,
      description: { zh: `${name} 字段`, en: `${name} field` },
    })),
    optional: [],
  }));

/**
 * Arbitrary: Generate a valid value for a given field type
 */
const validValueForTypeArb = (type: FieldType): fc.Arbitrary<unknown> => {
  switch (type) {
    case 'string':
      return fc.string({ minLength: 0, maxLength: 50 });
    case 'integer':
      return fc.integer({ min: -10000, max: 10000 });
    case 'boolean':
      return fc.boolean();
    case 'epoch_ref':
      return fc.stringMatching(/^epoch-[a-z0-9-]{1,20}$/);
    case 'entity_ref':
      return fc.stringMatching(/^[a-z]+-[a-z0-9-]{1,20}$/);
    case 'bilingual':
      return fc.record({
        zh: fc.string({ minLength: 1, maxLength: 30 }),
        en: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
      });
    case 'versioning':
      return fc.record({
        canon: fc.boolean(),
        source: fc.string({ minLength: 1, maxLength: 20 }),
        priority: fc.constantFrom('official', 'secondary'),
      });
    default:
      // Handle array types
      if (type.startsWith('array<') && type.endsWith('>')) {
        const innerType = type.slice(6, -1) as FieldType;
        return fc.array(validValueForTypeArb(innerType) as fc.Arbitrary<unknown>, { minLength: 0, maxLength: 5 });
      }
      return fc.string();
  }
};

/**
 * Arbitrary: Generate an invalid value for a given field type
 * Returns a value that does NOT match the expected type
 */
const invalidValueForTypeArb = (type: FieldType): fc.Arbitrary<unknown> => {
  switch (type) {
    case 'string':
      // Return non-string values
      return fc.oneof(
        fc.integer(),
        fc.boolean(),
        fc.constant([]),
        fc.record({ key: fc.string() })
      );
    case 'integer':
      // Return non-integer values (including floats)
      return fc.oneof(
        fc.string({ minLength: 1 }),
        fc.boolean(),
        fc.double({ min: 0.1, max: 100, noInteger: true }),
        fc.constant([])
      );
    case 'boolean':
      // Return non-boolean values
      return fc.oneof(
        fc.string({ minLength: 1 }),
        fc.integer(),
        fc.constant(0),
        fc.constant(1),
        fc.constant('true'),
        fc.constant('false')
      );
    case 'epoch_ref':
    case 'entity_ref':
      // These expect strings, return non-strings
      return fc.oneof(
        fc.integer(),
        fc.boolean(),
        fc.constant([]),
        fc.record({ id: fc.string() })
      );
    case 'bilingual':
      // Return invalid bilingual structures
      return fc.oneof(
        fc.string(), // Not an object
        fc.constant({}), // Missing zh
        fc.record({ en: fc.string() }), // Missing zh
        fc.record({ zh: fc.integer() }), // zh is not string
        fc.constant([]), // Array instead of object
        fc.integer()
      );
    case 'versioning':
      // Return invalid versioning structures
      return fc.oneof(
        fc.string(), // Not an object
        fc.constant({}), // Missing all fields
        fc.record({ canon: fc.boolean() }), // Missing source and priority
        fc.record({ canon: fc.string(), source: fc.string(), priority: fc.constantFrom('official', 'secondary') }), // canon is not boolean
        fc.record({ canon: fc.boolean(), source: fc.integer(), priority: fc.constantFrom('official', 'secondary') }), // source is not string
        fc.record({ canon: fc.boolean(), source: fc.string(), priority: fc.string() }) // priority is invalid
      );
    default:
      // Handle array types - return non-arrays or arrays with wrong element types
      if (type.startsWith('array<') && type.endsWith('>')) {
        const innerType = type.slice(6, -1) as FieldType;
        return fc.oneof(
          fc.string(), // Not an array
          fc.integer(),
          // Array with at least one invalid element
          fc.tuple(
            fc.array(validValueForTypeArb(innerType) as fc.Arbitrary<unknown>, { minLength: 0, maxLength: 2 }),
            invalidValueForTypeArb(innerType)
          ).map(([valid, invalid]) => [...valid, invalid])
        );
      }
      return fc.string();
  }
};

/**
 * Arbitrary: Generate a file path
 */
const filePathArb = fc.stringMatching(/^submissions\/[a-z]+\/[a-z0-9-]+\.yaml$/);

describe('Feature: initialize, Property 7: 字段类型验证', () => {
  /**
   * Property 7.1: Valid type values should pass validation
   * 
   * For any Submission file where all field values match their expected types,
   * the validation should pass with no type errors.
   */
  it('should pass validation when all field types are correct', () => {
    fc.assert(
      fc.property(
        uniqueFieldNamesArb(1, 5),
        fieldTypeArb,
        filePathArb,
        (fieldNames, fieldType) => {
          // Create template with all fields having the same type
          const fields = fieldNames.map((name) => ({ name, type: fieldType }));
          const template = fc.sample(templateDefinitionArb(fields), 1)[0];
          
          // Create submission with valid values for each field
          const submission: Record<string, unknown> = {
            template: template.category,
            id: 'test-id',
          };
          for (const fieldName of fieldNames) {
            submission[fieldName] = fc.sample(validValueForTypeArb(fieldType), 1)[0];
          }
          
          const result = validateFieldTypes(submission, template, 'test.yaml');
          
          expect(result.valid).toBe(true);
          expect(result.hardErrors).toHaveLength(0);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7.2: Invalid type values should fail validation with ERR_FIELD_TYPE
   * 
   * For any Submission file where a field value type doesn't match the template definition,
   * the validation should fail with ERR_FIELD_TYPE error code.
   */
  it('should fail validation with ERR_FIELD_TYPE when field type is incorrect', () => {
    fc.assert(
      fc.property(
        fieldNameArb,
        simpleFieldTypeArb,
        filePathArb,
        (fieldName, fieldType) => {
          const fields = [{ name: fieldName, type: fieldType }];
          const template = fc.sample(templateDefinitionArb(fields), 1)[0];
          
          // Create submission with invalid value for the field
          const submission: Record<string, unknown> = {
            template: template.category,
            id: 'test-id',
            [fieldName]: fc.sample(invalidValueForTypeArb(fieldType), 1)[0],
          };
          
          const result = validateFieldTypes(submission, template, 'test.yaml');
          
          expect(result.valid).toBe(false);
          expect(result.hardErrors.length).toBeGreaterThan(0);
          expect(result.hardErrors[0].code).toBe(ErrorCodes.FIELD_TYPE);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7.3: Error message should contain expected type
   * 
   * For any type mismatch error, the error message should state the expected type
   * in both Chinese and English.
   */
  it('should include expected type in error message', () => {
    fc.assert(
      fc.property(
        fieldNameArb,
        simpleFieldTypeArb,
        filePathArb,
        (fieldName, fieldType) => {
          const fields = [{ name: fieldName, type: fieldType }];
          const template = fc.sample(templateDefinitionArb(fields), 1)[0];
          
          const submission: Record<string, unknown> = {
            template: template.category,
            id: 'test-id',
            [fieldName]: fc.sample(invalidValueForTypeArb(fieldType), 1)[0],
          };
          
          const result = validateFieldTypes(submission, template, 'test.yaml');
          
          expect(result.valid).toBe(false);
          const error = result.hardErrors[0];
          
          // English message should contain the expected type
          expect(error.message.en).toContain(fieldType);
          
          // Chinese message should contain a type description
          // (The exact Chinese translation varies by type)
          expect(error.message.zh).toContain('期望');
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7.4: Error message should contain actual type
   * 
   * For any type mismatch error, the error message should state the actual type
   * of the provided value in both Chinese and English.
   */
  it('should include actual type in error message', () => {
    fc.assert(
      fc.property(
        fieldNameArb,
        filePathArb,
        () => {
          // Test with string type expecting integer
          const fieldName = fc.sample(fieldNameArb, 1)[0];
          const fields = [{ name: fieldName, type: 'integer' as FieldType }];
          const template = fc.sample(templateDefinitionArb(fields), 1)[0];
          
          // Provide a string value instead of integer
          const stringValue = 'not-a-number';
          const submission: Record<string, unknown> = {
            template: template.category,
            id: 'test-id',
            [fieldName]: stringValue,
          };
          
          const result = validateFieldTypes(submission, template, 'test.yaml');
          
          expect(result.valid).toBe(false);
          const error = result.hardErrors[0];
          
          // English message should contain 'string' as actual type
          expect(error.message.en).toContain('string');
          
          // Chinese message should contain actual type description
          expect(error.message.zh).toContain('实际');
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7.5: Error message should contain field name
   * 
   * For any type mismatch error, the error message should contain the field name
   * that has the type mismatch.
   */
  it('should include field name in error message', () => {
    fc.assert(
      fc.property(
        fieldNameArb,
        simpleFieldTypeArb,
        filePathArb,
        (fieldName, fieldType) => {
          const fields = [{ name: fieldName, type: fieldType }];
          const template = fc.sample(templateDefinitionArb(fields), 1)[0];
          
          const submission: Record<string, unknown> = {
            template: template.category,
            id: 'test-id',
            [fieldName]: fc.sample(invalidValueForTypeArb(fieldType), 1)[0],
          };
          
          const result = validateFieldTypes(submission, template, 'test.yaml');
          
          expect(result.valid).toBe(false);
          const error = result.hardErrors[0];
          
          // Both messages should contain the field name
          expect(error.message.zh).toContain(fieldName);
          expect(error.message.en).toContain(fieldName);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7.6: Error location should include file path and field name
   * 
   * For any type mismatch error, the location should include the file path
   * and the field name.
   */
  it('should include file path and field name in error location', () => {
    fc.assert(
      fc.property(
        fieldNameArb,
        simpleFieldTypeArb,
        filePathArb,
        (fieldName, fieldType, filePath) => {
          const fields = [{ name: fieldName, type: fieldType }];
          const template = fc.sample(templateDefinitionArb(fields), 1)[0];
          
          const submission: Record<string, unknown> = {
            template: template.category,
            id: 'test-id',
            [fieldName]: fc.sample(invalidValueForTypeArb(fieldType), 1)[0],
          };
          
          const result = validateFieldTypes(submission, template, filePath);
          
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
   * Property 7.7: Multiple type errors should all be reported
   * 
   * For any Submission file with multiple type mismatches, all errors
   * should be reported, not just the first one.
   */
  it('should report all type errors when multiple fields have wrong types', () => {
    fc.assert(
      fc.property(
        uniqueFieldNamesArb(2, 5),
        filePathArb,
        (fieldNames) => {
          // Create template with different types for each field
          const types: FieldType[] = ['string', 'integer', 'boolean', 'bilingual', 'versioning'];
          const fields = fieldNames.map((name, i) => ({
            name,
            type: types[i % types.length],
          }));
          const template = fc.sample(templateDefinitionArb(fields), 1)[0];
          
          // Create submission with ALL fields having wrong types
          const submission: Record<string, unknown> = {
            template: template.category,
            id: 'test-id',
          };
          for (let i = 0; i < fieldNames.length; i++) {
            const fieldType = types[i % types.length];
            submission[fieldNames[i]] = fc.sample(invalidValueForTypeArb(fieldType), 1)[0];
          }
          
          const result = validateFieldTypes(submission, template, 'test.yaml');
          
          expect(result.valid).toBe(false);
          // Should have an error for each field with wrong type
          expect(result.hardErrors.length).toBe(fieldNames.length);
          
          // Each error should have ERR_FIELD_TYPE code
          for (const error of result.hardErrors) {
            expect(error.code).toBe(ErrorCodes.FIELD_TYPE);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7.8: getTypeMismatchedFields should return expected and actual types
   * 
   * For any type mismatch, getTypeMismatchedFields should return the field name,
   * expected type, and actual type.
   */
  it('should return expected and actual types via getTypeMismatchedFields', () => {
    fc.assert(
      fc.property(
        fieldNameArb,
        simpleFieldTypeArb,
        (fieldName, fieldType) => {
          const fields = [{ name: fieldName, type: fieldType }];
          const template = fc.sample(templateDefinitionArb(fields), 1)[0];
          
          const invalidValue = fc.sample(invalidValueForTypeArb(fieldType), 1)[0];
          const submission: Record<string, unknown> = {
            template: template.category,
            id: 'test-id',
            [fieldName]: invalidValue,
          };
          
          const mismatched = getTypeMismatchedFields(submission, template);
          
          expect(mismatched.length).toBe(1);
          expect(mismatched[0].field).toBe(fieldName);
          expect(mismatched[0].expected).toBe(fieldType);
          expect(mismatched[0].actual).toBe(getActualType(invalidValue));
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7.9: Missing fields should not trigger type errors
   * 
   * Fields that are not present in the submission should not trigger type errors
   * (they should be handled by the required fields validator instead).
   */
  it('should not report type errors for missing fields', () => {
    fc.assert(
      fc.property(
        uniqueFieldNamesArb(1, 5),
        simpleFieldTypeArb,
        filePathArb,
        (fieldNames, fieldType) => {
          const fields = fieldNames.map((name) => ({ name, type: fieldType }));
          const template = fc.sample(templateDefinitionArb(fields), 1)[0];
          
          // Create submission with NO fields (all missing)
          const submission: Record<string, unknown> = {
            template: template.category,
            id: 'test-id',
          };
          
          const result = validateFieldTypes(submission, template, 'test.yaml');
          
          // Should pass type validation (missing fields are not type errors)
          expect(result.valid).toBe(true);
          expect(result.hardErrors).toHaveLength(0);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7.10: null and undefined values should not trigger type errors
   * 
   * Fields with null or undefined values should not trigger type errors
   * (they should be handled by the required fields validator instead).
   */
  it('should not report type errors for null or undefined values', () => {
    fc.assert(
      fc.property(
        fieldNameArb,
        simpleFieldTypeArb,
        fc.constantFrom(null, undefined),
        filePathArb,
        (fieldName, fieldType, nullValue) => {
          const fields = [{ name: fieldName, type: fieldType }];
          const template = fc.sample(templateDefinitionArb(fields), 1)[0];
          
          const submission: Record<string, unknown> = {
            template: template.category,
            id: 'test-id',
            [fieldName]: nullValue,
          };
          
          const result = validateFieldTypes(submission, template, 'test.yaml');
          
          // Should pass type validation (null/undefined are not type errors)
          expect(result.valid).toBe(true);
          expect(result.hardErrors).toHaveLength(0);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7.11: validateFieldType should correctly identify valid types
   * 
   * For any valid value of a given type, validateFieldType should return true.
   */
  it('should return true for valid type values via validateFieldType', () => {
    fc.assert(
      fc.property(
        simpleFieldTypeArb,
        (fieldType) => {
          const validValue = fc.sample(validValueForTypeArb(fieldType), 1)[0];
          
          const isValid = validateFieldType(validValue, fieldType);
          
          expect(isValid).toBe(true);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7.12: validateFieldType should correctly identify invalid types
   * 
   * For any invalid value of a given type, validateFieldType should return false.
   */
  it('should return false for invalid type values via validateFieldType', () => {
    fc.assert(
      fc.property(
        simpleFieldTypeArb,
        (fieldType) => {
          const invalidValue = fc.sample(invalidValueForTypeArb(fieldType), 1)[0];
          
          const isValid = validateFieldType(invalidValue, fieldType);
          
          expect(isValid).toBe(false);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7.13: Array type validation should check all elements
   * 
   * For array types, if any element has the wrong type, the validation should fail.
   */
  it('should fail validation when array contains element with wrong type', () => {
    fc.assert(
      fc.property(
        fieldNameArb,
        fc.constantFrom('array<string>', 'array<integer>', 'array<entity_ref>') as fc.Arbitrary<FieldType>,
        filePathArb,
        (fieldName, arrayType) => {
          const fields = [{ name: fieldName, type: arrayType }];
          const template = fc.sample(templateDefinitionArb(fields), 1)[0];
          
          // Create array with one invalid element
          const innerType = arrayType.slice(6, -1) as FieldType;
          const validElements = fc.sample(
            fc.array(validValueForTypeArb(innerType) as fc.Arbitrary<unknown>, { minLength: 1, maxLength: 3 }),
            1
          )[0];
          const invalidElement = fc.sample(invalidValueForTypeArb(innerType), 1)[0];
          
          const submission: Record<string, unknown> = {
            template: template.category,
            id: 'test-id',
            [fieldName]: [...validElements, invalidElement],
          };
          
          const result = validateFieldTypes(submission, template, 'test.yaml');
          
          expect(result.valid).toBe(false);
          expect(result.hardErrors[0].code).toBe(ErrorCodes.FIELD_TYPE);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7.14: Validation result consistency
   * 
   * The valid field should be true if and only if there are no hard errors.
   */
  it('should have consistent valid field with hardErrors', () => {
    fc.assert(
      fc.property(
        uniqueFieldNamesArb(1, 4),
        simpleFieldTypeArb,
        fc.boolean(),
        filePathArb,
        (fieldNames, fieldType, useValidValues) => {
          const fields = fieldNames.map((name) => ({ name, type: fieldType }));
          const template = fc.sample(templateDefinitionArb(fields), 1)[0];
          
          const submission: Record<string, unknown> = {
            template: template.category,
            id: 'test-id',
          };
          
          for (const fieldName of fieldNames) {
            if (useValidValues) {
              submission[fieldName] = fc.sample(validValueForTypeArb(fieldType), 1)[0];
            } else {
              submission[fieldName] = fc.sample(invalidValueForTypeArb(fieldType), 1)[0];
            }
          }
          
          const result = validateFieldTypes(submission, template, 'test.yaml');
          
          // valid should be true iff hardErrors is empty
          expect(result.valid).toBe(result.hardErrors.length === 0);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

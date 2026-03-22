/**
 * Required Fields Validator Property-Based Tests
 * 必填项验证器属性测试
 * 
 * Feature: initialize, Property 5: 必填项验证完整性
 * **Validates: Requirements 3.1, 3.2**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateRequiredFields, getMissingRequiredFields } from './required.js';
import type { TemplateDefinition, FieldDefinition, Category } from '../types/index.js';
import { CATEGORIES, ErrorCodes } from '../types/index.js';

/**
 * Arbitrary: Generate a random category
 */
const categoryArb = fc.constantFrom(...CATEGORIES);

/**
 * Reserved property names that exist on all JavaScript objects
 */
const RESERVED_PROPERTIES = new Set([
  'constructor', 'prototype', '__proto__', 'hasOwnProperty',
  'isPrototypeOf', 'propertyIsEnumerable', 'toLocaleString',
  'toString', 'valueOf',
]);

/**
 * Arbitrary: Generate a valid field name (alphanumeric with underscores)
 * Excludes JavaScript reserved property names
 */
const fieldNameArb = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz_'),
  { minLength: 2, maxLength: 20 }
).filter((s) => /^[a-z][a-z_]*$/.test(s) && !RESERVED_PROPERTIES.has(s));

/**
 * Arbitrary: Generate a field definition
 */
const fieldDefinitionArb = (name: string): fc.Arbitrary<FieldDefinition> =>
  fc.constant({
    name,
    type: 'string' as const,
    description: { zh: `${name} 字段`, en: `${name} field` },
  });

/**
 * Arbitrary: Generate a list of unique field names
 */
const uniqueFieldNamesArb = (minLength: number, maxLength: number): fc.Arbitrary<string[]> =>
  fc.array(fieldNameArb, { minLength, maxLength })
    .map((names) => [...new Set(names)])
    .filter((names) => names.length >= minLength);

/**
 * Arbitrary: Generate a template definition with specified required fields
 */
const templateDefinitionArb = (requiredFieldNames: string[]): fc.Arbitrary<TemplateDefinition> =>
  categoryArb.map((category) => ({
    category,
    description: { zh: '测试模板', en: 'Test template' },
    required: requiredFieldNames.map((name) => ({
      name,
      type: 'string' as const,
      description: { zh: `${name} 字段`, en: `${name} field` },
    })),
    optional: [],
  }));

/**
 * Arbitrary: Generate a valid field value (non-null, non-undefined)
 */
const validFieldValueArb = fc.oneof(
  fc.string({ minLength: 1, maxLength: 50 }),
  fc.integer(),
  fc.boolean(),
  fc.constant(0),
  fc.constant(false),
  fc.constant(''),
  fc.array(fc.string(), { minLength: 0, maxLength: 3 }),
  fc.record({ zh: fc.string({ minLength: 1, maxLength: 20 }) }),
);

/**
 * Arbitrary: Generate a submission with all required fields present
 */
const completeSubmissionArb = (requiredFieldNames: string[]): fc.Arbitrary<Record<string, unknown>> =>
  fc.tuple(
    categoryArb,
    ...requiredFieldNames.map(() => validFieldValueArb)
  ).map(([category, ...values]) => {
    const submission: Record<string, unknown> = { template: category };
    requiredFieldNames.forEach((name, index) => {
      submission[name] = values[index];
    });
    return submission;
  });

/**
 * Arbitrary: Generate a submission with some required fields missing
 */
const incompleteSubmissionArb = (
  requiredFieldNames: string[],
  missingFieldNames: string[]
): fc.Arbitrary<Record<string, unknown>> => {
  const presentFields = requiredFieldNames.filter((name) => !missingFieldNames.includes(name));
  return fc.tuple(
    categoryArb,
    ...presentFields.map(() => validFieldValueArb)
  ).map(([category, ...values]) => {
    const submission: Record<string, unknown> = { template: category };
    presentFields.forEach((name, index) => {
      submission[name] = values[index];
    });
    return submission;
  });
};

describe('Feature: initialize, Property 5: 必填项验证完整性', () => {
  /**
   * Property 5.1: Complete submissions should pass validation
   * 
   * For any Submission file that contains all required fields defined in the template,
   * the validation should pass (valid: true) with no hard errors.
   */
  it('should pass validation when all required fields are present', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueFieldNamesArb(1, 8),
        async (requiredFieldNames) => {
          const template = await fc.sample(templateDefinitionArb(requiredFieldNames), 1)[0];
          const submission = await fc.sample(completeSubmissionArb(requiredFieldNames), 1)[0];
          
          const result = validateRequiredFields(submission, template, 'test.yaml');
          
          expect(result.valid).toBe(true);
          expect(result.hardErrors).toHaveLength(0);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5.2: Missing required fields should fail validation
   * 
   * For any Submission file that is missing one or more required fields,
   * the validation should fail (valid: false) with hard errors.
   */
  it('should fail validation when required fields are missing', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueFieldNamesArb(2, 8).chain((requiredFieldNames) =>
          fc.tuple(
            fc.constant(requiredFieldNames),
            // Select at least one field to be missing
            fc.shuffledSubarray(requiredFieldNames, { minLength: 1, maxLength: requiredFieldNames.length })
          )
        ),
        async ([requiredFieldNames, missingFieldNames]) => {
          const template = await fc.sample(templateDefinitionArb(requiredFieldNames), 1)[0];
          const submission = await fc.sample(
            incompleteSubmissionArb(requiredFieldNames, missingFieldNames),
            1
          )[0];
          
          const result = validateRequiredFields(submission, template, 'test.yaml');
          
          // Should fail validation
          expect(result.valid).toBe(false);
          expect(result.hardErrors.length).toBeGreaterThan(0);
          
          // Should have FIELD_REQUIRED error code
          const fieldError = result.hardErrors.find(
            (e) => e.code === ErrorCodes.FIELD_REQUIRED
          );
          expect(fieldError).toBeDefined();
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5.3: Error message should list ALL missing field names
   * 
   * For any Submission file with missing required fields, the error message
   * should contain the names of ALL missing fields, not just some of them.
   */
  it('should list all missing field names in error message', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueFieldNamesArb(2, 6).chain((requiredFieldNames) =>
          fc.tuple(
            fc.constant(requiredFieldNames),
            fc.shuffledSubarray(requiredFieldNames, { minLength: 1, maxLength: requiredFieldNames.length })
          )
        ),
        async ([requiredFieldNames, missingFieldNames]) => {
          const template = await fc.sample(templateDefinitionArb(requiredFieldNames), 1)[0];
          const submission = await fc.sample(
            incompleteSubmissionArb(requiredFieldNames, missingFieldNames),
            1
          )[0];
          
          const result = validateRequiredFields(submission, template, 'test.yaml');
          
          // Should fail validation
          expect(result.valid).toBe(false);
          
          // Get the error message
          const fieldError = result.hardErrors.find(
            (e) => e.code === ErrorCodes.FIELD_REQUIRED
          );
          expect(fieldError).toBeDefined();
          
          // Error message should contain ALL missing field names
          for (const missingField of missingFieldNames) {
            expect(fieldError!.message.zh).toContain(missingField);
            expect(fieldError!.message.en).toContain(missingField);
          }
          
          // relatedEntities should contain all missing fields
          expect(fieldError!.relatedEntities).toBeDefined();
          for (const missingField of missingFieldNames) {
            expect(fieldError!.relatedEntities).toContain(missingField);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5.4: getMissingRequiredFields should return exactly the missing fields
   * 
   * For any Submission file and template, getMissingRequiredFields should return
   * exactly the set of required fields that are not present in the submission.
   */
  it('should return exactly the missing fields via getMissingRequiredFields', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueFieldNamesArb(2, 8).chain((requiredFieldNames) =>
          fc.tuple(
            fc.constant(requiredFieldNames),
            fc.shuffledSubarray(requiredFieldNames, { minLength: 0, maxLength: requiredFieldNames.length })
          )
        ),
        async ([requiredFieldNames, missingFieldNames]) => {
          const template = await fc.sample(templateDefinitionArb(requiredFieldNames), 1)[0];
          const submission = await fc.sample(
            incompleteSubmissionArb(requiredFieldNames, missingFieldNames),
            1
          )[0];
          
          const missing = getMissingRequiredFields(submission, template);
          
          // Should return exactly the missing fields
          expect(missing.sort()).toEqual(missingFieldNames.sort());
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5.5: null and undefined values should be treated as missing
   * 
   * For any required field with null or undefined value, it should be
   * considered as missing and reported in the error.
   */
  it('should treat null and undefined values as missing', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueFieldNamesArb(2, 6).chain((requiredFieldNames) =>
          fc.tuple(
            fc.constant(requiredFieldNames),
            // Select fields to set as null/undefined
            fc.shuffledSubarray(requiredFieldNames, { minLength: 1, maxLength: Math.min(3, requiredFieldNames.length) }),
            fc.constantFrom(null, undefined)
          )
        ),
        async ([requiredFieldNames, nullFields, nullValue]) => {
          const template = await fc.sample(templateDefinitionArb(requiredFieldNames), 1)[0];
          
          // Create submission with some fields set to null/undefined
          const submission: Record<string, unknown> = { template: 'character' };
          for (const fieldName of requiredFieldNames) {
            if (nullFields.includes(fieldName)) {
              submission[fieldName] = nullValue;
            } else {
              submission[fieldName] = 'valid-value';
            }
          }
          
          const result = validateRequiredFields(submission, template, 'test.yaml');
          
          // Should fail validation
          expect(result.valid).toBe(false);
          
          // Get missing fields
          const missing = getMissingRequiredFields(submission, template);
          
          // All null/undefined fields should be reported as missing
          for (const nullField of nullFields) {
            expect(missing).toContain(nullField);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5.6: Falsy but valid values should NOT be treated as missing
   * 
   * Values like 0, false, and empty string are valid values and should
   * not be treated as missing required fields.
   */
  it('should accept falsy but valid values (0, false, empty string)', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueFieldNamesArb(1, 5),
        fc.constantFrom(0, false, '', [], {}),
        async (requiredFieldNames, falsyValue) => {
          const template = await fc.sample(templateDefinitionArb(requiredFieldNames), 1)[0];
          
          // Create submission with all fields set to the falsy value
          const submission: Record<string, unknown> = { template: 'character' };
          for (const fieldName of requiredFieldNames) {
            submission[fieldName] = falsyValue;
          }
          
          const result = validateRequiredFields(submission, template, 'test.yaml');
          
          // Should pass validation - falsy values are still valid
          expect(result.valid).toBe(true);
          expect(result.hardErrors).toHaveLength(0);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5.7: Empty template (no required fields) should always pass
   * 
   * For any submission, if the template has no required fields,
   * the validation should always pass.
   */
  it('should pass validation when template has no required fields', async () => {
    await fc.assert(
      fc.asyncProperty(
        categoryArb,
        fc.dictionary(fieldNameArb, validFieldValueArb, { minKeys: 0, maxKeys: 5 }),
        async (category, extraFields) => {
          const template: TemplateDefinition = {
            category,
            description: { zh: '测试模板', en: 'Test template' },
            required: [],
            optional: [],
          };
          
          const submission: Record<string, unknown> = { template: category, ...extraFields };
          
          const result = validateRequiredFields(submission, template, 'test.yaml');
          
          // Should always pass with empty required fields
          expect(result.valid).toBe(true);
          expect(result.hardErrors).toHaveLength(0);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5.8: Validation result consistency
   * 
   * The valid field should be true if and only if there are no hard errors.
   */
  it('should have consistent valid field with hardErrors', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueFieldNamesArb(1, 6).chain((requiredFieldNames) =>
          fc.tuple(
            fc.constant(requiredFieldNames),
            fc.shuffledSubarray(requiredFieldNames, { minLength: 0, maxLength: requiredFieldNames.length })
          )
        ),
        async ([requiredFieldNames, missingFieldNames]) => {
          const template = await fc.sample(templateDefinitionArb(requiredFieldNames), 1)[0];
          const submission = await fc.sample(
            incompleteSubmissionArb(requiredFieldNames, missingFieldNames),
            1
          )[0];
          
          const result = validateRequiredFields(submission, template, 'test.yaml');
          
          // valid should be true iff hardErrors is empty
          expect(result.valid).toBe(result.hardErrors.length === 0);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5.9: Error location should include file path
   * 
   * For any validation error, the location should include the file path
   * that was passed to the validator.
   */
  it('should include file path in error location', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueFieldNamesArb(2, 5).chain((requiredFieldNames) =>
          fc.tuple(
            fc.constant(requiredFieldNames),
            fc.shuffledSubarray(requiredFieldNames, { minLength: 1, maxLength: requiredFieldNames.length })
          )
        ),
        fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-_/'), { minLength: 5, maxLength: 50 })
          .map((s) => `submissions/${s}.yaml`),
        async ([requiredFieldNames, missingFieldNames], filePath) => {
          const template = await fc.sample(templateDefinitionArb(requiredFieldNames), 1)[0];
          const submission = await fc.sample(
            incompleteSubmissionArb(requiredFieldNames, missingFieldNames),
            1
          )[0];
          
          const result = validateRequiredFields(submission, template, filePath);
          
          // Should have errors
          expect(result.hardErrors.length).toBeGreaterThan(0);
          
          // Error location should include the file path
          const error = result.hardErrors[0];
          expect(error.location.file).toBe(filePath);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Unknown Fields Validator Property-Based Tests
 * 未定义字段警告验证器属性测试
 * 
 * Feature: initialize, Property 6: 未定义字段警告
 * **Validates: Requirements 3.3**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateUnknownFields, getUnknownFields } from './unknown.js';
import type { TemplateDefinition, FieldDefinition, Category } from '../types/index.js';
import { CATEGORIES, WarningCodes } from '../types/index.js';

/**
 * Arbitrary: Generate a random category
 */
const categoryArb = fc.constantFrom(...CATEGORIES);

/**
 * Arbitrary: Generate a valid field name (alphanumeric with underscores)
 */
const fieldNameArb = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz_'),
  { minLength: 2, maxLength: 20 }
).filter((s) => /^[a-z][a-z_]*$/.test(s));

/**
 * Arbitrary: Generate a list of unique field names, excluding reserved fields
 */
const uniqueFieldNamesArb = (minLength: number, maxLength: number): fc.Arbitrary<string[]> =>
  fc.array(fieldNameArb, { minLength: Math.max(minLength, 1), maxLength: maxLength + 2 })
    .map((names) => [...new Set(names)].filter((n) => n !== 'template' && n !== 'id'))
    .filter((names) => names.length >= minLength);

/**
 * Arbitrary: Generate a template definition with specified required and optional fields
 */
const templateDefinitionArb = (
  requiredFieldNames: string[],
  optionalFieldNames: string[] = []
): fc.Arbitrary<TemplateDefinition> =>
  categoryArb.map((category) => ({
    category,
    description: { zh: '测试模板', en: 'Test template' },
    required: requiredFieldNames.map((name) => ({
      name,
      type: 'string' as const,
      description: { zh: `${name} 字段`, en: `${name} field` },
    })),
    optional: optionalFieldNames.map((name) => ({
      name,
      type: 'string' as const,
      description: { zh: `${name} 字段`, en: `${name} field` },
    })),
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
 * Arbitrary: Generate a file path
 */
const filePathArb = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-_/'),
  { minLength: 5, maxLength: 50 }
).map((s) => `submissions/${s}.yaml`);

describe('Feature: initialize, Property 6: 未定义字段警告', () => {
  /**
   * Property 6.1: Submissions with only defined fields should have no warnings
   * 
   * For any Submission file that contains only fields defined in the template
   * (required, optional, or reserved fields), no warnings should be generated.
   */
  it('should generate no warnings when all fields are defined in template', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueFieldNamesArb(1, 5),
        uniqueFieldNamesArb(0, 3),
        filePathArb,
        async (requiredFieldNames, optionalFieldNames) => {
          // Ensure no overlap between required and optional
          const filteredOptional = optionalFieldNames.filter(
            (n) => !requiredFieldNames.includes(n)
          );
          
          const template = await fc.sample(
            templateDefinitionArb(requiredFieldNames, filteredOptional),
            1
          )[0];
          
          // Create submission with only defined fields
          const submission: Record<string, unknown> = {
            template: template.category,
            id: 'test-id',
          };
          for (const fieldName of requiredFieldNames) {
            submission[fieldName] = 'value';
          }
          for (const fieldName of filteredOptional) {
            submission[fieldName] = 'value';
          }
          
          const result = validateUnknownFields(submission, template, 'test.yaml');
          
          expect(result.valid).toBe(true);
          expect(result.softWarnings).toHaveLength(0);
          expect(result.hardErrors).toHaveLength(0);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 6.2: Submissions with unknown fields should generate warnings
   * 
   * For any Submission file containing fields not defined in the template,
   * the system should generate WARN_FIELD_UNKNOWN warnings for each unknown field.
   */
  it('should generate warnings for fields not defined in template', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueFieldNamesArb(1, 4),
        uniqueFieldNamesArb(1, 4),
        filePathArb,
        async (definedFieldNames, unknownFieldNames) => {
          // Ensure unknown fields don't overlap with defined fields
          const filteredUnknown = unknownFieldNames.filter(
            (n) => !definedFieldNames.includes(n)
          );
          
          if (filteredUnknown.length === 0) {
            return true; // Skip if no unique unknown fields
          }
          
          const template = await fc.sample(
            templateDefinitionArb(definedFieldNames, []),
            1
          )[0];
          
          // Create submission with defined fields + unknown fields
          const submission: Record<string, unknown> = {
            template: template.category,
            id: 'test-id',
          };
          for (const fieldName of definedFieldNames) {
            submission[fieldName] = 'value';
          }
          for (const fieldName of filteredUnknown) {
            submission[fieldName] = 'unknown-value';
          }
          
          const result = validateUnknownFields(submission, template, 'test.yaml');
          
          // Should still be valid (warnings don't affect validity)
          expect(result.valid).toBe(true);
          expect(result.hardErrors).toHaveLength(0);
          
          // Should have warnings for each unknown field
          expect(result.softWarnings).toHaveLength(filteredUnknown.length);
          
          // Each warning should have WARN_FIELD_UNKNOWN code
          for (const warning of result.softWarnings) {
            expect(warning.code).toBe(WarningCodes.FIELD_UNKNOWN);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 6.3: Warning messages should contain the unknown field name
   * 
   * For any unknown field, the warning message should contain the field name
   * in both Chinese and English messages.
   */
  it('should include field name in warning messages', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueFieldNamesArb(1, 3),
        uniqueFieldNamesArb(1, 3),
        filePathArb,
        async (definedFieldNames, unknownFieldNames) => {
          const filteredUnknown = unknownFieldNames.filter(
            (n) => !definedFieldNames.includes(n)
          );
          
          if (filteredUnknown.length === 0) {
            return true;
          }
          
          const template = await fc.sample(
            templateDefinitionArb(definedFieldNames, []),
            1
          )[0];
          
          const submission: Record<string, unknown> = {
            template: template.category,
            id: 'test-id',
          };
          for (const fieldName of definedFieldNames) {
            submission[fieldName] = 'value';
          }
          for (const fieldName of filteredUnknown) {
            submission[fieldName] = 'unknown-value';
          }
          
          const result = validateUnknownFields(submission, template, 'test.yaml');
          
          // Each unknown field should have a warning with its name in the message
          for (const unknownField of filteredUnknown) {
            const warning = result.softWarnings.find(
              (w) => w.location.field === unknownField
            );
            expect(warning).toBeDefined();
            expect(warning!.message.zh).toContain(unknownField);
            expect(warning!.message.en).toContain(unknownField);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 6.4: Warning location should include file path and field name
   * 
   * For any unknown field warning, the location should include the file path
   * and the field name.
   */
  it('should include file path and field name in warning location', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueFieldNamesArb(1, 3),
        uniqueFieldNamesArb(1, 3),
        filePathArb,
        async (definedFieldNames, unknownFieldNames, filePath) => {
          const filteredUnknown = unknownFieldNames.filter(
            (n) => !definedFieldNames.includes(n)
          );
          
          if (filteredUnknown.length === 0) {
            return true;
          }
          
          const template = await fc.sample(
            templateDefinitionArb(definedFieldNames, []),
            1
          )[0];
          
          const submission: Record<string, unknown> = {
            template: template.category,
            id: 'test-id',
          };
          for (const fieldName of definedFieldNames) {
            submission[fieldName] = 'value';
          }
          for (const fieldName of filteredUnknown) {
            submission[fieldName] = 'unknown-value';
          }
          
          const result = validateUnknownFields(submission, template, filePath);
          
          // Each warning should have correct location
          for (const warning of result.softWarnings) {
            expect(warning.location.file).toBe(filePath);
            expect(filteredUnknown).toContain(warning.location.field);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 6.5: Reserved fields (template, id) should never trigger warnings
   * 
   * The reserved fields 'template' and 'id' should never be reported as unknown,
   * even if they are not explicitly defined in the template.
   */
  it('should not generate warnings for reserved fields (template, id)', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueFieldNamesArb(0, 3),
        filePathArb,
        async (definedFieldNames) => {
          const template = await fc.sample(
            templateDefinitionArb(definedFieldNames, []),
            1
          )[0];
          
          // Create submission with only reserved fields
          const submission: Record<string, unknown> = {
            template: template.category,
            id: 'test-id',
          };
          
          const result = validateUnknownFields(submission, template, 'test.yaml');
          
          expect(result.valid).toBe(true);
          expect(result.softWarnings).toHaveLength(0);
          
          // Verify reserved fields are not in unknown fields list
          const unknownFields = getUnknownFields(submission, template);
          expect(unknownFields).not.toContain('template');
          expect(unknownFields).not.toContain('id');
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 6.6: getUnknownFields should return exactly the unknown fields
   * 
   * For any Submission file and template, getUnknownFields should return
   * exactly the set of fields that are not defined in the template and not reserved.
   */
  it('should return exactly the unknown fields via getUnknownFields', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueFieldNamesArb(1, 4),
        uniqueFieldNamesArb(1, 4),
        async (definedFieldNames, unknownFieldNames) => {
          const filteredUnknown = unknownFieldNames.filter(
            (n) => !definedFieldNames.includes(n)
          );
          
          const template = await fc.sample(
            templateDefinitionArb(definedFieldNames, []),
            1
          )[0];
          
          const submission: Record<string, unknown> = {
            template: template.category,
            id: 'test-id',
          };
          for (const fieldName of definedFieldNames) {
            submission[fieldName] = 'value';
          }
          for (const fieldName of filteredUnknown) {
            submission[fieldName] = 'unknown-value';
          }
          
          const unknownFields = getUnknownFields(submission, template);
          
          // Should return exactly the unknown fields
          expect(unknownFields.sort()).toEqual(filteredUnknown.sort());
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 6.7: Unknown fields with any value type should trigger warnings
   * 
   * Unknown fields should trigger warnings regardless of their value type
   * (string, number, boolean, array, object, null).
   */
  it('should generate warnings for unknown fields with any value type', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueFieldNamesArb(1, 3),
        fieldNameArb.filter((n) => n !== 'template' && n !== 'id'),
        validFieldValueArb,
        filePathArb,
        async (definedFieldNames, unknownFieldName, unknownValue) => {
          // Ensure unknown field doesn't overlap with defined fields
          if (definedFieldNames.includes(unknownFieldName)) {
            return true;
          }
          
          const template = await fc.sample(
            templateDefinitionArb(definedFieldNames, []),
            1
          )[0];
          
          const submission: Record<string, unknown> = {
            template: template.category,
            id: 'test-id',
          };
          for (const fieldName of definedFieldNames) {
            submission[fieldName] = 'value';
          }
          submission[unknownFieldName] = unknownValue;
          
          const result = validateUnknownFields(submission, template, 'test.yaml');
          
          // Should have exactly one warning for the unknown field
          expect(result.softWarnings).toHaveLength(1);
          expect(result.softWarnings[0].code).toBe(WarningCodes.FIELD_UNKNOWN);
          expect(result.softWarnings[0].location.field).toBe(unknownFieldName);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 6.8: Optional fields should not trigger warnings
   * 
   * Fields defined as optional in the template should not trigger warnings
   * when present in the submission.
   */
  it('should not generate warnings for optional fields', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueFieldNamesArb(1, 3),
        uniqueFieldNamesArb(1, 3),
        filePathArb,
        async (requiredFieldNames, optionalFieldNames) => {
          // Ensure no overlap
          const filteredOptional = optionalFieldNames.filter(
            (n) => !requiredFieldNames.includes(n)
          );
          
          if (filteredOptional.length === 0) {
            return true;
          }
          
          const template = await fc.sample(
            templateDefinitionArb(requiredFieldNames, filteredOptional),
            1
          )[0];
          
          // Create submission with all required and optional fields
          const submission: Record<string, unknown> = {
            template: template.category,
            id: 'test-id',
          };
          for (const fieldName of requiredFieldNames) {
            submission[fieldName] = 'value';
          }
          for (const fieldName of filteredOptional) {
            submission[fieldName] = 'optional-value';
          }
          
          const result = validateUnknownFields(submission, template, 'test.yaml');
          
          expect(result.valid).toBe(true);
          expect(result.softWarnings).toHaveLength(0);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 6.9: Validation result should always be valid (warnings don't affect validity)
   * 
   * Unknown fields only generate warnings, not errors. The validation result
   * should always have valid: true regardless of unknown fields.
   */
  it('should always return valid: true regardless of unknown fields', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueFieldNamesArb(0, 3),
        uniqueFieldNamesArb(0, 5),
        filePathArb,
        async (definedFieldNames, extraFieldNames) => {
          const template = await fc.sample(
            templateDefinitionArb(definedFieldNames, []),
            1
          )[0];
          
          // Create submission with defined fields + extra fields
          const submission: Record<string, unknown> = {
            template: template.category,
            id: 'test-id',
          };
          for (const fieldName of definedFieldNames) {
            submission[fieldName] = 'value';
          }
          for (const fieldName of extraFieldNames) {
            if (!definedFieldNames.includes(fieldName)) {
              submission[fieldName] = 'extra-value';
            }
          }
          
          const result = validateUnknownFields(submission, template, 'test.yaml');
          
          // Should always be valid
          expect(result.valid).toBe(true);
          expect(result.hardErrors).toHaveLength(0);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 6.10: Number of warnings should equal number of unknown fields
   * 
   * The number of warnings generated should exactly match the number of
   * unknown fields in the submission.
   */
  it('should generate exactly one warning per unknown field', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueFieldNamesArb(1, 4),
        uniqueFieldNamesArb(1, 5),
        filePathArb,
        async (definedFieldNames, allFieldNames) => {
          const template = await fc.sample(
            templateDefinitionArb(definedFieldNames, []),
            1
          )[0];
          
          // Create submission with all fields
          const submission: Record<string, unknown> = {
            template: template.category,
            id: 'test-id',
          };
          for (const fieldName of definedFieldNames) {
            submission[fieldName] = 'value';
          }
          for (const fieldName of allFieldNames) {
            if (!definedFieldNames.includes(fieldName)) {
              submission[fieldName] = 'extra-value';
            }
          }
          
          const result = validateUnknownFields(submission, template, 'test.yaml');
          const unknownFields = getUnknownFields(submission, template);
          
          // Number of warnings should equal number of unknown fields
          expect(result.softWarnings.length).toBe(unknownFields.length);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Submission Validator Property-Based Tests
 * 提交文件格式验证器属性测试
 * 
 * Feature: initialize, Property 3: Submission 格式验证
 * Feature: initialize, Property 4: Submission ID 唯一性
 * **Validates: Requirements 2.3, 2.4**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import * as yaml from 'js-yaml';
import {
  createSubmissionValidator,
  parseSubmission,
  ID_PATTERNS,
  ID_PREFIXES,
  type ParsedSubmission,
} from './submission.js';
import { CATEGORIES, ErrorCodes, type Category } from '../types/index.js';

describe('Feature: initialize, Property 3: Submission 格式验证', () => {
  const validator = createSubmissionValidator();

  /**
   * Arbitrary: Generate a random category
   */
  const categoryArb = fc.constantFrom(...CATEGORIES);

  /**
   * Arbitrary: Generate a valid ID for a given category
   */
  const validIdForCategoryArb = (category: Category): fc.Arbitrary<string> => {
    const prefix = ID_PREFIXES[category].split('-')[0];
    return fc.stringOf(
      fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-'),
      { minLength: 1, maxLength: 20 }
    )
      .filter((s) => !s.startsWith('-') && !s.endsWith('-') && !s.includes('--'))
      .map((suffix) => `${prefix}-${suffix}`);
  };

  /**
   * Arbitrary: Generate a valid submission YAML content
   */
  const validSubmissionArb = categoryArb.chain((category) =>
    validIdForCategoryArb(category).map((id) => ({
      category,
      id,
      content: yaml.dump({
        template: category,
        id,
        name: { zh: '测试名称' },
      }),
    }))
  );

  /**
   * Property 3.1: Valid YAML format with template field should be accepted
   * 
   * For any submitted Submission file that is valid YAML format and contains
   * a `template` field declaring a valid template type, the validation should pass.
   */
  it('should accept valid YAML format with valid template field', async () => {
    await fc.assert(
      fc.property(validSubmissionArb, ({ content, category, id }) => {
        const result = validator.validateFormat(content, 'test.yaml');
        
        // Should be valid
        expect(result.valid).toBe(true);
        expect(result.hardErrors).toHaveLength(0);
        
        // Parse and verify the submission
        const { submission } = validator.parseAndValidate(content, 'test.yaml');
        expect(submission).not.toBeNull();
        expect(submission?.template).toBe(category);
        expect(submission?.id).toBe(id);
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Arbitrary: Generate invalid YAML syntax
   * These are YAML syntax errors that will cause parsing to fail
   */
  const invalidYamlSyntaxArb = fc.oneof(
    // Unclosed bracket
    fc.constant('template: character\nid: char-test\ndata: [unclosed'),
    // Unclosed brace
    fc.constant('template: character\nid: char-test\ndata: {unclosed'),
    // Invalid mapping indicator
    fc.constant('template: character\nid: char-test\n- invalid mapping'),
    // Unquoted special characters that break parsing
    fc.constant('template: character\nid: char-test\ndata: @invalid'),
    // Invalid block scalar
    fc.constant('template: character\nid: char-test\ndata: |\n  line1\n line2'),
    // Malformed anchor
    fc.constant('template: character\nid: char-test\ndata: *undefined_anchor'),
    // Invalid escape sequence in quoted string
    fc.constant('template: character\nid: char-test\ndata: "invalid \\z escape"')
  );

  /**
   * Property 3.2: Invalid YAML format should be rejected with ERR_YAML_INVALID
   * 
   * For any submitted Submission file that is not valid YAML format,
   * the system should return an error with code ERR_YAML_INVALID.
   */
  it('should reject invalid YAML format with ERR_YAML_INVALID', async () => {
    await fc.assert(
      fc.property(invalidYamlSyntaxArb, (content) => {
        const result = validator.validateFormat(content, 'test.yaml');
        
        // Should be invalid
        expect(result.valid).toBe(false);
        expect(result.hardErrors.length).toBeGreaterThan(0);
        
        // Should have YAML_INVALID error code
        const yamlError = result.hardErrors.find(
          (e) => e.code === ErrorCodes.YAML_INVALID
        );
        expect(yamlError).toBeDefined();
        expect(yamlError?.location.file).toBe('test.yaml');
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Arbitrary: Generate YAML without template field
   */
  const missingTemplateFieldArb = fc.record({
    id: fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-'), { minLength: 5, maxLength: 20 }),
    name: fc.record({
      zh: fc.string({ minLength: 1, maxLength: 20 }),
    }),
  }).map((data) => yaml.dump(data));

  /**
   * Property 3.3: Missing template field should be rejected with ERR_TEMPLATE_MISSING
   * 
   * For any submitted Submission file that is valid YAML but missing the `template` field,
   * the system should return an error with code ERR_TEMPLATE_MISSING.
   */
  it('should reject missing template field with ERR_TEMPLATE_MISSING', async () => {
    await fc.assert(
      fc.property(missingTemplateFieldArb, (content) => {
        const result = validator.validateFormat(content, 'test.yaml');
        
        // Should be invalid
        expect(result.valid).toBe(false);
        
        // Should have TEMPLATE_MISSING error code
        const templateError = result.hardErrors.find(
          (e) => e.code === ErrorCodes.TEMPLATE_MISSING
        );
        expect(templateError).toBeDefined();
        expect(templateError?.location.field).toBe('template');
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Arbitrary: Generate YAML with invalid template value
   */
  const invalidTemplateValueArb = fc
    .stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz_'), { minLength: 3, maxLength: 15 })
    .filter((s) => !CATEGORIES.includes(s as Category))
    .map((invalidTemplate) =>
      yaml.dump({
        template: invalidTemplate,
        id: 'test-123',
        name: { zh: '测试' },
      })
    );

  /**
   * Property 3.4: Invalid template value should be rejected with ERR_TEMPLATE_UNKNOWN
   * 
   * For any submitted Submission file with an invalid template value,
   * the system should return an error with code ERR_TEMPLATE_UNKNOWN.
   */
  it('should reject invalid template value with ERR_TEMPLATE_UNKNOWN', async () => {
    await fc.assert(
      fc.property(invalidTemplateValueArb, (content) => {
        const result = validator.validateFormat(content, 'test.yaml');
        
        // Should be invalid
        expect(result.valid).toBe(false);
        
        // Should have TEMPLATE_UNKNOWN error code
        const templateError = result.hardErrors.find(
          (e) => e.code === ErrorCodes.TEMPLATE_UNKNOWN
        );
        expect(templateError).toBeDefined();
        expect(templateError?.message.zh).toContain(CATEGORIES.join(', '));
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Arbitrary: Generate non-object YAML content
   */
  const nonObjectYamlArb = fc.oneof(
    // Array
    fc.array(fc.string(), { minLength: 1, maxLength: 5 }).map((arr) => yaml.dump(arr)),
    // String
    fc.string({ minLength: 1, maxLength: 20 }),
    // Number
    fc.integer().map((n) => String(n)),
    // Null
    fc.constant('null'),
    // Boolean
    fc.boolean().map((b) => String(b))
  );

  /**
   * Property 3.5: Non-object YAML content should be rejected
   * 
   * For any submitted Submission file that parses to a non-object value,
   * the system should return an error.
   */
  it('should reject non-object YAML content', async () => {
    await fc.assert(
      fc.property(nonObjectYamlArb, (content) => {
        const result = validator.validateFormat(content, 'test.yaml');
        
        // Should be invalid
        expect(result.valid).toBe(false);
        expect(result.hardErrors.length).toBeGreaterThan(0);
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3.6: All valid categories should be accepted as template values
   * 
   * For any valid category, when used as the template field value with a matching
   * valid ID format, the submission should be accepted.
   */
  it('should accept all valid categories as template values', async () => {
    await fc.assert(
      fc.property(categoryArb, (category) => {
        const prefix = ID_PREFIXES[category].split('-')[0];
        const content = yaml.dump({
          template: category,
          id: `${prefix}-test-item`,
          name: { zh: '测试' },
        });
        
        const result = validator.validateFormat(content, 'test.yaml');
        
        // Should be valid
        expect(result.valid).toBe(true);
        expect(result.hardErrors).toHaveLength(0);
        
        return true;
      }),
      { numRuns: 100 }
    );
  });
});

describe('Feature: initialize, Property 4: Submission ID 唯一性', () => {
  /**
   * Arbitrary: Generate a random category
   */
  const categoryArb = fc.constantFrom(...CATEGORIES);

  /**
   * Arbitrary: Generate a valid ID for a given category
   */
  const validIdForCategoryArb = (category: Category): fc.Arbitrary<string> => {
    const prefix = ID_PREFIXES[category].split('-')[0];
    return fc.stringOf(
      fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'),
      { minLength: 3, maxLength: 15 }
    ).map((suffix) => `${prefix}-${suffix}`);
  };

  /**
   * Arbitrary: Generate a batch of submissions with unique IDs
   */
  const uniqueIdBatchArb = fc
    .array(categoryArb, { minLength: 2, maxLength: 10 })
    .chain((categories) => {
      // Generate unique IDs for each category
      const idArbs = categories.map((cat, index) => {
        const prefix = ID_PREFIXES[cat].split('-')[0];
        // Use index to ensure uniqueness
        return fc.constant({
          category: cat,
          id: `${prefix}-unique-${index}-${Math.random().toString(36).substring(2, 8)}`,
        });
      });
      return fc.tuple(...idArbs);
    });

  /**
   * Property 4.1: Batch of submissions with unique IDs should all be valid
   * 
   * For any set of Submission files in the same batch where all `id` field values
   * are unique, each submission should pass individual validation.
   */
  it('should accept batch of submissions with unique IDs', async () => {
    await fc.assert(
      fc.property(uniqueIdBatchArb, (submissions) => {
        const ids = submissions.map((s) => s.id);
        const uniqueIds = new Set(ids);
        
        // Verify all IDs are unique
        expect(uniqueIds.size).toBe(ids.length);
        
        // Each submission should be valid
        for (const { category, id } of submissions) {
          const content = yaml.dump({
            template: category,
            id,
            name: { zh: '测试' },
          });
          
          const { result } = parseSubmission(content, `${id}.yaml`);
          expect(result.valid).toBe(true);
        }
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Helper function: Check for duplicate IDs in a batch
   */
  function findDuplicateIds(submissions: ParsedSubmission[]): string[] {
    const idCounts = new Map<string, number>();
    for (const sub of submissions) {
      idCounts.set(sub.id, (idCounts.get(sub.id) || 0) + 1);
    }
    return Array.from(idCounts.entries())
      .filter(([_, count]) => count > 1)
      .map(([id]) => id);
  }

  /**
   * Arbitrary: Generate a batch of submissions with at least one duplicate ID
   */
  const duplicateIdBatchArb = categoryArb.chain((category) => {
    const prefix = ID_PREFIXES[category].split('-')[0];
    return fc
      .stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'), {
        minLength: 3,
        maxLength: 10,
      })
      .map((suffix) => {
        const duplicateId = `${prefix}-${suffix}`;
        // Create at least 2 submissions with the same ID
        return [
          { category, id: duplicateId, index: 1 },
          { category, id: duplicateId, index: 2 },
        ];
      });
  });

  /**
   * Property 4.2: Batch with duplicate IDs should be detected
   * 
   * For any set of Submission files in the same batch where some `id` field values
   * are duplicated, the system should be able to detect the duplicates.
   */
  it('should detect duplicate IDs in a batch', async () => {
    await fc.assert(
      fc.property(duplicateIdBatchArb, (submissions) => {
        // Parse all submissions
        const parsedSubmissions: ParsedSubmission[] = [];
        for (const { category, id, index } of submissions) {
          const content = yaml.dump({
            template: category,
            id,
            name: { zh: `测试${index}` },
          });
          
          const { result, submission } = parseSubmission(content, `${id}-${index}.yaml`);
          if (result.valid && submission) {
            parsedSubmissions.push(submission);
          }
        }
        
        // Find duplicate IDs
        const duplicates = findDuplicateIds(parsedSubmissions);
        
        // Should have at least one duplicate
        expect(duplicates.length).toBeGreaterThan(0);
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Arbitrary: Generate a larger batch with mixed unique and duplicate IDs
   */
  const mixedIdBatchArb = fc
    .tuple(
      fc.array(categoryArb, { minLength: 3, maxLength: 8 }),
      fc.integer({ min: 0, max: 2 }) // Number of duplicates to introduce
    )
    .chain(([categories, numDuplicates]) => {
      const submissions: Array<{ category: Category; id: string }> = [];
      
      // Generate unique submissions
      for (let i = 0; i < categories.length; i++) {
        const cat = categories[i];
        const prefix = ID_PREFIXES[cat].split('-')[0];
        submissions.push({
          category: cat,
          id: `${prefix}-item-${i}-${Math.random().toString(36).substring(2, 6)}`,
        });
      }
      
      // Introduce duplicates by copying some IDs
      for (let i = 0; i < Math.min(numDuplicates, submissions.length); i++) {
        const sourceIndex = i % submissions.length;
        submissions.push({
          category: submissions[sourceIndex].category,
          id: submissions[sourceIndex].id,
        });
      }
      
      return fc.constant(submissions);
    });

  /**
   * Property 4.3: ID uniqueness check should correctly identify all duplicates
   * 
   * For any batch of submissions, the duplicate detection should correctly
   * identify all IDs that appear more than once.
   */
  it('should correctly identify all duplicate IDs in a batch', async () => {
    await fc.assert(
      fc.property(mixedIdBatchArb, (submissions) => {
        // Parse all submissions
        const parsedSubmissions: ParsedSubmission[] = [];
        for (const { category, id } of submissions) {
          const content = yaml.dump({
            template: category,
            id,
            name: { zh: '测试' },
          });
          
          const { result, submission } = parseSubmission(content, `${id}.yaml`);
          if (result.valid && submission) {
            parsedSubmissions.push(submission);
          }
        }
        
        // Find duplicate IDs
        const duplicates = findDuplicateIds(parsedSubmissions);
        
        // Verify duplicates are correctly identified
        const idCounts = new Map<string, number>();
        for (const sub of parsedSubmissions) {
          idCounts.set(sub.id, (idCounts.get(sub.id) || 0) + 1);
        }
        
        // All duplicates should have count > 1
        for (const dupId of duplicates) {
          expect(idCounts.get(dupId)).toBeGreaterThan(1);
        }
        
        // All IDs with count > 1 should be in duplicates
        for (const [id, count] of idCounts.entries()) {
          if (count > 1) {
            expect(duplicates).toContain(id);
          }
        }
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 4.4: Empty batch should have no duplicates
   * 
   * An empty batch of submissions should have no duplicate IDs.
   */
  it('should report no duplicates for empty batch', () => {
    const duplicates = findDuplicateIds([]);
    expect(duplicates).toHaveLength(0);
  });

  /**
   * Property 4.5: Single submission batch should have no duplicates
   * 
   * A batch with only one submission should have no duplicate IDs.
   */
  it('should report no duplicates for single submission batch', async () => {
    await fc.assert(
      fc.property(categoryArb, (category) => {
        const prefix = ID_PREFIXES[category].split('-')[0];
        const content = yaml.dump({
          template: category,
          id: `${prefix}-single-item`,
          name: { zh: '测试' },
        });
        
        const { result, submission } = parseSubmission(content, 'test.yaml');
        expect(result.valid).toBe(true);
        
        if (submission) {
          const duplicates = findDuplicateIds([submission]);
          expect(duplicates).toHaveLength(0);
        }
        
        return true;
      }),
      { numRuns: 100 }
    );
  });
});

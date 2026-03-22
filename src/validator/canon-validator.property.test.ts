/**
 * Canon Validator Property-Based Tests
 * 正史/野史验证器属性测试
 *
 * Feature: initialize
 * - Property 24: 正史唯一性验证
 * - Property 25: 野史引用验证放宽
 * - Property 26: 正史/野史时间线验证差异
 *
 * **Validates: Requirements 10.3, 10.4, 10.5, 10.7**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  createCanonValidator,
  validateCanonUniqueness,
  isCanon,
  getValidationMode,
  shouldRelaxCrossReferenceValidation,
  shouldRelaxTimelineValidation,
  type CanonValidationOptions,
} from './canon-validator.js';
import type {
  Submission,
  Registry,
  RegisteredEntity,
  Category,
} from '../types/index.js';
import { ErrorCodes } from '../types/index.js';

// ============================================================================
// Arbitraries - 数据生成器
// ============================================================================

/**
 * Arbitrary: Generate a valid event/entity ID
 */
const entityIdArb = fc.stringMatching(/^[a-z0-9]{1,10}$/).map((suffix) => `event-${suffix}`);

/**
 * Arbitrary: Generate a valid character ID
 */
const characterIdArb = fc.stringMatching(/^[a-z0-9]{1,10}$/).map((suffix) => `char-${suffix}`);

/**
 * Arbitrary: Generate a valid history ID
 */
const historyIdArb = fc.stringMatching(/^[a-z0-9]{1,10}$/).map((suffix) => `hist-${suffix}`);

/**
 * Arbitrary: Generate a valid file path
 */
const filePathArb = fc.stringMatching(/^submissions\/[a-z]+\/[a-z0-9-]+\.yaml$/);

/**
 * Arbitrary: Generate a valid category
 */
const categoryArb: fc.Arbitrary<Category> = fc.constantFrom(
  'character', 'race', 'creature', 'flora', 'location', 'history', 'faction', 'artifact', 'concept'
);

/**
 * Arbitrary: Generate a valid source author ID
 */
const sourceArb = fc.stringMatching(/^author-[a-z0-9]{1,10}$/);

/**
 * Arbitrary: Generate a valid priority
 */
const priorityArb = fc.constantFrom('official', 'secondary') as fc.Arbitrary<'official' | 'secondary'>;

// ============================================================================
// Helper Functions - 辅助函数
// ============================================================================

/**
 * Create an empty registry
 */
function createEmptyRegistry(): Registry {
  return {
    entities: new Map<string, RegisteredEntity>(),
    index: {
      entries: [],
      lastUpdated: new Date().toISOString(),
    },
  };
}

/**
 * Create a submission with versioning
 */
function createSubmission(
  id: string,
  template: Category,
  canon: boolean,
  source: string = 'test-author',
  priority: 'official' | 'secondary' = 'official',
  additionalFields: Record<string, unknown> = {}
): Submission {
  return {
    template,
    id,
    name: { zh: '测试实体' },
    versioning: {
      canon,
      source,
      priority,
    },
    ...additionalFields,
  };
}

/**
 * Create a registry with an entity
 */
function createRegistryWithEntity(
  id: string,
  category: Category,
  canon: boolean,
  source: string = 'test-author',
  priority: 'official' | 'secondary' = 'official'
): Registry {
  const registry = createEmptyRegistry();
  const entityData = createSubmission(id, category, canon, source, priority);
  registry.entities.set(id, {
    id,
    category,
    data: entityData,
    archivedAt: new Date().toISOString(),
  });
  registry.index.entries.push({
    id,
    category,
    canon,
    priority,
    archivedAt: new Date().toISOString(),
  });
  return registry;
}

/**
 * Create a submission without versioning field
 */
function createSubmissionWithoutVersioning(
  id: string,
  template: Category
): Submission {
  return {
    template,
    id,
    name: { zh: '测试实体' },
  };
}

// ============================================================================
// Property 24: 正史唯一性验证
// **Validates: Requirements 10.3, 10.4**
// ============================================================================

describe('Feature: initialize, Property 24: 正史唯一性验证', () => {
  /**
   * Property 24.1: New canon submission with no existing canon - passes
   *
   * For any event ID with no existing canon version in registry or batch,
   * a new canon: true submission should pass validation.
   */
  it('should pass when submitting new canon version with no existing canon', () => {
    fc.assert(
      fc.property(
        entityIdArb,
        categoryArb,
        sourceArb,
        priorityArb,
        filePathArb,
        (eventId, category, source, priority, filePath) => {
          const validator = createCanonValidator();
          const registry = createEmptyRegistry();
          const submission = createSubmission(eventId, category, true, source, priority);
          const options: CanonValidationOptions = { filePath };

          const result = validator.validateCanonUniqueness(
            submission,
            registry,
            [],
            options
          );

          expect(result.valid).toBe(true);
          expect(result.hardErrors).toHaveLength(0);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 24.2: Non-canon submission when canon exists - passes
   *
   * For any event ID with an existing canon version,
   * a new canon: false submission should pass validation.
   */
  it('should pass when submitting non-canon version even if canon exists', () => {
    fc.assert(
      fc.property(
        entityIdArb,
        categoryArb,
        sourceArb,
        priorityArb,
        filePathArb,
        (eventId, category, source, priority, filePath) => {
          const validator = createCanonValidator();
          const registry = createRegistryWithEntity(eventId, category, true);
          const submission = createSubmission(eventId, category, false, source, priority);
          const options: CanonValidationOptions = { filePath };

          const result = validator.validateCanonUniqueness(
            submission,
            registry,
            [],
            options
          );

          expect(result.valid).toBe(true);
          expect(result.hardErrors).toHaveLength(0);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 24.3: Canon submission when canon exists in registry - returns ERR_CANON_DUPLICATE
   *
   * For any event ID with an existing canon: true version in registry,
   * a new canon: true submission should return ERR_CANON_DUPLICATE error.
   */
  it('should return ERR_CANON_DUPLICATE when canon version exists in registry', () => {
    fc.assert(
      fc.property(
        entityIdArb,
        categoryArb,
        sourceArb,
        priorityArb,
        filePathArb,
        (eventId, category, source, priority, filePath) => {
          const validator = createCanonValidator();
          const registry = createRegistryWithEntity(eventId, category, true);
          const submission = createSubmission(eventId, category, true, source, priority);
          const options: CanonValidationOptions = { filePath };

          const result = validator.validateCanonUniqueness(
            submission,
            registry,
            [],
            options
          );

          expect(result.valid).toBe(false);
          expect(result.hardErrors).toHaveLength(1);
          expect(result.hardErrors[0].code).toBe(ErrorCodes.CANON_DUPLICATE);
          expect(result.hardErrors[0].location.field).toBe('versioning.canon');
          expect(result.hardErrors[0].location.file).toBe(filePath);
          expect(result.hardErrors[0].relatedEntities).toContain(eventId);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 24.4: Canon submission when non-canon exists in registry - passes
   *
   * For any event ID with only non-canon versions in registry,
   * a new canon: true submission should pass validation.
   */
  it('should pass when existing version in registry is non-canon', () => {
    fc.assert(
      fc.property(
        entityIdArb,
        categoryArb,
        sourceArb,
        priorityArb,
        filePathArb,
        (eventId, category, source, priority, filePath) => {
          const validator = createCanonValidator();
          const registry = createRegistryWithEntity(eventId, category, false);
          const submission = createSubmission(eventId, category, true, source, priority);
          const options: CanonValidationOptions = { filePath };

          const result = validator.validateCanonUniqueness(
            submission,
            registry,
            [],
            options
          );

          expect(result.valid).toBe(true);
          expect(result.hardErrors).toHaveLength(0);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 24.5: Canon submission when canon exists in current batch - returns ERR_CANON_DUPLICATE
   *
   * For any event ID with another canon: true submission in the current batch,
   * a new canon: true submission should return ERR_CANON_DUPLICATE error.
   */
  it('should return ERR_CANON_DUPLICATE when duplicate canon exists in batch', () => {
    fc.assert(
      fc.property(
        entityIdArb,
        categoryArb,
        sourceArb,
        sourceArb,
        priorityArb,
        filePathArb,
        (eventId, category, source1, source2, priority, filePath) => {
          const validator = createCanonValidator();
          const registry = createEmptyRegistry();
          const submission1 = createSubmission(eventId, category, true, source1, priority);
          const submission2 = createSubmission(eventId, category, true, source2, priority);
          const currentBatch = [submission1, submission2];
          const options: CanonValidationOptions = { filePath };

          const result = validator.validateCanonUniqueness(
            submission2,
            registry,
            currentBatch,
            options
          );

          expect(result.valid).toBe(false);
          expect(result.hardErrors).toHaveLength(1);
          expect(result.hardErrors[0].code).toBe(ErrorCodes.CANON_DUPLICATE);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 24.6: Mixed canon/non-canon in batch - passes for both
   *
   * For any event ID with one canon and one non-canon submission in batch,
   * both should pass validation.
   */
  it('should pass when batch contains same ID with different canon status', () => {
    fc.assert(
      fc.property(
        entityIdArb,
        categoryArb,
        sourceArb,
        sourceArb,
        priorityArb,
        filePathArb,
        (eventId, category, source1, source2, priority, filePath) => {
          const validator = createCanonValidator();
          const registry = createEmptyRegistry();
          const canonSubmission = createSubmission(eventId, category, true, source1, priority);
          const nonCanonSubmission = createSubmission(eventId, category, false, source2, priority);
          const currentBatch = [canonSubmission, nonCanonSubmission];
          const options: CanonValidationOptions = { filePath };

          // Validate canon version
          const result1 = validator.validateCanonUniqueness(
            canonSubmission,
            registry,
            currentBatch,
            options
          );
          expect(result1.valid).toBe(true);

          // Validate non-canon version
          const result2 = validator.validateCanonUniqueness(
            nonCanonSubmission,
            registry,
            currentBatch,
            options
          );
          expect(result2.valid).toBe(true);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 24.7: Submission does not match against itself in batch
   *
   * For any canon submission included in the current batch,
   * it should not count itself as a duplicate.
   */
  it('should not count the submission itself as duplicate in batch', () => {
    fc.assert(
      fc.property(
        entityIdArb,
        categoryArb,
        sourceArb,
        priorityArb,
        filePathArb,
        (eventId, category, source, priority, filePath) => {
          const validator = createCanonValidator();
          const registry = createEmptyRegistry();
          const submission = createSubmission(eventId, category, true, source, priority);
          const currentBatch = [submission];
          const options: CanonValidationOptions = { filePath };

          const result = validator.validateCanonUniqueness(
            submission,
            registry,
            currentBatch,
            options
          );

          expect(result.valid).toBe(true);
          expect(result.hardErrors).toHaveLength(0);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 24.8: Different IDs with same canon status - passes
   *
   * For any two different event IDs both with canon: true,
   * both should pass validation (no conflict).
   */
  it('should pass when different IDs have same canon status', () => {
    fc.assert(
      fc.property(
        entityIdArb,
        entityIdArb,
        categoryArb,
        sourceArb,
        priorityArb,
        filePathArb,
        (eventId1, eventId2, category, source, priority, filePath) => {
          // Ensure IDs are different
          fc.pre(eventId1 !== eventId2);

          const validator = createCanonValidator();
          const registry = createEmptyRegistry();
          const submission1 = createSubmission(eventId1, category, true, source, priority);
          const submission2 = createSubmission(eventId2, category, true, source, priority);
          const currentBatch = [submission1, submission2];
          const options: CanonValidationOptions = { filePath };

          // Both should pass
          const result1 = validator.validateCanonUniqueness(
            submission1,
            registry,
            currentBatch,
            options
          );
          expect(result1.valid).toBe(true);

          const result2 = validator.validateCanonUniqueness(
            submission2,
            registry,
            currentBatch,
            options
          );
          expect(result2.valid).toBe(true);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 24.9: Multiple non-canon versions with same ID - passes
   *
   * For any event ID with multiple non-canon submissions,
   * all should pass validation (no uniqueness constraint for non-canon).
   */
  it('should pass when multiple non-canon versions exist with same ID', () => {
    fc.assert(
      fc.property(
        entityIdArb,
        categoryArb,
        sourceArb,
        sourceArb,
        priorityArb,
        filePathArb,
        (eventId, category, source1, source2, priority, filePath) => {
          const validator = createCanonValidator();
          const registry = createEmptyRegistry();
          const submission1 = createSubmission(eventId, category, false, source1, priority);
          const submission2 = createSubmission(eventId, category, false, source2, priority);
          const currentBatch = [submission1, submission2];
          const options: CanonValidationOptions = { filePath };

          // Both non-canon versions should pass
          const result1 = validator.validateCanonUniqueness(
            submission1,
            registry,
            currentBatch,
            options
          );
          expect(result1.valid).toBe(true);

          const result2 = validator.validateCanonUniqueness(
            submission2,
            registry,
            currentBatch,
            options
          );
          expect(result2.valid).toBe(true);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 24.10: Error message is bilingual
   *
   * For any validation error, the error message should contain
   * both Chinese and English descriptions.
   */
  it('should include bilingual error messages', () => {
    fc.assert(
      fc.property(
        entityIdArb,
        categoryArb,
        filePathArb,
        (eventId, category, filePath) => {
          const validator = createCanonValidator();
          const registry = createRegistryWithEntity(eventId, category, true);
          const submission = createSubmission(eventId, category, true);
          const options: CanonValidationOptions = { filePath };

          const result = validator.validateCanonUniqueness(
            submission,
            registry,
            [],
            options
          );

          expect(result.hardErrors).toHaveLength(1);
          const error = result.hardErrors[0];

          expect(error.message.zh).toBeDefined();
          expect(error.message.en).toBeDefined();
          expect(error.message.zh.length).toBeGreaterThan(0);
          expect(error.message.en.length).toBeGreaterThan(0);
          expect(error.message.zh).toContain(eventId);
          expect(error.message.en).toContain(eventId);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 24.11: Convenience function produces same results as validator instance
   *
   * The validateCanonUniqueness convenience function should produce the same
   * results as the validator instance method.
   */
  it('should produce same results from convenience function and validator instance', () => {
    fc.assert(
      fc.property(
        entityIdArb,
        categoryArb,
        fc.boolean(),
        fc.boolean(),
        filePathArb,
        (eventId, category, existingCanon, newCanon, filePath) => {
          const validator = createCanonValidator();
          const registry = existingCanon
            ? createRegistryWithEntity(eventId, category, true)
            : createEmptyRegistry();
          const submission = createSubmission(eventId, category, newCanon);
          const options: CanonValidationOptions = { filePath };

          const instanceResult = validator.validateCanonUniqueness(
            submission,
            registry,
            [],
            options
          );

          const convenienceResult = validateCanonUniqueness(
            submission,
            registry,
            [],
            options
          );

          expect(convenienceResult.valid).toBe(instanceResult.valid);
          expect(convenienceResult.hardErrors.length).toBe(instanceResult.hardErrors.length);
          expect(convenienceResult.softWarnings.length).toBe(instanceResult.softWarnings.length);

          if (convenienceResult.hardErrors.length > 0) {
            expect(convenienceResult.hardErrors[0].code).toBe(instanceResult.hardErrors[0].code);
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});


// ============================================================================
// Property 25: 野史引用验证放宽
// **Validates: Requirements 10.5**
// ============================================================================

describe('Feature: initialize, Property 25: 野史引用验证放宽', () => {
  /**
   * Property 25.1: Canon submissions require strict validation
   *
   * For any submission with canon: true,
   * shouldRelaxCrossReferenceValidation should return false.
   */
  it('should return false for canon submissions (strict validation required)', () => {
    fc.assert(
      fc.property(
        entityIdArb,
        categoryArb,
        sourceArb,
        priorityArb,
        (eventId, category, source, priority) => {
          const submission = createSubmission(eventId, category, true, source, priority);

          expect(shouldRelaxCrossReferenceValidation(submission)).toBe(false);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 25.2: Non-canon submissions have relaxed validation
   *
   * For any submission with canon: false,
   * shouldRelaxCrossReferenceValidation should return true.
   */
  it('should return true for non-canon submissions (relaxed validation)', () => {
    fc.assert(
      fc.property(
        entityIdArb,
        categoryArb,
        sourceArb,
        priorityArb,
        (eventId, category, source, priority) => {
          const submission = createSubmission(eventId, category, false, source, priority);

          expect(shouldRelaxCrossReferenceValidation(submission)).toBe(true);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 25.3: isCanon returns true for canon submissions
   *
   * For any submission with versioning.canon: true,
   * isCanon should return true.
   */
  it('should return true from isCanon for canon submissions', () => {
    fc.assert(
      fc.property(
        entityIdArb,
        categoryArb,
        sourceArb,
        priorityArb,
        (eventId, category, source, priority) => {
          const submission = createSubmission(eventId, category, true, source, priority);

          expect(isCanon(submission)).toBe(true);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 25.4: isCanon returns false for non-canon submissions
   *
   * For any submission with versioning.canon: false,
   * isCanon should return false.
   */
  it('should return false from isCanon for non-canon submissions', () => {
    fc.assert(
      fc.property(
        entityIdArb,
        categoryArb,
        sourceArb,
        priorityArb,
        (eventId, category, source, priority) => {
          const submission = createSubmission(eventId, category, false, source, priority);

          expect(isCanon(submission)).toBe(false);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 25.5: Missing versioning defaults to canon (strict validation)
   *
   * For any submission without versioning field,
   * isCanon should return true (default to canon).
   */
  it('should default to canon when versioning is missing', () => {
    fc.assert(
      fc.property(
        entityIdArb,
        categoryArb,
        (eventId, category) => {
          const submission = createSubmissionWithoutVersioning(eventId, category);

          expect(isCanon(submission)).toBe(true);
          expect(shouldRelaxCrossReferenceValidation(submission)).toBe(false);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 25.6: getValidationMode returns 'strict' for canon submissions
   *
   * For any submission with canon: true,
   * getValidationMode should return 'strict'.
   */
  it('should return strict validation mode for canon submissions', () => {
    fc.assert(
      fc.property(
        entityIdArb,
        categoryArb,
        sourceArb,
        priorityArb,
        (eventId, category, source, priority) => {
          const submission = createSubmission(eventId, category, true, source, priority);

          expect(getValidationMode(submission)).toBe('strict');
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 25.7: getValidationMode returns 'relaxed' for non-canon submissions
   *
   * For any submission with canon: false,
   * getValidationMode should return 'relaxed'.
   */
  it('should return relaxed validation mode for non-canon submissions', () => {
    fc.assert(
      fc.property(
        entityIdArb,
        categoryArb,
        sourceArb,
        priorityArb,
        (eventId, category, source, priority) => {
          const submission = createSubmission(eventId, category, false, source, priority);

          expect(getValidationMode(submission)).toBe('relaxed');
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 25.8: Relaxation is consistent across all categories
   *
   * For any category, the relaxation behavior should be consistent:
   * canon: true -> strict, canon: false -> relaxed.
   */
  it('should have consistent relaxation behavior across all categories', () => {
    const allCategories: Category[] = [
      'character', 'race', 'creature', 'flora', 'location',
      'history', 'faction', 'artifact', 'concept'
    ];

    fc.assert(
      fc.property(
        fc.constantFrom(...allCategories),
        entityIdArb,
        fc.boolean(),
        (category, eventId, isCanonValue) => {
          const submission = createSubmission(eventId, category, isCanonValue);

          if (isCanonValue) {
            expect(shouldRelaxCrossReferenceValidation(submission)).toBe(false);
            expect(getValidationMode(submission)).toBe('strict');
          } else {
            expect(shouldRelaxCrossReferenceValidation(submission)).toBe(true);
            expect(getValidationMode(submission)).toBe('relaxed');
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 25.9: Relaxation is independent of source and priority
   *
   * For any submission, the relaxation behavior should depend only on canon status,
   * not on source or priority fields.
   */
  it('should have relaxation independent of source and priority', () => {
    fc.assert(
      fc.property(
        entityIdArb,
        categoryArb,
        fc.boolean(),
        sourceArb,
        sourceArb,
        priorityArb,
        priorityArb,
        (eventId, category, isCanonValue, source1, source2, priority1, priority2) => {
          const submission1 = createSubmission(eventId, category, isCanonValue, source1, priority1);
          const submission2 = createSubmission(eventId, category, isCanonValue, source2, priority2);

          // Both should have same relaxation behavior regardless of source/priority
          expect(shouldRelaxCrossReferenceValidation(submission1))
            .toBe(shouldRelaxCrossReferenceValidation(submission2));
          expect(getValidationMode(submission1)).toBe(getValidationMode(submission2));

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});


// ============================================================================
// Property 26: 正史/野史时间线验证差异
// **Validates: Requirements 10.7**
// ============================================================================

describe('Feature: initialize, Property 26: 正史/野史时间线验证差异', () => {
  /**
   * Property 26.1: Canon submissions require strict timeline validation
   *
   * For any submission with canon: true,
   * shouldRelaxTimelineValidation should return false.
   */
  it('should return false for canon submissions (strict timeline validation)', () => {
    fc.assert(
      fc.property(
        entityIdArb,
        categoryArb,
        sourceArb,
        priorityArb,
        (eventId, category, source, priority) => {
          const submission = createSubmission(eventId, category, true, source, priority);

          expect(shouldRelaxTimelineValidation(submission)).toBe(false);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 26.2: Non-canon submissions skip strict timeline checks
   *
   * For any submission with canon: false,
   * shouldRelaxTimelineValidation should return true.
   */
  it('should return true for non-canon submissions (skip strict timeline checks)', () => {
    fc.assert(
      fc.property(
        entityIdArb,
        categoryArb,
        sourceArb,
        priorityArb,
        (eventId, category, source, priority) => {
          const submission = createSubmission(eventId, category, false, source, priority);

          expect(shouldRelaxTimelineValidation(submission)).toBe(true);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 26.3: Missing versioning defaults to strict timeline validation
   *
   * For any submission without versioning field,
   * shouldRelaxTimelineValidation should return false (default to strict).
   */
  it('should default to strict timeline validation when versioning is missing', () => {
    fc.assert(
      fc.property(
        entityIdArb,
        categoryArb,
        (eventId, category) => {
          const submission = createSubmissionWithoutVersioning(eventId, category);

          expect(shouldRelaxTimelineValidation(submission)).toBe(false);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 26.4: Timeline relaxation is consistent with reference relaxation
   *
   * For any submission, timeline relaxation should be consistent with
   * cross-reference relaxation (both depend on canon status).
   */
  it('should have consistent timeline and reference relaxation', () => {
    fc.assert(
      fc.property(
        entityIdArb,
        categoryArb,
        fc.boolean(),
        sourceArb,
        priorityArb,
        (eventId, category, isCanonValue, source, priority) => {
          const submission = createSubmission(eventId, category, isCanonValue, source, priority);

          // Both relaxation functions should return the same value
          expect(shouldRelaxTimelineValidation(submission))
            .toBe(shouldRelaxCrossReferenceValidation(submission));

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 26.5: Timeline relaxation is consistent across all categories
   *
   * For any category, the timeline relaxation behavior should be consistent:
   * canon: true -> strict, canon: false -> relaxed.
   */
  it('should have consistent timeline relaxation across all categories', () => {
    const allCategories: Category[] = [
      'character', 'race', 'creature', 'flora', 'location',
      'history', 'faction', 'artifact', 'concept'
    ];

    fc.assert(
      fc.property(
        fc.constantFrom(...allCategories),
        entityIdArb,
        fc.boolean(),
        (category, eventId, isCanonValue) => {
          const submission = createSubmission(eventId, category, isCanonValue);

          if (isCanonValue) {
            expect(shouldRelaxTimelineValidation(submission)).toBe(false);
          } else {
            expect(shouldRelaxTimelineValidation(submission)).toBe(true);
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 26.6: Timeline relaxation is independent of source and priority
   *
   * For any submission, the timeline relaxation behavior should depend only on
   * canon status, not on source or priority fields.
   */
  it('should have timeline relaxation independent of source and priority', () => {
    fc.assert(
      fc.property(
        entityIdArb,
        categoryArb,
        fc.boolean(),
        sourceArb,
        sourceArb,
        priorityArb,
        priorityArb,
        (eventId, category, isCanonValue, source1, source2, priority1, priority2) => {
          const submission1 = createSubmission(eventId, category, isCanonValue, source1, priority1);
          const submission2 = createSubmission(eventId, category, isCanonValue, source2, priority2);

          // Both should have same timeline relaxation regardless of source/priority
          expect(shouldRelaxTimelineValidation(submission1))
            .toBe(shouldRelaxTimelineValidation(submission2));

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 26.7: Validation mode determines both reference and timeline behavior
   *
   * For any submission, the validation mode ('strict' or 'relaxed') should
   * correctly predict both reference and timeline validation behavior.
   */
  it('should have validation mode determine both reference and timeline behavior', () => {
    fc.assert(
      fc.property(
        entityIdArb,
        categoryArb,
        fc.boolean(),
        sourceArb,
        priorityArb,
        (eventId, category, isCanonValue, source, priority) => {
          const submission = createSubmission(eventId, category, isCanonValue, source, priority);
          const mode = getValidationMode(submission);

          if (mode === 'strict') {
            expect(shouldRelaxCrossReferenceValidation(submission)).toBe(false);
            expect(shouldRelaxTimelineValidation(submission)).toBe(false);
          } else {
            expect(shouldRelaxCrossReferenceValidation(submission)).toBe(true);
            expect(shouldRelaxTimelineValidation(submission)).toBe(true);
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 26.8: History events with canon: false skip strict timeline checks
   *
   * For any history event submission with canon: false,
   * timeline validation should be relaxed (format only, no strict consistency).
   */
  it('should relax timeline validation for non-canon history events', () => {
    fc.assert(
      fc.property(
        historyIdArb,
        sourceArb,
        priorityArb,
        (histId, source, priority) => {
          const submission = createSubmission(histId, 'history', false, source, priority);

          expect(shouldRelaxTimelineValidation(submission)).toBe(true);
          expect(getValidationMode(submission)).toBe('relaxed');
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 26.9: Characters with canon: false skip strict timeline checks
   *
   * For any character submission with canon: false,
   * timeline validation should be relaxed.
   */
  it('should relax timeline validation for non-canon characters', () => {
    fc.assert(
      fc.property(
        characterIdArb,
        sourceArb,
        priorityArb,
        (charId, source, priority) => {
          const submission = createSubmission(charId, 'character', false, source, priority);

          expect(shouldRelaxTimelineValidation(submission)).toBe(true);
          expect(getValidationMode(submission)).toBe('relaxed');
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 26.10: Canon status is the sole determinant of validation strictness
   *
   * For any two submissions with the same canon status,
   * they should have identical validation strictness regardless of other fields.
   */
  it('should have canon status as sole determinant of validation strictness', () => {
    fc.assert(
      fc.property(
        entityIdArb,
        entityIdArb,
        categoryArb,
        categoryArb,
        fc.boolean(),
        sourceArb,
        sourceArb,
        priorityArb,
        priorityArb,
        (id1, id2, cat1, cat2, isCanonValue, src1, src2, pri1, pri2) => {
          const submission1 = createSubmission(id1, cat1, isCanonValue, src1, pri1);
          const submission2 = createSubmission(id2, cat2, isCanonValue, src2, pri2);

          // Same canon status should result in same validation behavior
          expect(isCanon(submission1)).toBe(isCanon(submission2));
          expect(getValidationMode(submission1)).toBe(getValidationMode(submission2));
          expect(shouldRelaxCrossReferenceValidation(submission1))
            .toBe(shouldRelaxCrossReferenceValidation(submission2));
          expect(shouldRelaxTimelineValidation(submission1))
            .toBe(shouldRelaxTimelineValidation(submission2));

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

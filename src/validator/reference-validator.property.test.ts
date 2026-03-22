/**
 * Reference Validator Property-Based Tests
 * 引用验证器属性测试
 * 
 * Feature: initialize, Property 9: 实体引用存在性验证
 * **Validates: Requirements 4.1, 4.2, 4.6, 4.7, 4.9, 11.3**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  createReferenceValidator,
  isCanonSubmission,
  type ReferenceValidationOptions,
} from './reference-validator.js';
import type {
  Submission,
  Registry,
  EpochIndex,
  TemplateDefinition,
  RegisteredEntity,
  Category,
  FieldDefinition,
  Epoch,
} from '../types/index.js';
import { ErrorCodes, WarningCodes, CATEGORIES } from '../types/index.js';

// ============================================================================
// Arbitraries - 数据生成器
// ============================================================================

/**
 * Arbitrary: Generate a random category
 */
const categoryArb = fc.constantFrom(...CATEGORIES);

/**
 * Arbitrary: Generate a valid entity ID with category prefix
 */
const entityIdArb = (category: Category): fc.Arbitrary<string> =>
  fc.stringMatching(/^[a-z0-9-]{1,15}$/).map((suffix) => `${category.slice(0, 4)}-${suffix}`);

/**
 * Arbitrary: Generate a valid epoch ID
 */
const epochIdArb = fc.stringMatching(/^epoch-[0-9]{2}$/).map((id) => id);

/**
 * Arbitrary: Generate a file path
 */
const filePathArb = fc.stringMatching(/^submissions\/[a-z]+\/[a-z0-9-]+\.yaml$/);

/**
 * Arbitrary: Generate a valid field name
 */
const fieldNameArb = fc.stringMatching(/^[a-z][a-z_]{1,14}$/);

/**
 * Arbitrary: Generate a list of unique epoch IDs
 */
const uniqueEpochIdsArb = (minLength: number, maxLength: number): fc.Arbitrary<string[]> =>
  fc.array(fc.integer({ min: 1, max: 99 }), { minLength: Math.max(minLength, 1), maxLength: maxLength + 2 })
    .map((nums) => [...new Set(nums)].map((n) => `epoch-${n.toString().padStart(2, '0')}`))
    .filter((ids) => ids.length >= minLength);

/**
 * Arbitrary: Generate a list of unique entity IDs for a category
 */
const uniqueEntityIdsArb = (category: Category, minLength: number, maxLength: number): fc.Arbitrary<string[]> =>
  fc.array(fc.stringMatching(/^[a-z0-9]{1,10}$/), { minLength: Math.max(minLength, 1), maxLength: maxLength + 2 })
    .map((suffixes) => [...new Set(suffixes)].map((s) => `${category.slice(0, 4)}-${s}`))
    .filter((ids) => ids.length >= minLength);

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
 * Create a registry with specified entities
 */
function createTestRegistry(entities: Array<{ id: string; category: Category }>): Registry {
  const registry = createEmptyRegistry();
  for (const entity of entities) {
    registry.entities.set(entity.id, {
      id: entity.id,
      category: entity.category,
      data: {
        template: entity.category,
        id: entity.id,
      },
      archivedAt: new Date().toISOString(),
    });
    registry.index.entries.push({
      id: entity.id,
      category: entity.category,
      canon: true,
      priority: 'official',
      archivedAt: new Date().toISOString(),
    });
  }
  return registry;
}

/**
 * Create an epoch index with specified epoch IDs
 */
function createTestEpochIndex(epochIds: string[]): EpochIndex {
  return {
    epochs: epochIds.map((id, index) => ({
      id,
      name: { zh: `纪元${index + 1}`, en: `Epoch ${index + 1}` },
      order: index + 1,
      duration: 1000,
    })),
  };
}

/**
 * Create a test submission
 */
function createTestSubmission(
  id: string,
  template: Category,
  fields: Record<string, unknown> = {},
  canon: boolean = true
): Submission {
  return {
    template,
    id,
    versioning: {
      canon,
      source: 'test-author',
      priority: 'official',
    },
    ...fields,
  };
}

/**
 * Create a test template definition
 */
function createTestTemplate(
  category: Category,
  fields: Array<{ name: string; type: string }>
): TemplateDefinition {
  return {
    category,
    description: { zh: '测试模板', en: 'Test template' },
    required: fields.map((f) => ({
      name: f.name,
      type: f.type as any,
      description: { zh: `${f.name} 字段`, en: `${f.name} field` },
    })),
    optional: [],
  };
}

// ============================================================================
// Property Tests - 属性测试
// ============================================================================

describe('Feature: initialize, Property 9: 实体引用存在性验证', () => {
  /**
   * Property 9.1: Entity reference exists in Registry - validation passes
   * 
   * For any Submission with entity_ref fields, if the referenced entity
   * exists in Registry, validation should pass.
   */
  it('should pass validation when entity reference exists in Registry', () => {
    fc.assert(
      fc.property(
        categoryArb,
        fieldNameArb,
        filePathArb,
        (refCategory, fieldName, filePath) => {
          const validator = createReferenceValidator();
          
          // Generate a valid entity ID
          const refId = fc.sample(entityIdArb(refCategory), 1)[0];
          
          // Create registry with the referenced entity
          const registry = createTestRegistry([{ id: refId, category: refCategory }]);
          
          // Create submission referencing the entity
          const submission = createTestSubmission('test-id', 'character', { [fieldName]: refId });
          const options: ReferenceValidationOptions = { isCanon: true, filePath };
          
          const result = validator.validateEntityRef(
            submission,
            fieldName,
            refId,
            registry,
            [],
            options
          );
          
          expect(result.valid).toBe(true);
          expect(result.hardErrors).toHaveLength(0);
          expect(result.softWarnings).toHaveLength(0);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 9.2: Entity reference exists in current batch - validation passes
   * 
   * For any Submission with entity_ref fields, if the referenced entity
   * exists in the current batch, validation should pass.
   */
  it('should pass validation when entity reference exists in current batch', () => {
    fc.assert(
      fc.property(
        categoryArb,
        fieldNameArb,
        filePathArb,
        (refCategory, fieldName, filePath) => {
          const validator = createReferenceValidator();
          
          // Generate a valid entity ID
          const refId = fc.sample(entityIdArb(refCategory), 1)[0];
          
          // Create empty registry
          const registry = createEmptyRegistry();
          
          // Create current batch with the referenced entity
          const currentBatch: Submission[] = [
            createTestSubmission(refId, refCategory),
          ];
          
          // Create submission referencing the entity
          const submission = createTestSubmission('test-id', 'character', { [fieldName]: refId });
          const options: ReferenceValidationOptions = { isCanon: true, filePath };
          
          const result = validator.validateEntityRef(
            submission,
            fieldName,
            refId,
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
   * Property 9.3: Entity reference missing in canon mode - returns hard error ERR_REF_MISSING
   * 
   * For any Submission with entity_ref fields, if the referenced entity
   * doesn't exist and canon=true, validation should return hard error ERR_REF_MISSING.
   */
  it('should return hard error ERR_REF_MISSING when entity does not exist in canon mode', () => {
    fc.assert(
      fc.property(
        categoryArb,
        fieldNameArb,
        filePathArb,
        (refCategory, fieldName, filePath) => {
          const validator = createReferenceValidator();
          
          // Generate a non-existent entity ID
          const nonExistentId = fc.sample(entityIdArb(refCategory), 1)[0];
          
          // Create empty registry (entity doesn't exist)
          const registry = createEmptyRegistry();
          
          // Create submission referencing the non-existent entity
          const submission = createTestSubmission('test-id', 'character', { [fieldName]: nonExistentId }, true);
          const options: ReferenceValidationOptions = { isCanon: true, filePath };
          
          const result = validator.validateEntityRef(
            submission,
            fieldName,
            nonExistentId,
            registry,
            [],
            options
          );
          
          expect(result.valid).toBe(false);
          expect(result.hardErrors).toHaveLength(1);
          expect(result.hardErrors[0].code).toBe(ErrorCodes.REF_MISSING);
          expect(result.hardErrors[0].location.field).toBe(fieldName);
          expect(result.hardErrors[0].location.file).toBe(filePath);
          expect(result.hardErrors[0].relatedEntities).toContain(nonExistentId);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 9.4: Entity reference missing in non-canon mode - returns soft warning
   * 
   * For any Submission with entity_ref fields, if the referenced entity
   * doesn't exist and canon=false, validation should return soft warning (not hard error).
   */
  it('should return soft warning when entity does not exist in non-canon mode', () => {
    fc.assert(
      fc.property(
        categoryArb,
        fieldNameArb,
        filePathArb,
        (refCategory, fieldName, filePath) => {
          const validator = createReferenceValidator();
          
          // Generate a non-existent entity ID
          const nonExistentId = fc.sample(entityIdArb(refCategory), 1)[0];
          
          // Create empty registry (entity doesn't exist)
          const registry = createEmptyRegistry();
          
          // Create submission referencing the non-existent entity (non-canon)
          const submission = createTestSubmission('test-id', 'character', { [fieldName]: nonExistentId }, false);
          const options: ReferenceValidationOptions = { isCanon: false, filePath };
          
          const result = validator.validateEntityRef(
            submission,
            fieldName,
            nonExistentId,
            registry,
            [],
            options
          );
          
          expect(result.valid).toBe(true);
          expect(result.hardErrors).toHaveLength(0);
          expect(result.softWarnings).toHaveLength(1);
          expect(result.softWarnings[0].code).toBe(WarningCodes.REF_MISSING);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 9.5: Epoch reference exists in epoch index - validation passes
   * 
   * For any Submission with epoch_ref fields, if the referenced epoch
   * exists in epoch index, validation should pass.
   */
  it('should pass validation when epoch reference exists in epoch index', () => {
    fc.assert(
      fc.property(
        uniqueEpochIdsArb(1, 5),
        fieldNameArb,
        filePathArb,
        (epochIds, fieldName, filePath) => {
          const validator = createReferenceValidator();
          
          // Create epoch index with the epochs
          const epochIndex = createTestEpochIndex(epochIds);
          
          // Pick one epoch to reference
          const refEpochId = epochIds[0];
          
          // Create submission referencing the epoch
          const submission = createTestSubmission('test-id', 'character', { [fieldName]: refEpochId });
          const options: ReferenceValidationOptions = { isCanon: true, filePath };
          
          const result = validator.validateEpochRef(
            submission,
            fieldName,
            refEpochId,
            epochIndex,
            options
          );
          
          expect(result.valid).toBe(true);
          expect(result.hardErrors).toHaveLength(0);
          expect(result.softWarnings).toHaveLength(0);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 9.6: Epoch reference missing in canon mode - returns hard error ERR_REF_EPOCH
   * 
   * For any Submission with epoch_ref fields, if the referenced epoch
   * doesn't exist and canon=true, validation should return hard error ERR_REF_EPOCH.
   */
  it('should return hard error ERR_REF_EPOCH when epoch does not exist in canon mode', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 50 }), { minLength: 1, maxLength: 3 })
          .map((nums) => [...new Set(nums)].map((n) => `epoch-${n.toString().padStart(2, '0')}`)),
        fieldNameArb,
        filePathArb,
        (existingEpochIds, fieldName, filePath) => {
          const validator = createReferenceValidator();
          
          // Create epoch index with some epochs (IDs from 01-50)
          const epochIndex = createTestEpochIndex(existingEpochIds);
          
          // Generate a non-existent epoch ID (use 99 which is outside the range 01-50)
          const nonExistentEpochId = 'epoch-99';
          
          // Create submission referencing the non-existent epoch
          const submission = createTestSubmission('test-id', 'character', { [fieldName]: nonExistentEpochId }, true);
          const options: ReferenceValidationOptions = { isCanon: true, filePath };
          
          const result = validator.validateEpochRef(
            submission,
            fieldName,
            nonExistentEpochId,
            epochIndex,
            options
          );
          
          expect(result.valid).toBe(false);
          expect(result.hardErrors).toHaveLength(1);
          expect(result.hardErrors[0].code).toBe(ErrorCodes.REF_EPOCH);
          expect(result.hardErrors[0].location.field).toBe(fieldName);
          expect(result.hardErrors[0].location.file).toBe(filePath);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 9.7: Epoch reference missing in non-canon mode - returns soft warning
   * 
   * For any Submission with epoch_ref fields, if the referenced epoch
   * doesn't exist and canon=false, validation should return soft warning.
   */
  it('should return soft warning when epoch does not exist in non-canon mode', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 50 }), { minLength: 1, maxLength: 3 })
          .map((nums) => [...new Set(nums)].map((n) => `epoch-${n.toString().padStart(2, '0')}`)),
        fieldNameArb,
        filePathArb,
        (existingEpochIds, fieldName, filePath) => {
          const validator = createReferenceValidator();
          
          // Create epoch index with some epochs (IDs from 01-50)
          const epochIndex = createTestEpochIndex(existingEpochIds);
          
          // Generate a non-existent epoch ID (use 99 which is outside the range 01-50)
          const nonExistentEpochId = 'epoch-99';
          
          // Create submission referencing the non-existent epoch (non-canon)
          const submission = createTestSubmission('test-id', 'character', { [fieldName]: nonExistentEpochId }, false);
          const options: ReferenceValidationOptions = { isCanon: false, filePath };
          
          const result = validator.validateEpochRef(
            submission,
            fieldName,
            nonExistentEpochId,
            epochIndex,
            options
          );
          
          expect(result.valid).toBe(true);
          expect(result.hardErrors).toHaveLength(0);
          expect(result.softWarnings).toHaveLength(1);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 9.8: Array<entity_ref> validates each element - all exist
   * 
   * For any Submission with Array<entity_ref> fields, if all referenced
   * entities exist, validation should pass.
   */
  it('should pass validation when all entities in array exist', () => {
    fc.assert(
      fc.property(
        categoryArb,
        uniqueEntityIdsArb('character', 2, 5),
        filePathArb,
        (category, entityIds, filePath) => {
          const validator = createReferenceValidator();
          
          // Create registry with all entities
          const registry = createTestRegistry(
            entityIds.map((id) => ({ id, category: 'character' as Category }))
          );
          
          // Create epoch index
          const epochIndex = createTestEpochIndex(['epoch-01']);
          
          // Create template with array<entity_ref> field
          const template = createTestTemplate('history', [
            { name: 'participants', type: 'array<entity_ref>' },
          ]);
          
          // Create submission with array of entity refs
          const submission = createTestSubmission('event-test', 'history', {
            participants: entityIds,
          });
          const options: ReferenceValidationOptions = { isCanon: true, filePath };
          
          const result = validator.validateAllReferences(
            submission,
            template,
            registry,
            [],
            epochIndex,
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
   * Property 9.9: Array<entity_ref> validates each element - some missing
   * 
   * For any Submission with Array<entity_ref> fields, if some referenced
   * entities don't exist in canon mode, validation should return errors for each missing entity.
   */
  it('should return errors for each missing entity in array', () => {
    fc.assert(
      fc.property(
        uniqueEntityIdsArb('character', 2, 4),
        uniqueEntityIdsArb('character', 1, 2),
        filePathArb,
        (existingIds, missingIds, filePath) => {
          // Ensure no overlap between existing and missing IDs
          const filteredMissingIds = missingIds.filter((id) => !existingIds.includes(id));
          if (filteredMissingIds.length === 0) {
            return true; // Skip this test case
          }
          
          const validator = createReferenceValidator();
          
          // Create registry with only existing entities
          const registry = createTestRegistry(
            existingIds.map((id) => ({ id, category: 'character' as Category }))
          );
          
          // Create epoch index
          const epochIndex = createTestEpochIndex(['epoch-01']);
          
          // Create template with array<entity_ref> field
          const template = createTestTemplate('history', [
            { name: 'participants', type: 'array<entity_ref>' },
          ]);
          
          // Create submission with mix of existing and missing entity refs
          const allIds = [...existingIds, ...filteredMissingIds];
          const submission = createTestSubmission('event-test', 'history', {
            participants: allIds,
          });
          const options: ReferenceValidationOptions = { isCanon: true, filePath };
          
          const result = validator.validateAllReferences(
            submission,
            template,
            registry,
            [],
            epochIndex,
            options
          );
          
          expect(result.valid).toBe(false);
          expect(result.hardErrors.length).toBe(filteredMissingIds.length);
          
          // Each error should have the correct error code
          for (const error of result.hardErrors) {
            expect(error.code).toBe(ErrorCodes.REF_MISSING);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 9.10: validateAllReferences validates both entity_ref and epoch_ref fields
   * 
   * For any Submission with both entity_ref and epoch_ref fields,
   * validateAllReferences should validate all reference fields.
   */
  it('should validate both entity_ref and epoch_ref fields', () => {
    fc.assert(
      fc.property(
        categoryArb,
        uniqueEpochIdsArb(1, 3),
        filePathArb,
        (refCategory, epochIds, filePath) => {
          const validator = createReferenceValidator();
          
          // Generate entity ID
          const entityId = fc.sample(entityIdArb(refCategory), 1)[0];
          const epochId = epochIds[0];
          
          // Create registry with the entity
          const registry = createTestRegistry([{ id: entityId, category: refCategory }]);
          
          // Create epoch index
          const epochIndex = createTestEpochIndex(epochIds);
          
          // Create template with both entity_ref and epoch_ref fields
          const template = createTestTemplate('character', [
            { name: 'race', type: 'entity_ref' },
            { name: 'birth_epoch', type: 'epoch_ref' },
          ]);
          
          // Create submission with both references
          const submission = createTestSubmission('char-test', 'character', {
            race: entityId,
            birth_epoch: epochId,
          });
          const options: ReferenceValidationOptions = { isCanon: true, filePath };
          
          const result = validator.validateAllReferences(
            submission,
            template,
            registry,
            [],
            epochIndex,
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
   * Property 9.11: validateAllReferences collects all reference errors
   * 
   * For any Submission with multiple invalid references,
   * validateAllReferences should collect all errors.
   */
  it('should collect all reference errors when multiple references are invalid', () => {
    fc.assert(
      fc.property(
        filePathArb,
        (filePath) => {
          const validator = createReferenceValidator();
          
          // Create empty registry (no entities exist)
          const registry = createEmptyRegistry();
          
          // Create epoch index with only one epoch
          const epochIndex = createTestEpochIndex(['epoch-01']);
          
          // Create template with both entity_ref and epoch_ref fields
          const template = createTestTemplate('character', [
            { name: 'race', type: 'entity_ref' },
            { name: 'birth_epoch', type: 'epoch_ref' },
          ]);
          
          // Create submission with invalid references
          const submission = createTestSubmission('char-test', 'character', {
            race: 'race-nonexistent',
            birth_epoch: 'epoch-99',
          });
          const options: ReferenceValidationOptions = { isCanon: true, filePath };
          
          const result = validator.validateAllReferences(
            submission,
            template,
            registry,
            [],
            epochIndex,
            options
          );
          
          expect(result.valid).toBe(false);
          expect(result.hardErrors).toHaveLength(2);
          
          const errorCodes = result.hardErrors.map((e) => e.code);
          expect(errorCodes).toContain(ErrorCodes.REF_MISSING);
          expect(errorCodes).toContain(ErrorCodes.REF_EPOCH);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 9.12: validateAllReferences skips undefined fields
   * 
   * For any Submission where reference fields are not filled,
   * validateAllReferences should skip validation for those fields.
   */
  it('should skip validation for undefined reference fields', () => {
    fc.assert(
      fc.property(
        filePathArb,
        (filePath) => {
          const validator = createReferenceValidator();
          
          // Create empty registry
          const registry = createEmptyRegistry();
          
          // Create epoch index
          const epochIndex = createTestEpochIndex(['epoch-01']);
          
          // Create template with entity_ref and epoch_ref fields
          const template = createTestTemplate('character', [
            { name: 'race', type: 'entity_ref' },
            { name: 'birth_epoch', type: 'epoch_ref' },
          ]);
          
          // Create submission without filling reference fields
          const submission = createTestSubmission('char-test', 'character', {});
          const options: ReferenceValidationOptions = { isCanon: true, filePath };
          
          const result = validator.validateAllReferences(
            submission,
            template,
            registry,
            [],
            epochIndex,
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
   * Property 9.13: isCanonSubmission correctly identifies canon status
   * 
   * For any Submission with versioning.canon field,
   * isCanonSubmission should return the correct canon status.
   */
  it('should correctly identify canon status from submission', () => {
    fc.assert(
      fc.property(
        categoryArb,
        fc.boolean(),
        (category, canonValue) => {
          const submission = createTestSubmission('test-id', category, {}, canonValue);
          
          const result = isCanonSubmission(submission);
          
          expect(result).toBe(canonValue);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 9.14: isCanonSubmission defaults to true when versioning is missing
   * 
   * For any Submission without versioning field,
   * isCanonSubmission should return true (default to canon).
   */
  it('should default to canon=true when versioning is missing', () => {
    fc.assert(
      fc.property(
        categoryArb,
        (category) => {
          const submission: Submission = {
            template: category,
            id: 'test-id',
          };
          
          const result = isCanonSubmission(submission);
          
          expect(result).toBe(true);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 9.15: Error messages contain bilingual content
   * 
   * For any validation error, the error message should contain
   * both Chinese and English descriptions.
   */
  it('should include bilingual error messages', () => {
    fc.assert(
      fc.property(
        fieldNameArb,
        filePathArb,
        (fieldName, filePath) => {
          const validator = createReferenceValidator();
          
          const registry = createEmptyRegistry();
          const submission = createTestSubmission('test-id', 'character', {});
          const options: ReferenceValidationOptions = { isCanon: true, filePath };
          
          const result = validator.validateEntityRef(
            submission,
            fieldName,
            'nonexistent-id',
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
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 9.16: Error location includes file path and field name
   * 
   * For any validation error, the error location should include
   * the file path and field name.
   */
  it('should include file path and field name in error location', () => {
    fc.assert(
      fc.property(
        fieldNameArb,
        filePathArb,
        (fieldName, filePath) => {
          const validator = createReferenceValidator();
          
          const registry = createEmptyRegistry();
          const submission = createTestSubmission('test-id', 'character', {});
          const options: ReferenceValidationOptions = { isCanon: true, filePath };
          
          const result = validator.validateEntityRef(
            submission,
            fieldName,
            'nonexistent-id',
            registry,
            [],
            options
          );
          
          expect(result.hardErrors).toHaveLength(1);
          const error = result.hardErrors[0];
          
          expect(error.location.file).toBe(filePath);
          expect(error.location.field).toBe(fieldName);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

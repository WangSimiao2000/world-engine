/**
 * Faction Validator Property-Based Tests
 * 势力验证器属性测试
 * 
 * Feature: initialize, Property 12: 势力纪元不重叠验证
 * **Validates: Requirements 4.10**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  createFactionValidator,
  validateFactionEpochOverlap,
  type FactionValidationOptions,
} from './faction-validator.js';
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
 * Arbitrary: Generate a valid faction ID
 */
const factionIdArb = fc.stringMatching(/^[a-z0-9]{1,10}$/).map((suffix) => `faction-${suffix}`);

/**
 * Arbitrary: Generate a valid epoch ID
 */
const epochIdArb = fc.stringMatching(/^[a-z0-9]{1,10}$/).map((suffix) => `epoch-${suffix}`);

/**
 * Arbitrary: Generate a faction name (Chinese)
 */
const factionNameZhArb = fc.stringMatching(/^[\u4e00-\u9fa5]{2,10}$/);

/**
 * Arbitrary: Generate a file path
 */
const filePathArb = fc.stringMatching(/^submissions\/faction\/[a-z0-9-]+\.yaml$/);

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
 * Create a faction submission
 */
function createFactionSubmission(
  id: string,
  nameZh: string,
  epoch: string
): Submission {
  return {
    template: 'faction',
    id,
    name: { zh: nameZh, en: nameZh },
    epoch,
    faction_type: 'nation',
    active_status: true,
  };
}

/**
 * Create a registry with a faction entity
 */
function createRegistryWithFaction(
  id: string,
  nameZh: string,
  epoch: string
): Registry {
  const registry = createEmptyRegistry();
  const factionData = createFactionSubmission(id, nameZh, epoch);
  registry.entities.set(id, {
    id,
    category: 'faction',
    data: factionData,
    archivedAt: new Date().toISOString(),
  });
  registry.index.entries.push({
    id,
    category: 'faction',
    canon: true,
    priority: 'official',
    archivedAt: new Date().toISOString(),
  });
  return registry;
}

/**
 * Create a non-faction submission
 */
function createNonFactionSubmission(template: Category, id: string): Submission {
  return {
    template,
    id,
    name: { zh: '测试实体' },
  };
}

// ============================================================================
// Property Tests - 属性测试
// ============================================================================

describe('Feature: initialize, Property 12: 势力纪元不重叠验证', () => {
  /**
   * Property 12.1: Unique faction name - validation passes
   * 
   * For any faction submission with a unique name (not existing in registry or batch),
   * validation should pass.
   */
  it('should pass validation when faction name is unique', () => {
    fc.assert(
      fc.property(
        factionIdArb,
        factionNameZhArb,
        epochIdArb,
        filePathArb,
        (factionId, nameZh, epoch, filePath) => {
          const validator = createFactionValidator();
          
          // Create empty registry (no existing factions)
          const registry = createEmptyRegistry();
          
          // Create faction submission with unique name
          const submission = createFactionSubmission(factionId, nameZh, epoch);
          const options: FactionValidationOptions = { filePath };
          
          const result = validator.validateFactionEpochOverlap(
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
   * Property 12.2: Same name in different epochs - validation passes
   * 
   * For any faction submission with the same name as an existing faction
   * but in a different epoch, validation should pass.
   */
  it('should pass validation when same faction name exists in different epoch', () => {
    fc.assert(
      fc.property(
        factionIdArb,
        factionIdArb,
        factionNameZhArb,
        epochIdArb,
        epochIdArb,
        filePathArb,
        (existingId, newId, nameZh, existingEpoch, newEpoch, filePath) => {
          // Ensure epochs are different
          fc.pre(existingEpoch !== newEpoch);
          // Ensure IDs are different
          fc.pre(existingId !== newId);
          
          const validator = createFactionValidator();
          
          // Create registry with existing faction
          const registry = createRegistryWithFaction(existingId, nameZh, existingEpoch);
          
          // Create new faction submission with same name but different epoch
          const submission = createFactionSubmission(newId, nameZh, newEpoch);
          const options: FactionValidationOptions = { filePath };
          
          const result = validator.validateFactionEpochOverlap(
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
   * Property 12.3: Same name in same epoch - returns ERR_FACTION_EPOCH_OVERLAP
   * 
   * For any faction submission with the same name as an existing faction
   * in the same epoch, validation should return ERR_FACTION_EPOCH_OVERLAP.
   */
  it('should return ERR_FACTION_EPOCH_OVERLAP when same name exists in same epoch (registry)', () => {
    fc.assert(
      fc.property(
        factionIdArb,
        factionIdArb,
        factionNameZhArb,
        epochIdArb,
        filePathArb,
        (existingId, newId, nameZh, epoch, filePath) => {
          // Ensure IDs are different
          fc.pre(existingId !== newId);
          
          const validator = createFactionValidator();
          
          // Create registry with existing faction
          const registry = createRegistryWithFaction(existingId, nameZh, epoch);
          
          // Create new faction submission with same name and same epoch
          const submission = createFactionSubmission(newId, nameZh, epoch);
          const options: FactionValidationOptions = { filePath };
          
          const result = validator.validateFactionEpochOverlap(
            submission,
            registry,
            [],
            options
          );
          
          expect(result.valid).toBe(false);
          expect(result.hardErrors).toHaveLength(1);
          expect(result.hardErrors[0].code).toBe(ErrorCodes.FACTION_EPOCH_OVERLAP);
          expect(result.hardErrors[0].location.field).toBe('epoch');
          expect(result.hardErrors[0].location.file).toBe(filePath);
          expect(result.hardErrors[0].relatedEntities).toContain(existingId);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 12.4: Same name in same epoch (current batch) - returns ERR_FACTION_EPOCH_OVERLAP
   * 
   * For any faction submission with the same name as another faction in the current batch
   * in the same epoch, validation should return ERR_FACTION_EPOCH_OVERLAP.
   */
  it('should return ERR_FACTION_EPOCH_OVERLAP when same name exists in same epoch (batch)', () => {
    fc.assert(
      fc.property(
        factionIdArb,
        factionIdArb,
        factionNameZhArb,
        epochIdArb,
        filePathArb,
        (batchId, newId, nameZh, epoch, filePath) => {
          // Ensure IDs are different
          fc.pre(batchId !== newId);
          
          const validator = createFactionValidator();
          
          // Create empty registry
          const registry = createEmptyRegistry();
          
          // Create faction in current batch
          const batchSubmission = createFactionSubmission(batchId, nameZh, epoch);
          
          // Create new faction submission with same name and same epoch
          const submission = createFactionSubmission(newId, nameZh, epoch);
          const options: FactionValidationOptions = { filePath };
          
          const result = validator.validateFactionEpochOverlap(
            submission,
            registry,
            [batchSubmission],
            options
          );
          
          expect(result.valid).toBe(false);
          expect(result.hardErrors).toHaveLength(1);
          expect(result.hardErrors[0].code).toBe(ErrorCodes.FACTION_EPOCH_OVERLAP);
          expect(result.hardErrors[0].relatedEntities).toContain(batchId);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 12.5: Non-faction submissions are skipped
   * 
   * For any non-faction submission, faction epoch overlap validation should be skipped
   * and return valid result.
   */
  it('should skip validation for non-faction submissions', () => {
    const nonFactionCategories: Category[] = [
      'character', 'race', 'creature', 'flora', 'location', 'history', 'artifact', 'concept'
    ];
    
    fc.assert(
      fc.property(
        fc.constantFrom(...nonFactionCategories),
        fc.stringMatching(/^[a-z0-9]{1,10}$/).map((s) => `test-${s}`),
        filePathArb,
        (template, id, filePath) => {
          const validator = createFactionValidator();
          
          // Create non-faction submission
          const submission = createNonFactionSubmission(template, id);
          const registry = createEmptyRegistry();
          const options: FactionValidationOptions = { filePath };
          
          const result = validator.validateFactionEpochOverlap(
            submission,
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
   * Property 12.6: Missing name field is handled gracefully
   * 
   * For any faction submission without name field,
   * validation should be skipped and return valid result.
   */
  it('should skip validation when name field is missing', () => {
    fc.assert(
      fc.property(
        factionIdArb,
        epochIdArb,
        filePathArb,
        (factionId, epoch, filePath) => {
          const validator = createFactionValidator();
          
          // Create faction submission without name
          const submission: Submission = {
            template: 'faction',
            id: factionId,
            epoch,
            faction_type: 'nation',
            active_status: true,
          };
          const registry = createEmptyRegistry();
          const options: FactionValidationOptions = { filePath };
          
          const result = validator.validateFactionEpochOverlap(
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
   * Property 12.7: Missing epoch field is handled gracefully
   * 
   * For any faction submission without epoch field,
   * validation should be skipped and return valid result.
   */
  it('should skip validation when epoch field is missing', () => {
    fc.assert(
      fc.property(
        factionIdArb,
        factionNameZhArb,
        filePathArb,
        (factionId, nameZh, filePath) => {
          const validator = createFactionValidator();
          
          // Create faction submission without epoch
          const submission: Submission = {
            template: 'faction',
            id: factionId,
            name: { zh: nameZh },
            faction_type: 'nation',
            active_status: true,
          };
          const registry = createEmptyRegistry();
          const options: FactionValidationOptions = { filePath };
          
          const result = validator.validateFactionEpochOverlap(
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
   * Property 12.8: Submission does not match against itself in batch
   * 
   * For any faction submission included in the current batch,
   * it should not match against itself.
   */
  it('should not match against itself in current batch', () => {
    fc.assert(
      fc.property(
        factionIdArb,
        factionNameZhArb,
        epochIdArb,
        filePathArb,
        (factionId, nameZh, epoch, filePath) => {
          const validator = createFactionValidator();
          
          // Create empty registry
          const registry = createEmptyRegistry();
          
          // Create faction submission
          const submission = createFactionSubmission(factionId, nameZh, epoch);
          const options: FactionValidationOptions = { filePath };
          
          // Include the same submission in the batch
          const result = validator.validateFactionEpochOverlap(
            submission,
            registry,
            [submission],
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
   * Property 12.9: Different faction names in same epoch - validation passes
   * 
   * For any faction submission with a different name from existing factions
   * in the same epoch, validation should pass.
   */
  it('should pass validation when different faction names exist in same epoch', () => {
    fc.assert(
      fc.property(
        factionIdArb,
        factionIdArb,
        factionNameZhArb,
        factionNameZhArb,
        epochIdArb,
        filePathArb,
        (existingId, newId, existingName, newName, epoch, filePath) => {
          // Ensure names are different
          fc.pre(existingName !== newName);
          // Ensure IDs are different
          fc.pre(existingId !== newId);
          
          const validator = createFactionValidator();
          
          // Create registry with existing faction
          const registry = createRegistryWithFaction(existingId, existingName, epoch);
          
          // Create new faction submission with different name but same epoch
          const submission = createFactionSubmission(newId, newName, epoch);
          const options: FactionValidationOptions = { filePath };
          
          const result = validator.validateFactionEpochOverlap(
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
   * Property 12.10: Error message contains faction name and epoch
   * 
   * For any validation error, the error message should contain
   * the faction name and epoch information.
   */
  it('should include faction name and epoch in error message', () => {
    fc.assert(
      fc.property(
        factionIdArb,
        factionIdArb,
        factionNameZhArb,
        epochIdArb,
        filePathArb,
        (existingId, newId, nameZh, epoch, filePath) => {
          // Ensure IDs are different
          fc.pre(existingId !== newId);
          
          const validator = createFactionValidator();
          
          // Create registry with existing faction
          const registry = createRegistryWithFaction(existingId, nameZh, epoch);
          
          // Create new faction submission with same name and same epoch
          const submission = createFactionSubmission(newId, nameZh, epoch);
          const options: FactionValidationOptions = { filePath };
          
          const result = validator.validateFactionEpochOverlap(
            submission,
            registry,
            [],
            options
          );
          
          expect(result.hardErrors).toHaveLength(1);
          const error = result.hardErrors[0];
          
          // Check that error message contains faction name and epoch
          expect(error.message.zh).toContain(nameZh);
          expect(error.message.zh).toContain(epoch);
          expect(error.message.en).toContain(nameZh);
          expect(error.message.en).toContain(epoch);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 12.11: Error message is bilingual
   * 
   * For any validation error, the error message should contain
   * both Chinese and English descriptions.
   */
  it('should include bilingual error messages', () => {
    fc.assert(
      fc.property(
        factionIdArb,
        factionIdArb,
        factionNameZhArb,
        epochIdArb,
        filePathArb,
        (existingId, newId, nameZh, epoch, filePath) => {
          // Ensure IDs are different
          fc.pre(existingId !== newId);
          
          const validator = createFactionValidator();
          
          // Create registry with existing faction
          const registry = createRegistryWithFaction(existingId, nameZh, epoch);
          
          // Create new faction submission with same name and same epoch
          const submission = createFactionSubmission(newId, nameZh, epoch);
          const options: FactionValidationOptions = { filePath };
          
          const result = validator.validateFactionEpochOverlap(
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
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 12.12: Convenience function works the same as validator instance
   * 
   * The validateFactionEpochOverlap convenience function should produce the same
   * results as the validator instance method.
   */
  it('should produce same results from convenience function and validator instance', () => {
    fc.assert(
      fc.property(
        factionIdArb,
        factionIdArb,
        factionNameZhArb,
        epochIdArb,
        filePathArb,
        fc.boolean(),
        (existingId, newId, nameZh, epoch, filePath, sameEpoch) => {
          // Ensure IDs are different
          fc.pre(existingId !== newId);
          
          const validator = createFactionValidator();
          
          // Create registry with existing faction
          const existingEpoch = sameEpoch ? epoch : `${epoch}-different`;
          const registry = createRegistryWithFaction(existingId, nameZh, existingEpoch);
          
          // Create new faction submission
          const submission = createFactionSubmission(newId, nameZh, epoch);
          const options: FactionValidationOptions = { filePath };
          
          // Get results from both methods
          const instanceResult = validator.validateFactionEpochOverlap(
            submission,
            registry,
            [],
            options
          );
          
          const convenienceResult = validateFactionEpochOverlap(
            submission,
            registry,
            [],
            options
          );
          
          // Results should be equivalent
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

  /**
   * Property 12.13: Invalid name field type is handled gracefully
   * 
   * For any faction submission with invalid name field type (not bilingual),
   * validation should be skipped and return valid result.
   */
  it('should skip validation when name field has invalid type', () => {
    fc.assert(
      fc.property(
        factionIdArb,
        epochIdArb,
        filePathArb,
        fc.oneof(
          fc.constant('string-name'),
          fc.constant(123),
          fc.constant(null),
          fc.constant(undefined)
        ),
        (factionId, epoch, filePath, invalidName) => {
          const validator = createFactionValidator();
          
          // Create faction submission with invalid name type
          const submission: Submission = {
            template: 'faction',
            id: factionId,
            name: invalidName as any,
            epoch,
            faction_type: 'nation',
            active_status: true,
          };
          const registry = createEmptyRegistry();
          const options: FactionValidationOptions = { filePath };
          
          const result = validator.validateFactionEpochOverlap(
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
   * Property 12.14: Invalid epoch field type is handled gracefully
   * 
   * For any faction submission with invalid epoch field type (not string),
   * validation should be skipped and return valid result.
   */
  it('should skip validation when epoch field has invalid type', () => {
    fc.assert(
      fc.property(
        factionIdArb,
        factionNameZhArb,
        filePathArb,
        fc.oneof(
          fc.constant(123),
          fc.constant(null),
          fc.constant(undefined),
          fc.constant({ id: 'epoch-01' })
        ),
        (factionId, nameZh, filePath, invalidEpoch) => {
          const validator = createFactionValidator();
          
          // Create faction submission with invalid epoch type
          const submission: Submission = {
            template: 'faction',
            id: factionId,
            name: { zh: nameZh },
            epoch: invalidEpoch as any,
            faction_type: 'nation',
            active_status: true,
          };
          const registry = createEmptyRegistry();
          const options: FactionValidationOptions = { filePath };
          
          const result = validator.validateFactionEpochOverlap(
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
   * Property 12.15: Multiple overlaps return multiple errors
   * 
   * For any faction submission that overlaps with multiple existing factions
   * (both in registry and batch), validation should return multiple errors.
   */
  it('should return multiple errors when multiple overlaps exist', () => {
    fc.assert(
      fc.property(
        factionIdArb,
        factionIdArb,
        factionIdArb,
        factionNameZhArb,
        epochIdArb,
        filePathArb,
        (registryId, batchId, newId, nameZh, epoch, filePath) => {
          // Ensure all IDs are different
          fc.pre(registryId !== batchId && batchId !== newId && registryId !== newId);
          
          const validator = createFactionValidator();
          
          // Create registry with existing faction
          const registry = createRegistryWithFaction(registryId, nameZh, epoch);
          
          // Create faction in current batch with same name and epoch
          const batchSubmission = createFactionSubmission(batchId, nameZh, epoch);
          
          // Create new faction submission with same name and same epoch
          const submission = createFactionSubmission(newId, nameZh, epoch);
          const options: FactionValidationOptions = { filePath };
          
          const result = validator.validateFactionEpochOverlap(
            submission,
            registry,
            [batchSubmission],
            options
          );
          
          expect(result.valid).toBe(false);
          expect(result.hardErrors).toHaveLength(2);
          expect(result.hardErrors.every(e => e.code === ErrorCodes.FACTION_EPOCH_OVERLAP)).toBe(true);
          
          // Check that both related entities are reported
          const relatedIds = result.hardErrors.flatMap(e => e.relatedEntities || []);
          expect(relatedIds).toContain(registryId);
          expect(relatedIds).toContain(batchId);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

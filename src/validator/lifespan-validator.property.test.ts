/**
 * Lifespan Validator Property-Based Tests
 * 寿命验证器属性测试
 * 
 * Feature: initialize, Property 10: 人物寿命合理性验证
 * **Validates: Requirements 4.4, 4.5**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  createLifespanValidator,
  validateLifespan,
  type LifespanValidationOptions,
} from './lifespan-validator.js';
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
 * Arbitrary: Generate a valid character ID
 */
const characterIdArb = fc.stringMatching(/^[a-z0-9]{1,10}$/).map((suffix) => `char-${suffix}`);

/**
 * Arbitrary: Generate a valid race ID
 */
const raceIdArb = fc.stringMatching(/^[a-z0-9]{1,10}$/).map((suffix) => `race-${suffix}`);

/**
 * Arbitrary: Generate a positive average lifespan (1 to 100000)
 */
const averageLifespanArb = fc.integer({ min: 1, max: 100000 });

/**
 * Arbitrary: Generate a file path
 */
const filePathArb = fc.stringMatching(/^submissions\/character\/[a-z0-9-]+\.yaml$/);

/**
 * Arbitrary: Generate a lifespan within 150% threshold (inclusive)
 */
const lifespanWithinThresholdArb = (averageLifespan: number): fc.Arbitrary<number> => {
  const maxLifespan = Math.floor(averageLifespan * 1.5);
  return fc.integer({ min: 1, max: maxLifespan });
};

/**
 * Arbitrary: Generate a lifespan exceeding 150% threshold
 */
const lifespanExceedingThresholdArb = (averageLifespan: number): fc.Arbitrary<number> => {
  const threshold = Math.floor(averageLifespan * 1.5);
  return fc.integer({ min: threshold + 1, max: threshold + 100000 });
};

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
 * Create a registry with a race entity
 */
function createRegistryWithRace(raceId: string, averageLifespan: number): Registry {
  const registry = createEmptyRegistry();
  const raceData: Submission = {
    template: 'race',
    id: raceId,
    name: { zh: '测试种族' },
    average_lifespan: averageLifespan,
    habitat: { zh: '测试栖息地' },
  };
  registry.entities.set(raceId, {
    id: raceId,
    category: 'race',
    data: raceData,
    archivedAt: new Date().toISOString(),
  });
  registry.index.entries.push({
    id: raceId,
    category: 'race',
    canon: true,
    priority: 'official',
    archivedAt: new Date().toISOString(),
  });
  return registry;
}

/**
 * Create a character submission
 */
function createCharacterSubmission(
  id: string,
  raceId: string,
  lifespan: number,
  canon: boolean = true
): Submission {
  return {
    template: 'character',
    id,
    name: { zh: '测试人物' },
    race: raceId,
    birth_epoch: 'epoch-01',
    birth_year: 1,
    lifespan,
    versioning: {
      canon,
      source: 'test-author',
      priority: 'official',
    },
  };
}

/**
 * Create a race submission
 */
function createRaceSubmission(id: string, averageLifespan: number): Submission {
  return {
    template: 'race',
    id,
    name: { zh: '测试种族' },
    average_lifespan: averageLifespan,
    habitat: { zh: '测试栖息地' },
  };
}

/**
 * Create a non-character submission
 */
function createNonCharacterSubmission(template: Category, id: string): Submission {
  return {
    template,
    id,
    name: { zh: '测试实体' },
  };
}

// ============================================================================
// Property Tests - 属性测试
// ============================================================================

describe('Feature: initialize, Property 10: 人物寿命合理性验证', () => {
  /**
   * Property 10.1: Lifespan within 150% threshold - validation passes
   * 
   * For any character submission with lifespan <= 150% of race's average_lifespan,
   * validation should pass.
   */
  it('should pass validation when lifespan is within 150% of race average lifespan', () => {
    fc.assert(
      fc.property(
        characterIdArb,
        raceIdArb,
        averageLifespanArb,
        filePathArb,
        (charId, raceId, averageLifespan, filePath) => {
          const validator = createLifespanValidator();
          
          // Generate a lifespan within the threshold
          const lifespan = fc.sample(lifespanWithinThresholdArb(averageLifespan), 1)[0];
          
          // Create registry with the race
          const registry = createRegistryWithRace(raceId, averageLifespan);
          
          // Create character submission
          const submission = createCharacterSubmission(charId, raceId, lifespan);
          const options: LifespanValidationOptions = { isCanon: true, filePath };
          
          const result = validator.validateLifespan(
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
   * Property 10.2: Lifespan exceeding 150% threshold - returns hard error ERR_LIFESPAN_EXCEED
   * 
   * For any character submission with lifespan > 150% of race's average_lifespan,
   * validation should return hard error ERR_LIFESPAN_EXCEED.
   */
  it('should return hard error ERR_LIFESPAN_EXCEED when lifespan exceeds 150% of race average', () => {
    fc.assert(
      fc.property(
        characterIdArb,
        raceIdArb,
        averageLifespanArb,
        filePathArb,
        (charId, raceId, averageLifespan, filePath) => {
          const validator = createLifespanValidator();
          
          // Generate a lifespan exceeding the threshold
          const lifespan = fc.sample(lifespanExceedingThresholdArb(averageLifespan), 1)[0];
          
          // Create registry with the race
          const registry = createRegistryWithRace(raceId, averageLifespan);
          
          // Create character submission
          const submission = createCharacterSubmission(charId, raceId, lifespan);
          const options: LifespanValidationOptions = { isCanon: true, filePath };
          
          const result = validator.validateLifespan(
            submission,
            registry,
            [],
            options
          );
          
          expect(result.valid).toBe(false);
          expect(result.hardErrors).toHaveLength(1);
          expect(result.hardErrors[0].code).toBe(ErrorCodes.LIFESPAN_EXCEED);
          expect(result.hardErrors[0].location.field).toBe('lifespan');
          expect(result.hardErrors[0].location.file).toBe(filePath);
          expect(result.hardErrors[0].relatedEntities).toContain(raceId);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 10.3: 150% threshold calculation correctness
   * 
   * For any positive average_lifespan value, the 150% threshold calculation
   * should be correct: threshold = average_lifespan * 1.5
   */
  it('should calculate 150% threshold correctly for any positive average lifespan', () => {
    fc.assert(
      fc.property(
        characterIdArb,
        raceIdArb,
        averageLifespanArb,
        filePathArb,
        (charId, raceId, averageLifespan, filePath) => {
          const validator = createLifespanValidator();
          
          // Calculate the exact threshold
          const threshold = averageLifespan * 1.5;
          
          // Create registry with the race
          const registry = createRegistryWithRace(raceId, averageLifespan);
          
          // Test with lifespan exactly at threshold - should pass
          const submissionAtThreshold = createCharacterSubmission(charId, raceId, Math.floor(threshold));
          const optionsAtThreshold: LifespanValidationOptions = { isCanon: true, filePath };
          
          const resultAtThreshold = validator.validateLifespan(
            submissionAtThreshold,
            registry,
            [],
            optionsAtThreshold
          );
          
          expect(resultAtThreshold.valid).toBe(true);
          
          // Test with lifespan just above threshold - should fail
          const submissionAboveThreshold = createCharacterSubmission(charId, raceId, Math.floor(threshold) + 1);
          const optionsAboveThreshold: LifespanValidationOptions = { isCanon: true, filePath };
          
          const resultAboveThreshold = validator.validateLifespan(
            submissionAboveThreshold,
            registry,
            [],
            optionsAboveThreshold
          );
          
          expect(resultAboveThreshold.valid).toBe(false);
          expect(resultAboveThreshold.hardErrors[0].code).toBe(ErrorCodes.LIFESPAN_EXCEED);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 10.4: Non-character submissions are skipped
   * 
   * For any non-character submission, lifespan validation should be skipped
   * and return valid result.
   */
  it('should skip validation for non-character submissions', () => {
    const nonCharacterCategories: Category[] = [
      'race', 'creature', 'flora', 'location', 'history', 'faction', 'artifact', 'concept'
    ];
    
    fc.assert(
      fc.property(
        fc.constantFrom(...nonCharacterCategories),
        fc.stringMatching(/^[a-z0-9]{1,10}$/).map((s) => `test-${s}`),
        filePathArb,
        (template, id, filePath) => {
          const validator = createLifespanValidator();
          
          // Create non-character submission
          const submission = createNonCharacterSubmission(template, id);
          const registry = createEmptyRegistry();
          const options: LifespanValidationOptions = { isCanon: true, filePath };
          
          const result = validator.validateLifespan(
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
   * Property 10.5: Missing lifespan field is handled gracefully
   * 
   * For any character submission without lifespan field,
   * validation should be skipped and return valid result.
   */
  it('should skip validation when lifespan field is missing', () => {
    fc.assert(
      fc.property(
        characterIdArb,
        raceIdArb,
        averageLifespanArb,
        filePathArb,
        (charId, raceId, averageLifespan, filePath) => {
          const validator = createLifespanValidator();
          
          // Create registry with the race
          const registry = createRegistryWithRace(raceId, averageLifespan);
          
          // Create character submission without lifespan
          const submission: Submission = {
            template: 'character',
            id: charId,
            name: { zh: '测试人物' },
            race: raceId,
            birth_epoch: 'epoch-01',
            birth_year: 1,
          };
          const options: LifespanValidationOptions = { isCanon: true, filePath };
          
          const result = validator.validateLifespan(
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
   * Property 10.6: Missing race field is handled gracefully
   * 
   * For any character submission without race field,
   * validation should be skipped and return valid result.
   */
  it('should skip validation when race field is missing', () => {
    fc.assert(
      fc.property(
        characterIdArb,
        fc.integer({ min: 1, max: 10000 }),
        filePathArb,
        (charId, lifespan, filePath) => {
          const validator = createLifespanValidator();
          
          // Create empty registry
          const registry = createEmptyRegistry();
          
          // Create character submission without race
          const submission: Submission = {
            template: 'character',
            id: charId,
            name: { zh: '测试人物' },
            birth_epoch: 'epoch-01',
            birth_year: 1,
            lifespan,
          };
          const options: LifespanValidationOptions = { isCanon: true, filePath };
          
          const result = validator.validateLifespan(
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
   * Property 10.7: Race entity not found is handled gracefully
   * 
   * For any character submission referencing a non-existent race,
   * lifespan validation should be skipped (reference validation handles this).
   */
  it('should skip validation when race entity is not found', () => {
    fc.assert(
      fc.property(
        characterIdArb,
        raceIdArb,
        fc.integer({ min: 1, max: 10000 }),
        filePathArb,
        (charId, raceId, lifespan, filePath) => {
          const validator = createLifespanValidator();
          
          // Create empty registry (race doesn't exist)
          const registry = createEmptyRegistry();
          
          // Create character submission
          const submission = createCharacterSubmission(charId, raceId, lifespan);
          const options: LifespanValidationOptions = { isCanon: true, filePath };
          
          const result = validator.validateLifespan(
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
   * Property 10.8: Race found in current batch
   * 
   * For any character submission, if the race exists in the current batch
   * (not in registry), validation should still work correctly.
   */
  it('should find race entity in current batch and validate correctly', () => {
    fc.assert(
      fc.property(
        characterIdArb,
        raceIdArb,
        averageLifespanArb,
        filePathArb,
        (charId, raceId, averageLifespan, filePath) => {
          const validator = createLifespanValidator();
          
          // Create empty registry
          const registry = createEmptyRegistry();
          
          // Create race submission in current batch
          const raceSubmission = createRaceSubmission(raceId, averageLifespan);
          
          // Generate a lifespan exceeding the threshold
          const lifespan = fc.sample(lifespanExceedingThresholdArb(averageLifespan), 1)[0];
          
          // Create character submission
          const characterSubmission = createCharacterSubmission(charId, raceId, lifespan);
          const options: LifespanValidationOptions = { isCanon: true, filePath };
          
          const result = validator.validateLifespan(
            characterSubmission,
            registry,
            [raceSubmission],
            options
          );
          
          expect(result.valid).toBe(false);
          expect(result.hardErrors).toHaveLength(1);
          expect(result.hardErrors[0].code).toBe(ErrorCodes.LIFESPAN_EXCEED);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 10.9: Registry takes precedence over current batch
   * 
   * When the same race exists in both registry and current batch,
   * the registry version should be used for validation.
   */
  it('should prefer registry over current batch when race exists in both', () => {
    fc.assert(
      fc.property(
        characterIdArb,
        raceIdArb,
        averageLifespanArb,
        filePathArb,
        (charId, raceId, registryAvgLifespan, filePath) => {
          const validator = createLifespanValidator();
          
          // Registry has race with lower average_lifespan
          const registry = createRegistryWithRace(raceId, registryAvgLifespan);
          
          // Current batch has same race with much higher average_lifespan
          const batchAvgLifespan = registryAvgLifespan * 10;
          const raceSubmission = createRaceSubmission(raceId, batchAvgLifespan);
          
          // Character with lifespan that exceeds registry threshold but not batch threshold
          const lifespan = Math.floor(registryAvgLifespan * 1.5) + 1;
          const characterSubmission = createCharacterSubmission(charId, raceId, lifespan);
          const options: LifespanValidationOptions = { isCanon: true, filePath };
          
          const result = validator.validateLifespan(
            characterSubmission,
            registry,
            [raceSubmission],
            options
          );
          
          // Should fail because registry's lower threshold is used
          expect(result.valid).toBe(false);
          expect(result.hardErrors).toHaveLength(1);
          expect(result.hardErrors[0].code).toBe(ErrorCodes.LIFESPAN_EXCEED);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 10.10: Invalid race average_lifespan is handled gracefully
   * 
   * For any character submission where the race has invalid average_lifespan
   * (non-number or <= 0), validation should be skipped.
   */
  it('should skip validation when race average_lifespan is invalid', () => {
    fc.assert(
      fc.property(
        characterIdArb,
        raceIdArb,
        fc.integer({ min: 1, max: 10000 }),
        filePathArb,
        fc.oneof(
          fc.constant('not-a-number'),
          fc.constant(null),
          fc.constant(undefined),
          fc.integer({ min: -1000, max: 0 })
        ),
        (charId, raceId, lifespan, filePath, invalidAvgLifespan) => {
          const validator = createLifespanValidator();
          
          // Create empty registry
          const registry = createEmptyRegistry();
          
          // Create race submission with invalid average_lifespan
          const raceSubmission: Submission = {
            template: 'race',
            id: raceId,
            name: { zh: '无效种族' },
            average_lifespan: invalidAvgLifespan as any,
            habitat: { zh: '测试栖息地' },
          };
          
          // Create character submission
          const characterSubmission = createCharacterSubmission(charId, raceId, lifespan);
          const options: LifespanValidationOptions = { isCanon: true, filePath };
          
          const result = validator.validateLifespan(
            characterSubmission,
            registry,
            [raceSubmission],
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
   * Property 10.11: Error message contains bilingual content
   * 
   * For any validation error, the error message should contain
   * both Chinese and English descriptions.
   */
  it('should include bilingual error messages', () => {
    fc.assert(
      fc.property(
        characterIdArb,
        raceIdArb,
        averageLifespanArb,
        filePathArb,
        (charId, raceId, averageLifespan, filePath) => {
          const validator = createLifespanValidator();
          
          // Generate a lifespan exceeding the threshold
          const lifespan = fc.sample(lifespanExceedingThresholdArb(averageLifespan), 1)[0];
          
          // Create registry with the race
          const registry = createRegistryWithRace(raceId, averageLifespan);
          
          // Create character submission
          const submission = createCharacterSubmission(charId, raceId, lifespan);
          const options: LifespanValidationOptions = { isCanon: true, filePath };
          
          const result = validator.validateLifespan(
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
   * Property 10.12: Error message contains threshold and lifespan values
   * 
   * For any validation error, the error message should contain
   * the actual lifespan, average lifespan, and threshold values.
   */
  it('should include lifespan and threshold values in error message', () => {
    fc.assert(
      fc.property(
        characterIdArb,
        raceIdArb,
        averageLifespanArb,
        filePathArb,
        (charId, raceId, averageLifespan, filePath) => {
          const validator = createLifespanValidator();
          
          // Generate a lifespan exceeding the threshold
          const lifespan = fc.sample(lifespanExceedingThresholdArb(averageLifespan), 1)[0];
          const threshold = averageLifespan * 1.5;
          
          // Create registry with the race
          const registry = createRegistryWithRace(raceId, averageLifespan);
          
          // Create character submission
          const submission = createCharacterSubmission(charId, raceId, lifespan);
          const options: LifespanValidationOptions = { isCanon: true, filePath };
          
          const result = validator.validateLifespan(
            submission,
            registry,
            [],
            options
          );
          
          expect(result.hardErrors).toHaveLength(1);
          const error = result.hardErrors[0];
          
          // Check that the error message contains the relevant values
          expect(error.message.zh).toContain(String(lifespan));
          expect(error.message.zh).toContain(String(averageLifespan));
          expect(error.message.zh).toContain(String(threshold));
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 10.13: Convenience function works the same as validator instance
   * 
   * The validateLifespan convenience function should produce the same
   * results as the validator instance method.
   */
  it('should produce same results from convenience function and validator instance', () => {
    fc.assert(
      fc.property(
        characterIdArb,
        raceIdArb,
        averageLifespanArb,
        fc.integer({ min: 1, max: 100000 }),
        filePathArb,
        (charId, raceId, averageLifespan, lifespan, filePath) => {
          const validator = createLifespanValidator();
          
          // Create registry with the race
          const registry = createRegistryWithRace(raceId, averageLifespan);
          
          // Create character submission
          const submission = createCharacterSubmission(charId, raceId, lifespan);
          const options: LifespanValidationOptions = { isCanon: true, filePath };
          
          // Get results from both methods
          const instanceResult = validator.validateLifespan(
            submission,
            registry,
            [],
            options
          );
          
          const convenienceResult = validateLifespan(
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
});

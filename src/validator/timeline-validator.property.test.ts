/**
 * Timeline Validator Property-Based Tests
 * 时间线验证器属性测试
 *
 * Feature: initialize
 * - Property 11: 历史事件参与人物生命周期验证
 * - Property 21: 人物生死时间顺序验证
 * - Property 22: 人物寿命计算一致性
 * - Property 23: 历史事件时间顺序验证
 *
 * **Validates: Requirements 9.4, 9.5, 9.6, 9.7**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  createTimelineValidator,
  validateLifecycleOrder,
  validateLifespanConsistency,
  validateEventTimeOrder,
  validateEventParticipants,
  type TimelineValidationOptions,
} from './timeline-validator.js';
import type {
  Submission,
  Registry,
  RegisteredEntity,
  EpochIndex,
  TimePoint,
} from '../types/index.js';
import { ErrorCodes } from '../types/index.js';

// ============================================================================
// Test Epoch Index - 测试用纪元索引
// ============================================================================

/**
 * Create a test epoch index with 3 epochs
 */
function createEpochIndex(): EpochIndex {
  return {
    epochs: [
      { id: 'epoch-01', name: { zh: '混沌纪元' }, order: 1, duration: 10000 },
      { id: 'epoch-02', name: { zh: '神荒纪元' }, order: 2, duration: 5000 },
      { id: 'epoch-03', name: { zh: '人皇纪元' }, order: 3, duration: 3000 },
    ],
  };
}

// ============================================================================
// Arbitraries - 数据生成器
// ============================================================================

/**
 * Arbitrary: Generate a valid epoch ID from the test epoch index
 */
const epochIdArb = fc.constantFrom('epoch-01', 'epoch-02', 'epoch-03');

/**
 * Arbitrary: Generate a valid year within an epoch (1 to 3000)
 */
const yearArb = fc.integer({ min: 1, max: 3000 });

/**
 * Arbitrary: Generate a valid character ID
 */
const characterIdArb = fc.stringMatching(/^[a-z0-9]{1,10}$/).map((suffix) => `char-${suffix}`);

/**
 * Arbitrary: Generate a valid history event ID
 */
const historyIdArb = fc.stringMatching(/^[a-z0-9]{1,10}$/).map((suffix) => `hist-${suffix}`);

/**
 * Arbitrary: Generate a valid race ID
 */
const raceIdArb = fc.stringMatching(/^[a-z0-9]{1,10}$/).map((suffix) => `race-${suffix}`);

/**
 * Arbitrary: Generate a file path
 */
const filePathArb = fc.stringMatching(/^submissions\/[a-z]+\/[a-z0-9-]+\.yaml$/);

/**
 * Arbitrary: Generate a valid time point
 */
const timePointArb: fc.Arbitrary<TimePoint> = fc.record({
  epoch: epochIdArb,
  year: yearArb,
});

/**
 * Arbitrary: Generate a pair of time points where the second is strictly after the first
 */
const orderedTimePointPairArb: fc.Arbitrary<{ earlier: TimePoint; later: TimePoint }> = fc.tuple(
  fc.constantFrom(1, 2, 3),
  yearArb,
  fc.constantFrom(1, 2, 3),
  yearArb
).filter(([epochOrder1, year1, epochOrder2, year2]) => {
  // Ensure later is strictly after earlier
  if (epochOrder1 < epochOrder2) return true;
  if (epochOrder1 === epochOrder2 && year1 < year2) return true;
  return false;
}).map(([epochOrder1, year1, epochOrder2, year2]) => ({
  earlier: { epoch: `epoch-0${epochOrder1}`, year: year1 },
  later: { epoch: `epoch-0${epochOrder2}`, year: year2 },
}));

/**
 * Arbitrary: Generate a pair of time points where the second is before or equal to the first
 */
const invalidOrderTimePointPairArb: fc.Arbitrary<{ start: TimePoint; end: TimePoint }> = fc.tuple(
  fc.constantFrom(1, 2, 3),
  yearArb,
  fc.constantFrom(1, 2, 3),
  yearArb
).filter(([epochOrder1, year1, epochOrder2, year2]) => {
  // Ensure end is before or equal to start
  if (epochOrder2 < epochOrder1) return true;
  if (epochOrder1 === epochOrder2 && year2 <= year1) return true;
  return false;
}).map(([epochOrder1, year1, epochOrder2, year2]) => ({
  start: { epoch: `epoch-0${epochOrder1}`, year: year1 },
  end: { epoch: `epoch-0${epochOrder2}`, year: year2 },
}));

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
 * Create a registry with a character entity
 */
function createRegistryWithCharacter(
  charId: string,
  birthEpoch: string,
  birthYear: number,
  deathEpoch?: string,
  deathYear?: number
): Registry {
  const registry = createEmptyRegistry();
  const charData: Submission = {
    template: 'character',
    id: charId,
    name: { zh: '测试人物' },
    birth_epoch: birthEpoch,
    birth_year: birthYear,
    race: 'race-test',
    lifespan: 100,
  };
  if (deathEpoch !== undefined && deathYear !== undefined) {
    charData['death_epoch'] = deathEpoch;
    charData['death_year'] = deathYear;
  }
  registry.entities.set(charId, {
    id: charId,
    category: 'character',
    data: charData,
    archivedAt: new Date().toISOString(),
  });
  return registry;
}

/**
 * Create a character submission with birth and death info
 */
function createCharacterSubmission(
  id: string,
  birthEpoch: string,
  birthYear: number,
  deathEpoch?: string,
  deathYear?: number,
  lifespan?: number
): Submission {
  const submission: Submission = {
    template: 'character',
    id,
    name: { zh: '测试人物' },
    race: 'race-test',
    birth_epoch: birthEpoch,
    birth_year: birthYear,
  };
  if (deathEpoch !== undefined && deathYear !== undefined) {
    submission['death_epoch'] = deathEpoch;
    submission['death_year'] = deathYear;
  }
  if (lifespan !== undefined) {
    submission['lifespan'] = lifespan;
  }
  return submission;
}

/**
 * Create a history event submission
 */
function createHistorySubmission(
  id: string,
  startEpoch: string,
  startYear: number,
  endEpoch?: string,
  endYear?: number,
  participants: string[] = []
): Submission {
  const submission: Submission = {
    template: 'history',
    id,
    name: { zh: '测试事件' },
    start_epoch: startEpoch,
    start_year: startYear,
    participants,
    versioning: { canon: true, source: 'test', priority: 'official' },
  };
  if (endEpoch !== undefined && endYear !== undefined) {
    submission['end_epoch'] = endEpoch;
    submission['end_year'] = endYear;
  }
  return submission;
}

const defaultOptions: TimelineValidationOptions = {
  isCanon: true,
  filePath: 'test.yaml',
};

// ============================================================================
// Property 21: 人物生死时间顺序验证
// **Validates: Requirements 9.4**
// ============================================================================

describe('Feature: initialize, Property 21: 人物生死时间顺序验证', () => {
  /**
   * Property 21.1: Death time after birth time - validation passes
   *
   * For any character submission where death time is strictly after birth time,
   * validation should pass.
   */
  it('should pass validation when death time is after birth time', () => {
    fc.assert(
      fc.property(
        characterIdArb,
        orderedTimePointPairArb,
        filePathArb,
        (charId, { earlier: birth, later: death }, filePath) => {
          const epochIndex = createEpochIndex();
          const submission = createCharacterSubmission(
            charId,
            birth.epoch,
            birth.year,
            death.epoch,
            death.year
          );
          const options: TimelineValidationOptions = { isCanon: true, filePath };

          const result = validateLifecycleOrder(submission, epochIndex, options);

          expect(result.valid).toBe(true);
          expect(result.hardErrors).toHaveLength(0);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 21.2: Death time before or equal to birth time - returns error
   *
   * For any character submission where death time is before or equal to birth time,
   * validation should return ERR_TIME_ORDER error.
   */
  it('should return error when death time is before or equal to birth time', () => {
    fc.assert(
      fc.property(
        characterIdArb,
        invalidOrderTimePointPairArb,
        filePathArb,
        (charId, { start: birth, end: death }, filePath) => {
          const epochIndex = createEpochIndex();
          const submission = createCharacterSubmission(
            charId,
            birth.epoch,
            birth.year,
            death.epoch,
            death.year
          );
          const options: TimelineValidationOptions = { isCanon: true, filePath };

          const result = validateLifecycleOrder(submission, epochIndex, options);

          expect(result.valid).toBe(false);
          expect(result.hardErrors).toHaveLength(1);
          expect(result.hardErrors[0].code).toBe(ErrorCodes.TIME_ORDER);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 21.3: Missing death info - validation skipped
   *
   * For any character submission without death info (character still alive),
   * validation should be skipped and return valid.
   */
  it('should skip validation when death info is missing', () => {
    fc.assert(
      fc.property(
        characterIdArb,
        timePointArb,
        filePathArb,
        (charId, birth, filePath) => {
          const epochIndex = createEpochIndex();
          const submission = createCharacterSubmission(charId, birth.epoch, birth.year);
          const options: TimelineValidationOptions = { isCanon: true, filePath };

          const result = validateLifecycleOrder(submission, epochIndex, options);

          expect(result.valid).toBe(true);
          expect(result.hardErrors).toHaveLength(0);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 21.4: Non-character submissions - validation skipped
   *
   * For any non-character submission, lifecycle order validation should be skipped.
   */
  it('should skip validation for non-character submissions', () => {
    const nonCharacterTemplates = ['race', 'creature', 'flora', 'location', 'history', 'faction', 'artifact', 'concept'] as const;

    fc.assert(
      fc.property(
        fc.constantFrom(...nonCharacterTemplates),
        fc.stringMatching(/^[a-z0-9]{1,10}$/).map((s) => `test-${s}`),
        filePathArb,
        (template, id, filePath) => {
          const epochIndex = createEpochIndex();
          const submission: Submission = {
            template,
            id,
            name: { zh: '测试实体' },
          };
          const options: TimelineValidationOptions = { isCanon: true, filePath };

          const result = validateLifecycleOrder(submission, epochIndex, options);

          expect(result.valid).toBe(true);
          expect(result.hardErrors).toHaveLength(0);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Property 22: 人物寿命计算一致性
// **Validates: Requirements 9.5**
// ============================================================================

describe('Feature: initialize, Property 22: 人物寿命计算一致性', () => {
  /**
   * Calculate expected lifespan from birth to death
   */
  function calculateExpectedLifespan(
    birth: TimePoint,
    death: TimePoint,
    epochIndex: EpochIndex
  ): number {
    const validator = createTimelineValidator();
    return validator.calculateYearDifference(birth, death, epochIndex);
  }

  /**
   * Property 22.1: Declared lifespan matches calculated lifespan within ±5 years - passes
   *
   * For any character with birth, death, and lifespan fields where the declared
   * lifespan is within ±5 years of the calculated lifespan, validation should pass.
   */
  it('should pass when declared lifespan matches calculated lifespan within ±5 years', () => {
    fc.assert(
      fc.property(
        characterIdArb,
        orderedTimePointPairArb,
        fc.integer({ min: -5, max: 5 }),
        filePathArb,
        (charId, { earlier: birth, later: death }, tolerance, filePath) => {
          const epochIndex = createEpochIndex();
          const calculatedLifespan = calculateExpectedLifespan(birth, death, epochIndex);
          const declaredLifespan = calculatedLifespan + tolerance;

          // Skip if declared lifespan would be negative
          if (declaredLifespan <= 0) return true;

          const submission = createCharacterSubmission(
            charId,
            birth.epoch,
            birth.year,
            death.epoch,
            death.year,
            declaredLifespan
          );
          const options: TimelineValidationOptions = { isCanon: true, filePath };

          const result = validateLifespanConsistency(submission, epochIndex, options);

          expect(result.valid).toBe(true);
          expect(result.hardErrors).toHaveLength(0);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 22.2: Declared lifespan differs by more than ±5 years - returns error
   *
   * For any character where the declared lifespan differs from calculated lifespan
   * by more than 5 years, validation should return ERR_LIFESPAN_MISMATCH error.
   */
  it('should return error when declared lifespan differs by more than ±5 years', () => {
    fc.assert(
      fc.property(
        characterIdArb,
        orderedTimePointPairArb,
        fc.oneof(
          fc.integer({ min: 6, max: 1000 }),
          fc.integer({ min: -1000, max: -6 })
        ),
        filePathArb,
        (charId, { earlier: birth, later: death }, difference, filePath) => {
          const epochIndex = createEpochIndex();
          const calculatedLifespan = calculateExpectedLifespan(birth, death, epochIndex);
          const declaredLifespan = calculatedLifespan + difference;

          // Skip if declared lifespan would be negative or zero
          if (declaredLifespan <= 0) return true;

          const submission = createCharacterSubmission(
            charId,
            birth.epoch,
            birth.year,
            death.epoch,
            death.year,
            declaredLifespan
          );
          const options: TimelineValidationOptions = { isCanon: true, filePath };

          const result = validateLifespanConsistency(submission, epochIndex, options);

          expect(result.valid).toBe(false);
          expect(result.hardErrors).toHaveLength(1);
          expect(result.hardErrors[0].code).toBe(ErrorCodes.LIFESPAN_MISMATCH);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 22.3: Missing lifespan field - validation skipped
   *
   * For any character without lifespan field, validation should be skipped.
   */
  it('should skip validation when lifespan field is missing', () => {
    fc.assert(
      fc.property(
        characterIdArb,
        orderedTimePointPairArb,
        filePathArb,
        (charId, { earlier: birth, later: death }, filePath) => {
          const epochIndex = createEpochIndex();
          const submission = createCharacterSubmission(
            charId,
            birth.epoch,
            birth.year,
            death.epoch,
            death.year
            // No lifespan
          );
          const options: TimelineValidationOptions = { isCanon: true, filePath };

          const result = validateLifespanConsistency(submission, epochIndex, options);

          expect(result.valid).toBe(true);
          expect(result.hardErrors).toHaveLength(0);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 22.4: Missing death info - validation skipped
   *
   * For any character without death info, lifespan consistency validation should be skipped.
   */
  it('should skip validation when death info is missing', () => {
    fc.assert(
      fc.property(
        characterIdArb,
        timePointArb,
        fc.integer({ min: 1, max: 10000 }),
        filePathArb,
        (charId, birth, lifespan, filePath) => {
          const epochIndex = createEpochIndex();
          const submission = createCharacterSubmission(
            charId,
            birth.epoch,
            birth.year,
            undefined,
            undefined,
            lifespan
          );
          const options: TimelineValidationOptions = { isCanon: true, filePath };

          const result = validateLifespanConsistency(submission, epochIndex, options);

          expect(result.valid).toBe(true);
          expect(result.hardErrors).toHaveLength(0);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 22.5: Exactly ±5 years tolerance boundary - passes
   *
   * For any character where the declared lifespan differs from calculated lifespan
   * by exactly 5 years, validation should pass (boundary case).
   */
  it('should pass when difference is exactly 5 years (boundary)', () => {
    fc.assert(
      fc.property(
        characterIdArb,
        orderedTimePointPairArb,
        fc.constantFrom(-5, 5),
        filePathArb,
        (charId, { earlier: birth, later: death }, tolerance, filePath) => {
          const epochIndex = createEpochIndex();
          const calculatedLifespan = calculateExpectedLifespan(birth, death, epochIndex);
          const declaredLifespan = calculatedLifespan + tolerance;

          // Skip if declared lifespan would be negative
          if (declaredLifespan <= 0) return true;

          const submission = createCharacterSubmission(
            charId,
            birth.epoch,
            birth.year,
            death.epoch,
            death.year,
            declaredLifespan
          );
          const options: TimelineValidationOptions = { isCanon: true, filePath };

          const result = validateLifespanConsistency(submission, epochIndex, options);

          expect(result.valid).toBe(true);
          expect(result.hardErrors).toHaveLength(0);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Property 23: 历史事件时间顺序验证
// **Validates: Requirements 9.7**
// ============================================================================

describe('Feature: initialize, Property 23: 历史事件时间顺序验证', () => {
  /**
   * Property 23.1: End time after start time - validation passes
   *
   * For any history event where end time is strictly after start time,
   * validation should pass.
   */
  it('should pass validation when end time is after start time', () => {
    fc.assert(
      fc.property(
        historyIdArb,
        orderedTimePointPairArb,
        filePathArb,
        (histId, { earlier: start, later: end }, filePath) => {
          const epochIndex = createEpochIndex();
          const submission = createHistorySubmission(
            histId,
            start.epoch,
            start.year,
            end.epoch,
            end.year
          );
          const options: TimelineValidationOptions = { isCanon: true, filePath };

          const result = validateEventTimeOrder(submission, epochIndex, options);

          expect(result.valid).toBe(true);
          expect(result.hardErrors).toHaveLength(0);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 23.2: End time before or equal to start time - returns error
   *
   * For any history event where end time is before or equal to start time,
   * validation should return ERR_TIME_ORDER error.
   */
  it('should return error when end time is before or equal to start time', () => {
    fc.assert(
      fc.property(
        historyIdArb,
        invalidOrderTimePointPairArb,
        filePathArb,
        (histId, { start, end }, filePath) => {
          const epochIndex = createEpochIndex();
          const submission = createHistorySubmission(
            histId,
            start.epoch,
            start.year,
            end.epoch,
            end.year
          );
          const options: TimelineValidationOptions = { isCanon: true, filePath };

          const result = validateEventTimeOrder(submission, epochIndex, options);

          expect(result.valid).toBe(false);
          expect(result.hardErrors).toHaveLength(1);
          expect(result.hardErrors[0].code).toBe(ErrorCodes.TIME_ORDER);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 23.3: Missing end time (instant event) - validation skipped
   *
   * For any history event without end time (instant event),
   * validation should be skipped and return valid.
   */
  it('should skip validation when end time is missing (instant event)', () => {
    fc.assert(
      fc.property(
        historyIdArb,
        timePointArb,
        filePathArb,
        (histId, start, filePath) => {
          const epochIndex = createEpochIndex();
          const submission = createHistorySubmission(histId, start.epoch, start.year);
          const options: TimelineValidationOptions = { isCanon: true, filePath };

          const result = validateEventTimeOrder(submission, epochIndex, options);

          expect(result.valid).toBe(true);
          expect(result.hardErrors).toHaveLength(0);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 23.4: Non-history submissions - validation skipped
   *
   * For any non-history submission, event time order validation should be skipped.
   */
  it('should skip validation for non-history submissions', () => {
    const nonHistoryTemplates = ['character', 'race', 'creature', 'flora', 'location', 'faction', 'artifact', 'concept'] as const;

    fc.assert(
      fc.property(
        fc.constantFrom(...nonHistoryTemplates),
        fc.stringMatching(/^[a-z0-9]{1,10}$/).map((s) => `test-${s}`),
        filePathArb,
        (template, id, filePath) => {
          const epochIndex = createEpochIndex();
          const submission: Submission = {
            template,
            id,
            name: { zh: '测试实体' },
          };
          const options: TimelineValidationOptions = { isCanon: true, filePath };

          const result = validateEventTimeOrder(submission, epochIndex, options);

          expect(result.valid).toBe(true);
          expect(result.hardErrors).toHaveLength(0);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Property 11: 历史事件参与人物生命周期验证
// **Validates: Requirements 4.8, 9.6**
// ============================================================================

describe('Feature: initialize, Property 11: 历史事件参与人物生命周期验证', () => {
  /**
   * Property 11.1: Event within participant lifecycle - validation passes
   *
   * For any history event where the event time range falls within each
   * participant's lifecycle [birth, death], validation should pass.
   */
  it('should pass when event is within participant lifecycle', () => {
    fc.assert(
      fc.property(
        historyIdArb,
        characterIdArb,
        // Generate character lifecycle (birth to death)
        orderedTimePointPairArb,
        // Generate event time within lifecycle
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 0, max: 100 }),
        filePathArb,
        (histId, charId, { earlier: birth, later: death }, startOffset, endOffset, filePath) => {
          const epochIndex = createEpochIndex();
          const validator = createTimelineValidator();

          // Calculate the lifecycle duration
          const lifecycleDuration = validator.calculateYearDifference(birth, death, epochIndex);
          if (lifecycleDuration <= 1) return true; // Skip if lifecycle too short

          // Calculate event start and end within lifecycle
          // Event start: birth + startOffset% of lifecycle
          // Event end: birth + endOffset% of lifecycle (but after start)
          const startPercent = Math.min(startOffset, endOffset) / 100;
          const endPercent = Math.max(startOffset, endOffset) / 100;

          // For simplicity, keep event in same epoch as birth
          const eventStartYear = birth.year + Math.floor(lifecycleDuration * startPercent);
          const eventEndYear = birth.year + Math.floor(lifecycleDuration * endPercent);

          // Skip if event would exceed epoch boundaries
          if (eventStartYear >= eventEndYear) return true;

          const registry = createRegistryWithCharacter(
            charId,
            birth.epoch,
            birth.year,
            death.epoch,
            death.year
          );

          const submission = createHistorySubmission(
            histId,
            birth.epoch,
            eventStartYear,
            birth.epoch,
            eventEndYear,
            [charId]
          );
          const options: TimelineValidationOptions = { isCanon: true, filePath };

          const result = validateEventParticipants(
            submission,
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
   * Property 11.2: Event starts before participant birth - returns error
   *
   * For any history event that starts before a participant's birth time,
   * validation should return ERR_EVENT_LIFETIME error.
   */
  it('should return error when event starts before participant birth', () => {
    fc.assert(
      fc.property(
        historyIdArb,
        characterIdArb,
        timePointArb,
        fc.integer({ min: 1, max: 100 }),
        filePathArb,
        (histId, charId, birth, yearsBefore, filePath) => {
          const epochIndex = createEpochIndex();

          // Event starts before birth
          const eventStartYear = Math.max(1, birth.year - yearsBefore);

          // Skip if we can't create a valid "before birth" scenario
          if (eventStartYear >= birth.year) return true;

          const registry = createRegistryWithCharacter(
            charId,
            birth.epoch,
            birth.year,
            birth.epoch,
            birth.year + 100 // Death 100 years after birth
          );

          const submission = createHistorySubmission(
            histId,
            birth.epoch,
            eventStartYear,
            undefined,
            undefined,
            [charId]
          );
          const options: TimelineValidationOptions = { isCanon: true, filePath };

          const result = validateEventParticipants(
            submission,
            registry,
            [],
            epochIndex,
            options
          );

          expect(result.valid).toBe(false);
          expect(result.hardErrors).toHaveLength(1);
          expect(result.hardErrors[0].code).toBe(ErrorCodes.EVENT_LIFETIME);
          expect(result.hardErrors[0].relatedEntities).toContain(charId);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 11.3: Event ends after participant death - returns error
   *
   * For any history event that ends after a participant's death time,
   * validation should return ERR_EVENT_LIFETIME error.
   */
  it('should return error when event ends after participant death', () => {
    fc.assert(
      fc.property(
        historyIdArb,
        characterIdArb,
        orderedTimePointPairArb,
        fc.integer({ min: 1, max: 100 }),
        filePathArb,
        (histId, charId, { earlier: birth, later: death }, yearsAfter, filePath) => {
          const epochIndex = createEpochIndex();

          // Event ends after death
          const eventEndYear = death.year + yearsAfter;

          // Event starts within lifecycle
          const eventStartYear = birth.year + 1;

          // Skip if event start would be after death
          if (eventStartYear >= death.year) return true;

          const registry = createRegistryWithCharacter(
            charId,
            birth.epoch,
            birth.year,
            death.epoch,
            death.year
          );

          const submission = createHistorySubmission(
            histId,
            birth.epoch,
            eventStartYear,
            death.epoch,
            eventEndYear,
            [charId]
          );
          const options: TimelineValidationOptions = { isCanon: true, filePath };

          const result = validateEventParticipants(
            submission,
            registry,
            [],
            epochIndex,
            options
          );

          expect(result.valid).toBe(false);
          expect(result.hardErrors).toHaveLength(1);
          expect(result.hardErrors[0].code).toBe(ErrorCodes.EVENT_LIFETIME);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 11.4: Participant still alive (no death time) - validation passes for future events
   *
   * For any history event where the participant has no death time (still alive),
   * validation should pass as long as event starts after birth.
   */
  it('should pass when participant is still alive and event is after birth', () => {
    fc.assert(
      fc.property(
        historyIdArb,
        characterIdArb,
        timePointArb,
        fc.integer({ min: 1, max: 1000 }),
        filePathArb,
        (histId, charId, birth, yearsAfterBirth, filePath) => {
          const epochIndex = createEpochIndex();

          // Event starts after birth
          const eventStartYear = birth.year + yearsAfterBirth;

          const registry = createRegistryWithCharacter(
            charId,
            birth.epoch,
            birth.year
            // No death time - character still alive
          );

          const submission = createHistorySubmission(
            histId,
            birth.epoch,
            eventStartYear,
            undefined,
            undefined,
            [charId]
          );
          const options: TimelineValidationOptions = { isCanon: true, filePath };

          const result = validateEventParticipants(
            submission,
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
   * Property 11.5: Participant found in current batch - validation works
   *
   * For any history event where the participant exists in the current batch
   * (not in registry), validation should still work correctly.
   */
  it('should find participant in current batch and validate correctly', () => {
    fc.assert(
      fc.property(
        historyIdArb,
        characterIdArb,
        timePointArb,
        fc.integer({ min: 1, max: 100 }),
        filePathArb,
        (histId, charId, birth, yearsBefore, filePath) => {
          const epochIndex = createEpochIndex();

          // Event starts before birth (should fail)
          const eventStartYear = Math.max(1, birth.year - yearsBefore);
          if (eventStartYear >= birth.year) return true;

          const registry = createEmptyRegistry();

          // Character in current batch
          const charSubmission = createCharacterSubmission(
            charId,
            birth.epoch,
            birth.year,
            birth.epoch,
            birth.year + 100,
            100
          );

          const histSubmission = createHistorySubmission(
            histId,
            birth.epoch,
            eventStartYear,
            undefined,
            undefined,
            [charId]
          );
          const options: TimelineValidationOptions = { isCanon: true, filePath };

          const result = validateEventParticipants(
            histSubmission,
            registry,
            [charSubmission],
            epochIndex,
            options
          );

          expect(result.valid).toBe(false);
          expect(result.hardErrors).toHaveLength(1);
          expect(result.hardErrors[0].code).toBe(ErrorCodes.EVENT_LIFETIME);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 11.6: Non-canon mode - returns warning instead of error
   *
   * For any history event in non-canon mode that violates participant lifecycle,
   * validation should return warning instead of hard error.
   */
  it('should return warning instead of error in non-canon mode', () => {
    fc.assert(
      fc.property(
        historyIdArb,
        characterIdArb,
        timePointArb,
        fc.integer({ min: 1, max: 100 }),
        filePathArb,
        (histId, charId, birth, yearsBefore, filePath) => {
          const epochIndex = createEpochIndex();

          // Event starts before birth
          const eventStartYear = Math.max(1, birth.year - yearsBefore);
          if (eventStartYear >= birth.year) return true;

          const registry = createRegistryWithCharacter(
            charId,
            birth.epoch,
            birth.year,
            birth.epoch,
            birth.year + 100
          );

          const submission = createHistorySubmission(
            histId,
            birth.epoch,
            eventStartYear,
            undefined,
            undefined,
            [charId]
          );
          const options: TimelineValidationOptions = { isCanon: false, filePath };

          const result = validateEventParticipants(
            submission,
            registry,
            [],
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
   * Property 11.7: Participant not found - validation skipped
   *
   * For any history event where the participant is not found in registry or batch,
   * validation should be skipped (reference validator handles this).
   */
  it('should skip validation when participant is not found', () => {
    fc.assert(
      fc.property(
        historyIdArb,
        characterIdArb,
        timePointArb,
        filePathArb,
        (histId, charId, start, filePath) => {
          const epochIndex = createEpochIndex();
          const registry = createEmptyRegistry();

          const submission = createHistorySubmission(
            histId,
            start.epoch,
            start.year,
            undefined,
            undefined,
            [charId] // Participant doesn't exist
          );
          const options: TimelineValidationOptions = { isCanon: true, filePath };

          const result = validateEventParticipants(
            submission,
            registry,
            [],
            epochIndex,
            options
          );

          // Should pass because participant not found is handled by reference validator
          expect(result.valid).toBe(true);
          expect(result.hardErrors).toHaveLength(0);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

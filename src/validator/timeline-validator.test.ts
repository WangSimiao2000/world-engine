/**
 * Timeline Validator Tests
 * 时间线验证器单元测试
 */

import { describe, it, expect } from 'vitest';
import {
  createTimelineValidator,
  compareTimePoints,
  calculateYearDifference,
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
import { ErrorCodes, WarningCodes } from '../types/index.js';

describe('TimelineValidator', () => {
  // 创建测试用的纪元索引
  function createEpochIndex(): EpochIndex {
    return {
      epochs: [
        { id: 'epoch-01', name: { zh: '混沌纪元' }, order: 1, duration: 10000 },
        { id: 'epoch-02', name: { zh: '神荒纪元' }, order: 2, duration: 5000 },
        { id: 'epoch-03', name: { zh: '人皇纪元' }, order: 3, duration: 3000 },
      ],
    };
  }

  // 创建测试用的空注册表
  function createEmptyRegistry(): Registry {
    return {
      entities: new Map<string, RegisteredEntity>(),
      index: {
        entries: [],
        lastUpdated: new Date().toISOString(),
      },
    };
  }

  const defaultOptions: TimelineValidationOptions = {
    isCanon: true,
    filePath: 'test.yaml',
  };

  describe('compareTimePoints', () => {
    it('should return negative when first time point is earlier (same epoch)', () => {
      const epochIndex = createEpochIndex();
      const a: TimePoint = { epoch: 'epoch-01', year: 100 };
      const b: TimePoint = { epoch: 'epoch-01', year: 200 };

      const result = compareTimePoints(a, b, epochIndex);
      expect(result).toBeLessThan(0);
    });

    it('should return positive when first time point is later (same epoch)', () => {
      const epochIndex = createEpochIndex();
      const a: TimePoint = { epoch: 'epoch-01', year: 200 };
      const b: TimePoint = { epoch: 'epoch-01', year: 100 };

      const result = compareTimePoints(a, b, epochIndex);
      expect(result).toBeGreaterThan(0);
    });

    it('should return zero when time points are equal', () => {
      const epochIndex = createEpochIndex();
      const a: TimePoint = { epoch: 'epoch-01', year: 100 };
      const b: TimePoint = { epoch: 'epoch-01', year: 100 };

      const result = compareTimePoints(a, b, epochIndex);
      expect(result).toBe(0);
    });

    it('should return negative when first epoch has lower order', () => {
      const epochIndex = createEpochIndex();
      const a: TimePoint = { epoch: 'epoch-01', year: 9999 };
      const b: TimePoint = { epoch: 'epoch-02', year: 1 };

      const result = compareTimePoints(a, b, epochIndex);
      expect(result).toBeLessThan(0);
    });

    it('should return positive when first epoch has higher order', () => {
      const epochIndex = createEpochIndex();
      const a: TimePoint = { epoch: 'epoch-02', year: 1 };
      const b: TimePoint = { epoch: 'epoch-01', year: 9999 };

      const result = compareTimePoints(a, b, epochIndex);
      expect(result).toBeGreaterThan(0);
    });

    it('should return zero when epoch is not found', () => {
      const epochIndex = createEpochIndex();
      const a: TimePoint = { epoch: 'epoch-unknown', year: 100 };
      const b: TimePoint = { epoch: 'epoch-01', year: 100 };

      const result = compareTimePoints(a, b, epochIndex);
      expect(result).toBe(0);
    });
  });

  describe('calculateYearDifference', () => {
    it('should calculate difference within same epoch', () => {
      const epochIndex = createEpochIndex();
      const start: TimePoint = { epoch: 'epoch-01', year: 100 };
      const end: TimePoint = { epoch: 'epoch-01', year: 200 };

      const result = calculateYearDifference(start, end, epochIndex);
      expect(result).toBe(100);
    });

    it('should calculate difference across two epochs', () => {
      const epochIndex = createEpochIndex();
      // epoch-01 has duration 10000
      // From year 9000 to end of epoch-01: 10000 - 9000 = 1000
      // Plus year 500 in epoch-02: 500
      // Total: 1500
      const start: TimePoint = { epoch: 'epoch-01', year: 9000 };
      const end: TimePoint = { epoch: 'epoch-02', year: 500 };

      const result = calculateYearDifference(start, end, epochIndex);
      expect(result).toBe(1500);
    });

    it('should calculate difference across three epochs', () => {
      const epochIndex = createEpochIndex();
      // epoch-01 has duration 10000, epoch-02 has duration 5000
      // From year 9000 to end of epoch-01: 10000 - 9000 = 1000
      // Plus full epoch-02: 5000
      // Plus year 500 in epoch-03: 500
      // Total: 6500
      const start: TimePoint = { epoch: 'epoch-01', year: 9000 };
      const end: TimePoint = { epoch: 'epoch-03', year: 500 };

      const result = calculateYearDifference(start, end, epochIndex);
      expect(result).toBe(6500);
    });

    it('should return zero when epoch is not found', () => {
      const epochIndex = createEpochIndex();
      const start: TimePoint = { epoch: 'epoch-unknown', year: 100 };
      const end: TimePoint = { epoch: 'epoch-01', year: 200 };

      const result = calculateYearDifference(start, end, epochIndex);
      expect(result).toBe(0);
    });

    it('should handle negative difference within same epoch', () => {
      const epochIndex = createEpochIndex();
      const start: TimePoint = { epoch: 'epoch-01', year: 200 };
      const end: TimePoint = { epoch: 'epoch-01', year: 100 };

      const result = calculateYearDifference(start, end, epochIndex);
      expect(result).toBe(-100);
    });
  });

  describe('validateLifecycleOrder', () => {
    it('should pass when death time is after birth time (same epoch)', () => {
      const epochIndex = createEpochIndex();
      const submission: Submission = {
        template: 'character',
        id: 'char-test',
        name: { zh: '测试人物' },
        birth_epoch: 'epoch-01',
        birth_year: 100,
        death_epoch: 'epoch-01',
        death_year: 200,
        lifespan: 100,
        race: 'race-test',
      };

      const result = validateLifecycleOrder(submission, epochIndex, defaultOptions);
      expect(result.valid).toBe(true);
      expect(result.hardErrors).toHaveLength(0);
    });

    it('should pass when death time is after birth time (different epochs)', () => {
      const epochIndex = createEpochIndex();
      const submission: Submission = {
        template: 'character',
        id: 'char-test',
        name: { zh: '测试人物' },
        birth_epoch: 'epoch-01',
        birth_year: 9000,
        death_epoch: 'epoch-02',
        death_year: 500,
        lifespan: 1500,
        race: 'race-test',
      };

      const result = validateLifecycleOrder(submission, epochIndex, defaultOptions);
      expect(result.valid).toBe(true);
      expect(result.hardErrors).toHaveLength(0);
    });

    it('should return error when death time is before birth time (same epoch)', () => {
      const epochIndex = createEpochIndex();
      const submission: Submission = {
        template: 'character',
        id: 'char-test',
        name: { zh: '测试人物' },
        birth_epoch: 'epoch-01',
        birth_year: 200,
        death_epoch: 'epoch-01',
        death_year: 100,
        lifespan: 100,
        race: 'race-test',
      };

      const result = validateLifecycleOrder(submission, epochIndex, defaultOptions);
      expect(result.valid).toBe(false);
      expect(result.hardErrors).toHaveLength(1);
      expect(result.hardErrors[0].code).toBe(ErrorCodes.TIME_ORDER);
    });

    it('should return error when death time is before birth time (different epochs)', () => {
      const epochIndex = createEpochIndex();
      const submission: Submission = {
        template: 'character',
        id: 'char-test',
        name: { zh: '测试人物' },
        birth_epoch: 'epoch-02',
        birth_year: 100,
        death_epoch: 'epoch-01',
        death_year: 9000,
        lifespan: 100,
        race: 'race-test',
      };

      const result = validateLifecycleOrder(submission, epochIndex, defaultOptions);
      expect(result.valid).toBe(false);
      expect(result.hardErrors).toHaveLength(1);
      expect(result.hardErrors[0].code).toBe(ErrorCodes.TIME_ORDER);
    });

    it('should return error when death time equals birth time', () => {
      const epochIndex = createEpochIndex();
      const submission: Submission = {
        template: 'character',
        id: 'char-test',
        name: { zh: '测试人物' },
        birth_epoch: 'epoch-01',
        birth_year: 100,
        death_epoch: 'epoch-01',
        death_year: 100,
        lifespan: 0,
        race: 'race-test',
      };

      const result = validateLifecycleOrder(submission, epochIndex, defaultOptions);
      expect(result.valid).toBe(false);
      expect(result.hardErrors).toHaveLength(1);
      expect(result.hardErrors[0].code).toBe(ErrorCodes.TIME_ORDER);
    });

    it('should skip validation for non-character submissions', () => {
      const epochIndex = createEpochIndex();
      const submission: Submission = {
        template: 'race',
        id: 'race-test',
        name: { zh: '测试种族' },
      };

      const result = validateLifecycleOrder(submission, epochIndex, defaultOptions);
      expect(result.valid).toBe(true);
      expect(result.hardErrors).toHaveLength(0);
    });

    it('should skip validation when death info is missing (character still alive)', () => {
      const epochIndex = createEpochIndex();
      const submission: Submission = {
        template: 'character',
        id: 'char-test',
        name: { zh: '测试人物' },
        birth_epoch: 'epoch-01',
        birth_year: 100,
        lifespan: 100,
        race: 'race-test',
      };

      const result = validateLifecycleOrder(submission, epochIndex, defaultOptions);
      expect(result.valid).toBe(true);
      expect(result.hardErrors).toHaveLength(0);
    });
  });

  describe('validateLifespanConsistency', () => {
    it('should pass when calculated lifespan matches declared lifespan exactly', () => {
      const epochIndex = createEpochIndex();
      const submission: Submission = {
        template: 'character',
        id: 'char-test',
        name: { zh: '测试人物' },
        birth_epoch: 'epoch-01',
        birth_year: 100,
        death_epoch: 'epoch-01',
        death_year: 200,
        lifespan: 100,
        race: 'race-test',
      };

      const result = validateLifespanConsistency(submission, epochIndex, defaultOptions);
      expect(result.valid).toBe(true);
      expect(result.hardErrors).toHaveLength(0);
    });

    it('should pass when difference is within ±5 years tolerance', () => {
      const epochIndex = createEpochIndex();
      const submission: Submission = {
        template: 'character',
        id: 'char-test',
        name: { zh: '测试人物' },
        birth_epoch: 'epoch-01',
        birth_year: 100,
        death_epoch: 'epoch-01',
        death_year: 200,
        lifespan: 105, // calculated is 100, difference is 5
        race: 'race-test',
      };

      const result = validateLifespanConsistency(submission, epochIndex, defaultOptions);
      expect(result.valid).toBe(true);
      expect(result.hardErrors).toHaveLength(0);
    });

    it('should pass when difference is exactly 5 years', () => {
      const epochIndex = createEpochIndex();
      const submission: Submission = {
        template: 'character',
        id: 'char-test',
        name: { zh: '测试人物' },
        birth_epoch: 'epoch-01',
        birth_year: 100,
        death_epoch: 'epoch-01',
        death_year: 200,
        lifespan: 95, // calculated is 100, difference is 5
        race: 'race-test',
      };

      const result = validateLifespanConsistency(submission, epochIndex, defaultOptions);
      expect(result.valid).toBe(true);
      expect(result.hardErrors).toHaveLength(0);
    });

    it('should return error when difference exceeds ±5 years tolerance', () => {
      const epochIndex = createEpochIndex();
      const submission: Submission = {
        template: 'character',
        id: 'char-test',
        name: { zh: '测试人物' },
        birth_epoch: 'epoch-01',
        birth_year: 100,
        death_epoch: 'epoch-01',
        death_year: 200,
        lifespan: 106, // calculated is 100, difference is 6
        race: 'race-test',
      };

      const result = validateLifespanConsistency(submission, epochIndex, defaultOptions);
      expect(result.valid).toBe(false);
      expect(result.hardErrors).toHaveLength(1);
      expect(result.hardErrors[0].code).toBe(ErrorCodes.LIFESPAN_MISMATCH);
    });

    it('should calculate lifespan correctly across epochs', () => {
      const epochIndex = createEpochIndex();
      // epoch-01 duration: 10000
      // From year 9000 to end: 1000
      // Plus year 500 in epoch-02: 500
      // Total: 1500
      const submission: Submission = {
        template: 'character',
        id: 'char-test',
        name: { zh: '测试人物' },
        birth_epoch: 'epoch-01',
        birth_year: 9000,
        death_epoch: 'epoch-02',
        death_year: 500,
        lifespan: 1500,
        race: 'race-test',
      };

      const result = validateLifespanConsistency(submission, epochIndex, defaultOptions);
      expect(result.valid).toBe(true);
      expect(result.hardErrors).toHaveLength(0);
    });

    it('should skip validation for non-character submissions', () => {
      const epochIndex = createEpochIndex();
      const submission: Submission = {
        template: 'race',
        id: 'race-test',
        name: { zh: '测试种族' },
      };

      const result = validateLifespanConsistency(submission, epochIndex, defaultOptions);
      expect(result.valid).toBe(true);
      expect(result.hardErrors).toHaveLength(0);
    });

    it('should skip validation when death info is missing', () => {
      const epochIndex = createEpochIndex();
      const submission: Submission = {
        template: 'character',
        id: 'char-test',
        name: { zh: '测试人物' },
        birth_epoch: 'epoch-01',
        birth_year: 100,
        lifespan: 100,
        race: 'race-test',
      };

      const result = validateLifespanConsistency(submission, epochIndex, defaultOptions);
      expect(result.valid).toBe(true);
      expect(result.hardErrors).toHaveLength(0);
    });

    it('should skip validation when lifespan field is missing', () => {
      const epochIndex = createEpochIndex();
      const submission: Submission = {
        template: 'character',
        id: 'char-test',
        name: { zh: '测试人物' },
        birth_epoch: 'epoch-01',
        birth_year: 100,
        death_epoch: 'epoch-01',
        death_year: 200,
        race: 'race-test',
      };

      const result = validateLifespanConsistency(submission, epochIndex, defaultOptions);
      expect(result.valid).toBe(true);
      expect(result.hardErrors).toHaveLength(0);
    });
  });

  describe('validateEventTimeOrder', () => {
    it('should pass when end time is after start time (same epoch)', () => {
      const epochIndex = createEpochIndex();
      const submission: Submission = {
        template: 'history',
        id: 'hist-test',
        name: { zh: '测试事件' },
        start_epoch: 'epoch-01',
        start_year: 100,
        end_epoch: 'epoch-01',
        end_year: 200,
        participants: [],
        versioning: { canon: true, source: 'test', priority: 'official' },
      };

      const result = validateEventTimeOrder(submission, epochIndex, defaultOptions);
      expect(result.valid).toBe(true);
      expect(result.hardErrors).toHaveLength(0);
    });

    it('should pass when end time is after start time (different epochs)', () => {
      const epochIndex = createEpochIndex();
      const submission: Submission = {
        template: 'history',
        id: 'hist-test',
        name: { zh: '测试事件' },
        start_epoch: 'epoch-01',
        start_year: 9000,
        end_epoch: 'epoch-02',
        end_year: 500,
        participants: [],
        versioning: { canon: true, source: 'test', priority: 'official' },
      };

      const result = validateEventTimeOrder(submission, epochIndex, defaultOptions);
      expect(result.valid).toBe(true);
      expect(result.hardErrors).toHaveLength(0);
    });

    it('should return error when end time is before start time (same epoch)', () => {
      const epochIndex = createEpochIndex();
      const submission: Submission = {
        template: 'history',
        id: 'hist-test',
        name: { zh: '测试事件' },
        start_epoch: 'epoch-01',
        start_year: 200,
        end_epoch: 'epoch-01',
        end_year: 100,
        participants: [],
        versioning: { canon: true, source: 'test', priority: 'official' },
      };

      const result = validateEventTimeOrder(submission, epochIndex, defaultOptions);
      expect(result.valid).toBe(false);
      expect(result.hardErrors).toHaveLength(1);
      expect(result.hardErrors[0].code).toBe(ErrorCodes.TIME_ORDER);
    });

    it('should return error when end time is before start time (different epochs)', () => {
      const epochIndex = createEpochIndex();
      const submission: Submission = {
        template: 'history',
        id: 'hist-test',
        name: { zh: '测试事件' },
        start_epoch: 'epoch-02',
        start_year: 100,
        end_epoch: 'epoch-01',
        end_year: 9000,
        participants: [],
        versioning: { canon: true, source: 'test', priority: 'official' },
      };

      const result = validateEventTimeOrder(submission, epochIndex, defaultOptions);
      expect(result.valid).toBe(false);
      expect(result.hardErrors).toHaveLength(1);
      expect(result.hardErrors[0].code).toBe(ErrorCodes.TIME_ORDER);
    });

    it('should return error when end time equals start time', () => {
      const epochIndex = createEpochIndex();
      const submission: Submission = {
        template: 'history',
        id: 'hist-test',
        name: { zh: '测试事件' },
        start_epoch: 'epoch-01',
        start_year: 100,
        end_epoch: 'epoch-01',
        end_year: 100,
        participants: [],
        versioning: { canon: true, source: 'test', priority: 'official' },
      };

      const result = validateEventTimeOrder(submission, epochIndex, defaultOptions);
      expect(result.valid).toBe(false);
      expect(result.hardErrors).toHaveLength(1);
      expect(result.hardErrors[0].code).toBe(ErrorCodes.TIME_ORDER);
    });

    it('should skip validation for non-history submissions', () => {
      const epochIndex = createEpochIndex();
      const submission: Submission = {
        template: 'character',
        id: 'char-test',
        name: { zh: '测试人物' },
      };

      const result = validateEventTimeOrder(submission, epochIndex, defaultOptions);
      expect(result.valid).toBe(true);
      expect(result.hardErrors).toHaveLength(0);
    });

    it('should skip validation when end time is missing (instant event)', () => {
      const epochIndex = createEpochIndex();
      const submission: Submission = {
        template: 'history',
        id: 'hist-test',
        name: { zh: '测试事件' },
        start_epoch: 'epoch-01',
        start_year: 100,
        participants: [],
        versioning: { canon: true, source: 'test', priority: 'official' },
      };

      const result = validateEventTimeOrder(submission, epochIndex, defaultOptions);
      expect(result.valid).toBe(true);
      expect(result.hardErrors).toHaveLength(0);
    });
  });

  describe('validateEventParticipants', () => {
    // 创建测试用的注册表（包含人物实体）
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

    it('should pass when event is within participant lifecycle', () => {
      const epochIndex = createEpochIndex();
      const registry = createRegistryWithCharacter(
        'char-test',
        'epoch-01',
        100,
        'epoch-01',
        500
      );
      const submission: Submission = {
        template: 'history',
        id: 'hist-test',
        name: { zh: '测试事件' },
        start_epoch: 'epoch-01',
        start_year: 200,
        end_epoch: 'epoch-01',
        end_year: 300,
        participants: ['char-test'],
        versioning: { canon: true, source: 'test', priority: 'official' },
      };

      const result = validateEventParticipants(
        submission,
        registry,
        [],
        epochIndex,
        defaultOptions
      );
      expect(result.valid).toBe(true);
      expect(result.hardErrors).toHaveLength(0);
    });

    it('should pass when event is at exact birth time', () => {
      const epochIndex = createEpochIndex();
      const registry = createRegistryWithCharacter(
        'char-test',
        'epoch-01',
        100,
        'epoch-01',
        500
      );
      const submission: Submission = {
        template: 'history',
        id: 'hist-test',
        name: { zh: '测试事件' },
        start_epoch: 'epoch-01',
        start_year: 100,
        participants: ['char-test'],
        versioning: { canon: true, source: 'test', priority: 'official' },
      };

      const result = validateEventParticipants(
        submission,
        registry,
        [],
        epochIndex,
        defaultOptions
      );
      expect(result.valid).toBe(true);
      expect(result.hardErrors).toHaveLength(0);
    });

    it('should pass when event is at exact death time', () => {
      const epochIndex = createEpochIndex();
      const registry = createRegistryWithCharacter(
        'char-test',
        'epoch-01',
        100,
        'epoch-01',
        500
      );
      const submission: Submission = {
        template: 'history',
        id: 'hist-test',
        name: { zh: '测试事件' },
        start_epoch: 'epoch-01',
        start_year: 500,
        participants: ['char-test'],
        versioning: { canon: true, source: 'test', priority: 'official' },
      };

      const result = validateEventParticipants(
        submission,
        registry,
        [],
        epochIndex,
        defaultOptions
      );
      expect(result.valid).toBe(true);
      expect(result.hardErrors).toHaveLength(0);
    });

    it('should return error when event starts before participant birth', () => {
      const epochIndex = createEpochIndex();
      const registry = createRegistryWithCharacter(
        'char-test',
        'epoch-01',
        200,
        'epoch-01',
        500
      );
      const submission: Submission = {
        template: 'history',
        id: 'hist-test',
        name: { zh: '测试事件' },
        start_epoch: 'epoch-01',
        start_year: 100,
        participants: ['char-test'],
        versioning: { canon: true, source: 'test', priority: 'official' },
      };

      const result = validateEventParticipants(
        submission,
        registry,
        [],
        epochIndex,
        defaultOptions
      );
      expect(result.valid).toBe(false);
      expect(result.hardErrors).toHaveLength(1);
      expect(result.hardErrors[0].code).toBe(ErrorCodes.EVENT_LIFETIME);
      expect(result.hardErrors[0].relatedEntities).toContain('char-test');
    });

    it('should return error when event ends after participant death', () => {
      const epochIndex = createEpochIndex();
      const registry = createRegistryWithCharacter(
        'char-test',
        'epoch-01',
        100,
        'epoch-01',
        300
      );
      const submission: Submission = {
        template: 'history',
        id: 'hist-test',
        name: { zh: '测试事件' },
        start_epoch: 'epoch-01',
        start_year: 200,
        end_epoch: 'epoch-01',
        end_year: 400,
        participants: ['char-test'],
        versioning: { canon: true, source: 'test', priority: 'official' },
      };

      const result = validateEventParticipants(
        submission,
        registry,
        [],
        epochIndex,
        defaultOptions
      );
      expect(result.valid).toBe(false);
      expect(result.hardErrors).toHaveLength(1);
      expect(result.hardErrors[0].code).toBe(ErrorCodes.EVENT_LIFETIME);
    });

    it('should pass when participant is still alive (no death time)', () => {
      const epochIndex = createEpochIndex();
      const registry = createRegistryWithCharacter(
        'char-test',
        'epoch-01',
        100
        // No death time - character is still alive
      );
      const submission: Submission = {
        template: 'history',
        id: 'hist-test',
        name: { zh: '测试事件' },
        start_epoch: 'epoch-03',
        start_year: 2000,
        participants: ['char-test'],
        versioning: { canon: true, source: 'test', priority: 'official' },
      };

      const result = validateEventParticipants(
        submission,
        registry,
        [],
        epochIndex,
        defaultOptions
      );
      expect(result.valid).toBe(true);
      expect(result.hardErrors).toHaveLength(0);
    });

    it('should find participant in current batch', () => {
      const epochIndex = createEpochIndex();
      const registry = createEmptyRegistry();
      const charSubmission: Submission = {
        template: 'character',
        id: 'char-new',
        name: { zh: '新人物' },
        birth_epoch: 'epoch-01',
        birth_year: 200,
        death_epoch: 'epoch-01',
        death_year: 500,
        race: 'race-test',
        lifespan: 300,
      };
      const histSubmission: Submission = {
        template: 'history',
        id: 'hist-test',
        name: { zh: '测试事件' },
        start_epoch: 'epoch-01',
        start_year: 100, // Before birth
        participants: ['char-new'],
        versioning: { canon: true, source: 'test', priority: 'official' },
      };

      const result = validateEventParticipants(
        histSubmission,
        registry,
        [charSubmission],
        epochIndex,
        defaultOptions
      );
      expect(result.valid).toBe(false);
      expect(result.hardErrors).toHaveLength(1);
      expect(result.hardErrors[0].code).toBe(ErrorCodes.EVENT_LIFETIME);
    });

    it('should skip validation for non-history submissions', () => {
      const epochIndex = createEpochIndex();
      const registry = createEmptyRegistry();
      const submission: Submission = {
        template: 'character',
        id: 'char-test',
        name: { zh: '测试人物' },
      };

      const result = validateEventParticipants(
        submission,
        registry,
        [],
        epochIndex,
        defaultOptions
      );
      expect(result.valid).toBe(true);
      expect(result.hardErrors).toHaveLength(0);
    });

    it('should skip validation when participant is not found', () => {
      const epochIndex = createEpochIndex();
      const registry = createEmptyRegistry();
      const submission: Submission = {
        template: 'history',
        id: 'hist-test',
        name: { zh: '测试事件' },
        start_epoch: 'epoch-01',
        start_year: 100,
        participants: ['char-nonexistent'],
        versioning: { canon: true, source: 'test', priority: 'official' },
      };

      const result = validateEventParticipants(
        submission,
        registry,
        [],
        epochIndex,
        defaultOptions
      );
      // Should pass because participant not found is handled by reference validator
      expect(result.valid).toBe(true);
      expect(result.hardErrors).toHaveLength(0);
    });

    it('should validate multiple participants', () => {
      const epochIndex = createEpochIndex();
      const registry = createEmptyRegistry();
      // char-1: born at 100, died at 300
      // char-2: born at 100, died at 400
      const char1: Submission = {
        template: 'character',
        id: 'char-1',
        name: { zh: '人物1' },
        birth_epoch: 'epoch-01',
        birth_year: 100,
        death_epoch: 'epoch-01',
        death_year: 300,
        race: 'race-test',
        lifespan: 200,
      };
      const char2: Submission = {
        template: 'character',
        id: 'char-2',
        name: { zh: '人物2' },
        birth_epoch: 'epoch-01',
        birth_year: 100,
        death_epoch: 'epoch-01',
        death_year: 400,
        race: 'race-test',
        lifespan: 300,
      };
      // Event from 150 to 350 - char-1 dies at 300, so event ends after death
      // char-2 is fine (born 100, died 400, event 150-350 is within)
      const histSubmission: Submission = {
        template: 'history',
        id: 'hist-test',
        name: { zh: '测试事件' },
        start_epoch: 'epoch-01',
        start_year: 150,
        end_epoch: 'epoch-01',
        end_year: 350,
        participants: ['char-1', 'char-2'],
        versioning: { canon: true, source: 'test', priority: 'official' },
      };

      const result = validateEventParticipants(
        histSubmission,
        registry,
        [char1, char2],
        epochIndex,
        defaultOptions
      );
      expect(result.valid).toBe(false);
      // char-1: event starts after birth (150 > 100, OK) but ends after death (350 > 300, ERROR)
      // char-2: event is within lifecycle (150-350 within 100-400, OK)
      expect(result.hardErrors).toHaveLength(1);
      expect(result.hardErrors[0].relatedEntities).toContain('char-1');
    });

    it('should return warning instead of error in non-canon mode', () => {
      const epochIndex = createEpochIndex();
      const registry = createRegistryWithCharacter(
        'char-test',
        'epoch-01',
        200,
        'epoch-01',
        500
      );
      const submission: Submission = {
        template: 'history',
        id: 'hist-test',
        name: { zh: '测试事件' },
        start_epoch: 'epoch-01',
        start_year: 100, // Before birth
        participants: ['char-test'],
        versioning: { canon: false, source: 'test', priority: 'secondary' },
      };

      const nonCanonOptions: TimelineValidationOptions = {
        isCanon: false,
        filePath: 'test.yaml',
      };

      const result = validateEventParticipants(
        submission,
        registry,
        [],
        epochIndex,
        nonCanonOptions
      );
      expect(result.valid).toBe(true);
      expect(result.hardErrors).toHaveLength(0);
      expect(result.softWarnings).toHaveLength(1);
      expect(result.softWarnings[0].code).toBe(WarningCodes.EVENT_LIFETIME);
    });
  });

  describe('createTimelineValidator', () => {
    it('should create a validator instance', () => {
      const validator = createTimelineValidator();
      expect(validator).toBeDefined();
      expect(typeof validator.compareTimePoints).toBe('function');
      expect(typeof validator.calculateYearDifference).toBe('function');
      expect(typeof validator.validateLifecycleOrder).toBe('function');
      expect(typeof validator.validateLifespanConsistency).toBe('function');
      expect(typeof validator.validateEventTimeOrder).toBe('function');
      expect(typeof validator.validateEventParticipants).toBe('function');
    });
  });
});

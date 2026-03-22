/**
 * Lifespan Validator Tests
 * 寿命验证器单元测试
 */

import { describe, it, expect } from 'vitest';
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

describe('LifespanValidator', () => {
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

  // 创建测试用的注册表（包含种族实体）
  function createRegistryWithRace(
    raceId: string,
    averageLifespan: number
  ): Registry {
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

  // 创建测试用的人物 Submission
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

  // 创建测试用的种族 Submission
  function createRaceSubmission(
    id: string,
    averageLifespan: number
  ): Submission {
    return {
      template: 'race',
      id,
      name: { zh: '测试种族' },
      average_lifespan: averageLifespan,
      habitat: { zh: '测试栖息地' },
    };
  }

  const defaultOptions: LifespanValidationOptions = {
    isCanon: true,
    filePath: 'test.yaml',
  };

  describe('validateLifespan', () => {
    it('should pass when lifespan is within 150% of race average lifespan', () => {
      const validator = createLifespanValidator();
      const registry = createRegistryWithRace('race-ren-zu', 100);
      const submission = createCharacterSubmission('char-test', 'race-ren-zu', 150);

      const result = validator.validateLifespan(
        submission,
        registry,
        [],
        defaultOptions
      );

      expect(result.valid).toBe(true);
      expect(result.hardErrors).toHaveLength(0);
    });

    it('should pass when lifespan equals exactly 150% of race average lifespan', () => {
      const validator = createLifespanValidator();
      const registry = createRegistryWithRace('race-ren-zu', 100);
      const submission = createCharacterSubmission('char-test', 'race-ren-zu', 150);

      const result = validator.validateLifespan(
        submission,
        registry,
        [],
        defaultOptions
      );

      expect(result.valid).toBe(true);
      expect(result.hardErrors).toHaveLength(0);
    });

    it('should return hard error when lifespan exceeds 150% of race average lifespan', () => {
      const validator = createLifespanValidator();
      const registry = createRegistryWithRace('race-ren-zu', 100);
      const submission = createCharacterSubmission('char-test', 'race-ren-zu', 151);

      const result = validator.validateLifespan(
        submission,
        registry,
        [],
        defaultOptions
      );

      expect(result.valid).toBe(false);
      expect(result.hardErrors).toHaveLength(1);
      expect(result.hardErrors[0].code).toBe(ErrorCodes.LIFESPAN_EXCEED);
      expect(result.hardErrors[0].location.field).toBe('lifespan');
      expect(result.hardErrors[0].relatedEntities).toContain('race-ren-zu');
    });

    it('should return hard error with correct threshold calculation', () => {
      const validator = createLifespanValidator();
      const registry = createRegistryWithRace('race-shen-zu', 10000);
      // 150% of 10000 = 15000, so 15001 should fail
      const submission = createCharacterSubmission('char-test', 'race-shen-zu', 15001);

      const result = validator.validateLifespan(
        submission,
        registry,
        [],
        defaultOptions
      );

      expect(result.valid).toBe(false);
      expect(result.hardErrors).toHaveLength(1);
      expect(result.hardErrors[0].message.zh).toContain('15000');
      expect(result.hardErrors[0].message.zh).toContain('10000');
    });

    it('should pass when lifespan is much lower than race average', () => {
      const validator = createLifespanValidator();
      const registry = createRegistryWithRace('race-ren-zu', 100);
      const submission = createCharacterSubmission('char-test', 'race-ren-zu', 50);

      const result = validator.validateLifespan(
        submission,
        registry,
        [],
        defaultOptions
      );

      expect(result.valid).toBe(true);
      expect(result.hardErrors).toHaveLength(0);
    });

    it('should skip validation for non-character submissions', () => {
      const validator = createLifespanValidator();
      const registry = createEmptyRegistry();
      const submission: Submission = {
        template: 'race',
        id: 'race-test',
        name: { zh: '测试种族' },
        average_lifespan: 100,
        habitat: { zh: '测试栖息地' },
      };

      const result = validator.validateLifespan(
        submission,
        registry,
        [],
        defaultOptions
      );

      expect(result.valid).toBe(true);
      expect(result.hardErrors).toHaveLength(0);
    });

    it('should skip validation when lifespan field is missing', () => {
      const validator = createLifespanValidator();
      const registry = createRegistryWithRace('race-ren-zu', 100);
      const submission: Submission = {
        template: 'character',
        id: 'char-test',
        name: { zh: '测试人物' },
        race: 'race-ren-zu',
        birth_epoch: 'epoch-01',
        birth_year: 1,
      };

      const result = validator.validateLifespan(
        submission,
        registry,
        [],
        defaultOptions
      );

      expect(result.valid).toBe(true);
      expect(result.hardErrors).toHaveLength(0);
    });

    it('should skip validation when race field is missing', () => {
      const validator = createLifespanValidator();
      const registry = createEmptyRegistry();
      const submission: Submission = {
        template: 'character',
        id: 'char-test',
        name: { zh: '测试人物' },
        birth_epoch: 'epoch-01',
        birth_year: 1,
        lifespan: 200,
      };

      const result = validator.validateLifespan(
        submission,
        registry,
        [],
        defaultOptions
      );

      expect(result.valid).toBe(true);
      expect(result.hardErrors).toHaveLength(0);
    });

    it('should skip validation when race entity is not found', () => {
      const validator = createLifespanValidator();
      const registry = createEmptyRegistry();
      const submission = createCharacterSubmission('char-test', 'race-nonexistent', 200);

      const result = validator.validateLifespan(
        submission,
        registry,
        [],
        defaultOptions
      );

      expect(result.valid).toBe(true);
      expect(result.hardErrors).toHaveLength(0);
    });

    it('should find race entity in current batch', () => {
      const validator = createLifespanValidator();
      const registry = createEmptyRegistry();
      const raceSubmission = createRaceSubmission('race-new', 100);
      const characterSubmission = createCharacterSubmission('char-test', 'race-new', 151);

      const result = validator.validateLifespan(
        characterSubmission,
        registry,
        [raceSubmission],
        defaultOptions
      );

      expect(result.valid).toBe(false);
      expect(result.hardErrors).toHaveLength(1);
      expect(result.hardErrors[0].code).toBe(ErrorCodes.LIFESPAN_EXCEED);
    });

    it('should prefer registry over current batch when race exists in both', () => {
      const validator = createLifespanValidator();
      // Registry has race with average_lifespan = 100
      const registry = createRegistryWithRace('race-ren-zu', 100);
      // Current batch has same race with average_lifespan = 200
      const raceSubmission = createRaceSubmission('race-ren-zu', 200);
      // Character with lifespan 151 should fail against registry's 100 (threshold 150)
      const characterSubmission = createCharacterSubmission('char-test', 'race-ren-zu', 151);

      const result = validator.validateLifespan(
        characterSubmission,
        registry,
        [raceSubmission],
        defaultOptions
      );

      expect(result.valid).toBe(false);
      expect(result.hardErrors).toHaveLength(1);
    });

    it('should skip validation when race average_lifespan is invalid', () => {
      const validator = createLifespanValidator();
      const registry = createEmptyRegistry();
      const raceSubmission: Submission = {
        template: 'race',
        id: 'race-invalid',
        name: { zh: '无效种族' },
        average_lifespan: 'not-a-number' as any,
        habitat: { zh: '测试栖息地' },
      };
      const characterSubmission = createCharacterSubmission('char-test', 'race-invalid', 200);

      const result = validator.validateLifespan(
        characterSubmission,
        registry,
        [raceSubmission],
        defaultOptions
      );

      expect(result.valid).toBe(true);
      expect(result.hardErrors).toHaveLength(0);
    });

    it('should skip validation when race average_lifespan is zero or negative', () => {
      const validator = createLifespanValidator();
      const registry = createEmptyRegistry();
      const raceSubmission = createRaceSubmission('race-zero', 0);
      const characterSubmission = createCharacterSubmission('char-test', 'race-zero', 200);

      const result = validator.validateLifespan(
        characterSubmission,
        registry,
        [raceSubmission],
        defaultOptions
      );

      expect(result.valid).toBe(true);
      expect(result.hardErrors).toHaveLength(0);
    });

    it('should handle decimal threshold calculations correctly', () => {
      const validator = createLifespanValidator();
      const registry = createRegistryWithRace('race-odd', 77);
      // 150% of 77 = 115.5, so 115 should pass and 116 should fail
      const submission115 = createCharacterSubmission('char-115', 'race-odd', 115);
      const submission116 = createCharacterSubmission('char-116', 'race-odd', 116);

      const result115 = validator.validateLifespan(
        submission115,
        registry,
        [],
        defaultOptions
      );
      const result116 = validator.validateLifespan(
        submission116,
        registry,
        [],
        defaultOptions
      );

      expect(result115.valid).toBe(true);
      expect(result116.valid).toBe(false);
    });
  });

  describe('validateLifespan convenience function', () => {
    it('should work the same as validator instance method', () => {
      const registry = createRegistryWithRace('race-ren-zu', 100);
      const submission = createCharacterSubmission('char-test', 'race-ren-zu', 151);

      const result = validateLifespan(
        submission,
        registry,
        [],
        defaultOptions
      );

      expect(result.valid).toBe(false);
      expect(result.hardErrors).toHaveLength(1);
      expect(result.hardErrors[0].code).toBe(ErrorCodes.LIFESPAN_EXCEED);
    });
  });
});

/**
 * Faction Validator Tests
 * 势力验证器单元测试
 */

import { describe, it, expect } from 'vitest';
import {
  createFactionValidator,
  validateFactionEpochOverlap,
  type FactionValidationOptions,
} from './faction-validator.js';
import type {
  Submission,
  Registry,
  RegisteredEntity,
} from '../types/index.js';
import { ErrorCodes } from '../types/index.js';

describe('FactionValidator', () => {
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

  // 创建测试用的势力 Submission
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

  // 创建包含势力的注册表
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

  const defaultOptions: FactionValidationOptions = {
    filePath: 'test.yaml',
  };

  describe('validateFactionEpochOverlap', () => {
    it('should pass when faction name is unique', () => {
      const validator = createFactionValidator();
      const registry = createEmptyRegistry();
      const submission = createFactionSubmission(
        'faction-test',
        '测试势力',
        'epoch-01'
      );

      const result = validator.validateFactionEpochOverlap(
        submission,
        registry,
        [],
        defaultOptions
      );

      expect(result.valid).toBe(true);
      expect(result.hardErrors).toHaveLength(0);
    });

    it('should pass when same faction name exists in different epochs', () => {
      const validator = createFactionValidator();
      const registry = createRegistryWithFaction(
        'faction-test-1',
        '测试势力',
        'epoch-01'
      );
      const submission = createFactionSubmission(
        'faction-test-2',
        '测试势力',
        'epoch-02'
      );

      const result = validator.validateFactionEpochOverlap(
        submission,
        registry,
        [],
        defaultOptions
      );

      expect(result.valid).toBe(true);
      expect(result.hardErrors).toHaveLength(0);
    });

    it('should return hard error when same faction name exists in same epoch (registry)', () => {
      const validator = createFactionValidator();
      const registry = createRegistryWithFaction(
        'faction-existing',
        '测试势力',
        'epoch-01'
      );
      const submission = createFactionSubmission(
        'faction-new',
        '测试势力',
        'epoch-01'
      );

      const result = validator.validateFactionEpochOverlap(
        submission,
        registry,
        [],
        defaultOptions
      );

      expect(result.valid).toBe(false);
      expect(result.hardErrors).toHaveLength(1);
      expect(result.hardErrors[0].code).toBe(ErrorCodes.FACTION_EPOCH_OVERLAP);
      expect(result.hardErrors[0].location.field).toBe('epoch');
      expect(result.hardErrors[0].relatedEntities).toContain('faction-existing');
    });

    it('should return hard error when same faction name exists in same epoch (current batch)', () => {
      const validator = createFactionValidator();
      const registry = createEmptyRegistry();
      const existingSubmission = createFactionSubmission(
        'faction-batch-1',
        '测试势力',
        'epoch-01'
      );
      const newSubmission = createFactionSubmission(
        'faction-batch-2',
        '测试势力',
        'epoch-01'
      );

      const result = validator.validateFactionEpochOverlap(
        newSubmission,
        registry,
        [existingSubmission],
        defaultOptions
      );

      expect(result.valid).toBe(false);
      expect(result.hardErrors).toHaveLength(1);
      expect(result.hardErrors[0].code).toBe(ErrorCodes.FACTION_EPOCH_OVERLAP);
      expect(result.hardErrors[0].relatedEntities).toContain('faction-batch-1');
    });

    it('should return multiple errors when multiple overlaps exist', () => {
      const validator = createFactionValidator();
      const registry = createRegistryWithFaction(
        'faction-reg',
        '测试势力',
        'epoch-01'
      );
      const batchSubmission = createFactionSubmission(
        'faction-batch',
        '测试势力',
        'epoch-01'
      );
      const newSubmission = createFactionSubmission(
        'faction-new',
        '测试势力',
        'epoch-01'
      );

      const result = validator.validateFactionEpochOverlap(
        newSubmission,
        registry,
        [batchSubmission],
        defaultOptions
      );

      expect(result.valid).toBe(false);
      expect(result.hardErrors).toHaveLength(2);
      expect(result.hardErrors.every(e => e.code === ErrorCodes.FACTION_EPOCH_OVERLAP)).toBe(true);
    });

    it('should skip validation for non-faction submissions', () => {
      const validator = createFactionValidator();
      const registry = createEmptyRegistry();
      const submission: Submission = {
        template: 'character',
        id: 'char-test',
        name: { zh: '测试人物' },
        race: 'race-ren-zu',
        birth_epoch: 'epoch-01',
        birth_year: 1,
        lifespan: 100,
      };

      const result = validator.validateFactionEpochOverlap(
        submission,
        registry,
        [],
        defaultOptions
      );

      expect(result.valid).toBe(true);
      expect(result.hardErrors).toHaveLength(0);
    });

    it('should skip validation when name field is missing', () => {
      const validator = createFactionValidator();
      const registry = createEmptyRegistry();
      const submission: Submission = {
        template: 'faction',
        id: 'faction-test',
        epoch: 'epoch-01',
        faction_type: 'nation',
        active_status: true,
      };

      const result = validator.validateFactionEpochOverlap(
        submission,
        registry,
        [],
        defaultOptions
      );

      expect(result.valid).toBe(true);
      expect(result.hardErrors).toHaveLength(0);
    });

    it('should skip validation when epoch field is missing', () => {
      const validator = createFactionValidator();
      const registry = createEmptyRegistry();
      const submission: Submission = {
        template: 'faction',
        id: 'faction-test',
        name: { zh: '测试势力' },
        faction_type: 'nation',
        active_status: true,
      };

      const result = validator.validateFactionEpochOverlap(
        submission,
        registry,
        [],
        defaultOptions
      );

      expect(result.valid).toBe(true);
      expect(result.hardErrors).toHaveLength(0);
    });

    it('should not match against itself in current batch', () => {
      const validator = createFactionValidator();
      const registry = createEmptyRegistry();
      const submission = createFactionSubmission(
        'faction-test',
        '测试势力',
        'epoch-01'
      );

      // Include the same submission in the batch
      const result = validator.validateFactionEpochOverlap(
        submission,
        registry,
        [submission],
        defaultOptions
      );

      expect(result.valid).toBe(true);
      expect(result.hardErrors).toHaveLength(0);
    });

    it('should handle different faction names in same epoch', () => {
      const validator = createFactionValidator();
      const registry = createRegistryWithFaction(
        'faction-a',
        '势力A',
        'epoch-01'
      );
      const submission = createFactionSubmission(
        'faction-b',
        '势力B',
        'epoch-01'
      );

      const result = validator.validateFactionEpochOverlap(
        submission,
        registry,
        [],
        defaultOptions
      );

      expect(result.valid).toBe(true);
      expect(result.hardErrors).toHaveLength(0);
    });

    it('should include correct error message with faction name and epoch', () => {
      const validator = createFactionValidator();
      const registry = createRegistryWithFaction(
        'faction-existing',
        '大唐帝国',
        'epoch-03'
      );
      const submission = createFactionSubmission(
        'faction-new',
        '大唐帝国',
        'epoch-03'
      );

      const result = validator.validateFactionEpochOverlap(
        submission,
        registry,
        [],
        defaultOptions
      );

      expect(result.valid).toBe(false);
      expect(result.hardErrors[0].message.zh).toContain('大唐帝国');
      expect(result.hardErrors[0].message.zh).toContain('epoch-03');
      expect(result.hardErrors[0].message.en).toContain('大唐帝国');
      expect(result.hardErrors[0].message.en).toContain('epoch-03');
    });

    it('should handle name field with invalid type', () => {
      const validator = createFactionValidator();
      const registry = createEmptyRegistry();
      const submission: Submission = {
        template: 'faction',
        id: 'faction-test',
        name: 'invalid-string-name' as any,
        epoch: 'epoch-01',
        faction_type: 'nation',
        active_status: true,
      };

      const result = validator.validateFactionEpochOverlap(
        submission,
        registry,
        [],
        defaultOptions
      );

      expect(result.valid).toBe(true);
      expect(result.hardErrors).toHaveLength(0);
    });

    it('should handle epoch field with invalid type', () => {
      const validator = createFactionValidator();
      const registry = createEmptyRegistry();
      const submission: Submission = {
        template: 'faction',
        id: 'faction-test',
        name: { zh: '测试势力' },
        epoch: 123 as any,
        faction_type: 'nation',
        active_status: true,
      };

      const result = validator.validateFactionEpochOverlap(
        submission,
        registry,
        [],
        defaultOptions
      );

      expect(result.valid).toBe(true);
      expect(result.hardErrors).toHaveLength(0);
    });
  });

  describe('validateFactionEpochOverlap convenience function', () => {
    it('should work the same as validator instance method', () => {
      const registry = createRegistryWithFaction(
        'faction-existing',
        '测试势力',
        'epoch-01'
      );
      const submission = createFactionSubmission(
        'faction-new',
        '测试势力',
        'epoch-01'
      );

      const result = validateFactionEpochOverlap(
        submission,
        registry,
        [],
        defaultOptions
      );

      expect(result.valid).toBe(false);
      expect(result.hardErrors).toHaveLength(1);
      expect(result.hardErrors[0].code).toBe(ErrorCodes.FACTION_EPOCH_OVERLAP);
    });
  });
});

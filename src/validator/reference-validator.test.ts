/**
 * Reference Validator Tests
 * 引用验证器单元测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
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
} from '../types/index.js';
import { ErrorCodes, WarningCodes } from '../types/index.js';

describe('ReferenceValidator', () => {
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

  // 创建测试用的注册表（包含一些实体）
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

  // 创建测试用的纪元索引
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

  // 创建测试用的 Submission
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

  // 创建测试用的模板定义
  function createTestTemplate(category: Category, fields: Array<{ name: string; type: string }>): TemplateDefinition {
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

  describe('validateEntityRef', () => {
    it('should pass when entity exists in registry', () => {
      const validator = createReferenceValidator();
      const registry = createTestRegistry([{ id: 'race-ren-zu', category: 'race' }]);
      const submission = createTestSubmission('char-test', 'character', { race: 'race-ren-zu' });
      const options: ReferenceValidationOptions = { isCanon: true, filePath: 'test.yaml' };

      const result = validator.validateEntityRef(
        submission,
        'race',
        'race-ren-zu',
        registry,
        [],
        options
      );

      expect(result.valid).toBe(true);
      expect(result.hardErrors).toHaveLength(0);
      expect(result.softWarnings).toHaveLength(0);
    });

    it('should pass when entity exists in current batch', () => {
      const validator = createReferenceValidator();
      const registry = createEmptyRegistry();
      const submission = createTestSubmission('char-test', 'character', { race: 'race-new' });
      const currentBatch: Submission[] = [
        createTestSubmission('race-new', 'race'),
      ];
      const options: ReferenceValidationOptions = { isCanon: true, filePath: 'test.yaml' };

      const result = validator.validateEntityRef(
        submission,
        'race',
        'race-new',
        registry,
        currentBatch,
        options
      );

      expect(result.valid).toBe(true);
      expect(result.hardErrors).toHaveLength(0);
    });

    it('should return hard error when entity does not exist in canon mode', () => {
      const validator = createReferenceValidator();
      const registry = createEmptyRegistry();
      const submission = createTestSubmission('char-test', 'character', { race: 'race-nonexistent' });
      const options: ReferenceValidationOptions = { isCanon: true, filePath: 'test.yaml' };

      const result = validator.validateEntityRef(
        submission,
        'race',
        'race-nonexistent',
        registry,
        [],
        options
      );

      expect(result.valid).toBe(false);
      expect(result.hardErrors).toHaveLength(1);
      expect(result.hardErrors[0].code).toBe(ErrorCodes.REF_MISSING);
      expect(result.hardErrors[0].location.field).toBe('race');
      expect(result.hardErrors[0].relatedEntities).toContain('race-nonexistent');
    });

    it('should return soft warning when entity does not exist in non-canon mode', () => {
      const validator = createReferenceValidator();
      const registry = createEmptyRegistry();
      const submission = createTestSubmission('char-test', 'character', { race: 'race-nonexistent' }, false);
      const options: ReferenceValidationOptions = { isCanon: false, filePath: 'test.yaml' };

      const result = validator.validateEntityRef(
        submission,
        'race',
        'race-nonexistent',
        registry,
        [],
        options
      );

      expect(result.valid).toBe(true);
      expect(result.hardErrors).toHaveLength(0);
      expect(result.softWarnings).toHaveLength(1);
      expect(result.softWarnings[0].code).toBe(WarningCodes.REF_MISSING);
    });
  });

  describe('validateEpochRef', () => {
    it('should pass when epoch exists in epoch index', () => {
      const validator = createReferenceValidator();
      const epochIndex = createTestEpochIndex(['epoch-01', 'epoch-02', 'epoch-03']);
      const submission = createTestSubmission('char-test', 'character', { birth_epoch: 'epoch-01' });
      const options: ReferenceValidationOptions = { isCanon: true, filePath: 'test.yaml' };

      const result = validator.validateEpochRef(
        submission,
        'birth_epoch',
        'epoch-01',
        epochIndex,
        options
      );

      expect(result.valid).toBe(true);
      expect(result.hardErrors).toHaveLength(0);
    });

    it('should return hard error when epoch does not exist in canon mode', () => {
      const validator = createReferenceValidator();
      const epochIndex = createTestEpochIndex(['epoch-01', 'epoch-02']);
      const submission = createTestSubmission('char-test', 'character', { birth_epoch: 'epoch-99' });
      const options: ReferenceValidationOptions = { isCanon: true, filePath: 'test.yaml' };

      const result = validator.validateEpochRef(
        submission,
        'birth_epoch',
        'epoch-99',
        epochIndex,
        options
      );

      expect(result.valid).toBe(false);
      expect(result.hardErrors).toHaveLength(1);
      expect(result.hardErrors[0].code).toBe(ErrorCodes.REF_EPOCH);
      expect(result.hardErrors[0].location.field).toBe('birth_epoch');
    });

    it('should return soft warning when epoch does not exist in non-canon mode', () => {
      const validator = createReferenceValidator();
      const epochIndex = createTestEpochIndex(['epoch-01']);
      const submission = createTestSubmission('char-test', 'character', { birth_epoch: 'epoch-99' }, false);
      const options: ReferenceValidationOptions = { isCanon: false, filePath: 'test.yaml' };

      const result = validator.validateEpochRef(
        submission,
        'birth_epoch',
        'epoch-99',
        epochIndex,
        options
      );

      expect(result.valid).toBe(true);
      expect(result.hardErrors).toHaveLength(0);
      expect(result.softWarnings).toHaveLength(1);
    });
  });

  describe('validateAllReferences', () => {
    it('should validate all entity_ref and epoch_ref fields', () => {
      const validator = createReferenceValidator();
      const registry = createTestRegistry([{ id: 'race-ren-zu', category: 'race' }]);
      const epochIndex = createTestEpochIndex(['epoch-01', 'epoch-02']);
      const template = createTestTemplate('character', [
        { name: 'race', type: 'entity_ref' },
        { name: 'birth_epoch', type: 'epoch_ref' },
      ]);
      const submission = createTestSubmission('char-test', 'character', {
        race: 'race-ren-zu',
        birth_epoch: 'epoch-01',
      });
      const options: ReferenceValidationOptions = { isCanon: true, filePath: 'test.yaml' };

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
    });

    it('should collect all reference errors', () => {
      const validator = createReferenceValidator();
      const registry = createEmptyRegistry();
      const epochIndex = createTestEpochIndex(['epoch-01']);
      const template = createTestTemplate('character', [
        { name: 'race', type: 'entity_ref' },
        { name: 'birth_epoch', type: 'epoch_ref' },
      ]);
      const submission = createTestSubmission('char-test', 'character', {
        race: 'race-nonexistent',
        birth_epoch: 'epoch-99',
      });
      const options: ReferenceValidationOptions = { isCanon: true, filePath: 'test.yaml' };

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
      expect(result.hardErrors.map((e) => e.code)).toContain(ErrorCodes.REF_MISSING);
      expect(result.hardErrors.map((e) => e.code)).toContain(ErrorCodes.REF_EPOCH);
    });

    it('should skip undefined fields', () => {
      const validator = createReferenceValidator();
      const registry = createEmptyRegistry();
      const epochIndex = createTestEpochIndex(['epoch-01']);
      const template = createTestTemplate('character', [
        { name: 'race', type: 'entity_ref' },
        { name: 'birth_epoch', type: 'epoch_ref' },
      ]);
      // 不填写 race 和 birth_epoch 字段
      const submission = createTestSubmission('char-test', 'character', {});
      const options: ReferenceValidationOptions = { isCanon: true, filePath: 'test.yaml' };

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
    });

    it('should validate array of entity_ref', () => {
      const validator = createReferenceValidator();
      const registry = createTestRegistry([
        { id: 'char-a', category: 'character' },
        { id: 'char-b', category: 'character' },
      ]);
      const epochIndex = createTestEpochIndex(['epoch-01']);
      const template = createTestTemplate('history', [
        { name: 'participants', type: 'array<entity_ref>' },
      ]);
      const submission = createTestSubmission('event-test', 'history', {
        participants: ['char-a', 'char-b'],
      });
      const options: ReferenceValidationOptions = { isCanon: true, filePath: 'test.yaml' };

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
    });

    it('should report errors for missing entities in array', () => {
      const validator = createReferenceValidator();
      const registry = createTestRegistry([{ id: 'char-a', category: 'character' }]);
      const epochIndex = createTestEpochIndex(['epoch-01']);
      const template = createTestTemplate('history', [
        { name: 'participants', type: 'array<entity_ref>' },
      ]);
      const submission = createTestSubmission('event-test', 'history', {
        participants: ['char-a', 'char-nonexistent'],
      });
      const options: ReferenceValidationOptions = { isCanon: true, filePath: 'test.yaml' };

      const result = validator.validateAllReferences(
        submission,
        template,
        registry,
        [],
        epochIndex,
        options
      );

      expect(result.valid).toBe(false);
      expect(result.hardErrors).toHaveLength(1);
      expect(result.hardErrors[0].location.field).toBe('participants[1]');
    });
  });

  describe('isCanonSubmission', () => {
    it('should return true when versioning.canon is true', () => {
      const submission = createTestSubmission('test-id', 'character', {}, true);
      expect(isCanonSubmission(submission)).toBe(true);
    });

    it('should return false when versioning.canon is false', () => {
      const submission = createTestSubmission('test-id', 'character', {}, false);
      expect(isCanonSubmission(submission)).toBe(false);
    });

    it('should return true when versioning is not present (default)', () => {
      const submission: Submission = {
        template: 'character',
        id: 'test-id',
      };
      expect(isCanonSubmission(submission)).toBe(true);
    });

    it('should return true when versioning is present but canon is not defined', () => {
      const submission: Submission = {
        template: 'character',
        id: 'test-id',
        versioning: {
          source: 'test',
          priority: 'official',
        } as any,
      };
      expect(isCanonSubmission(submission)).toBe(true);
    });
  });
});

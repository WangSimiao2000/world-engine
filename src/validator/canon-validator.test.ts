/**
 * Canon Validator Tests
 * 正史/野史验证器单元测试
 */

import { describe, it, expect } from 'vitest';
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

describe('CanonValidator', () => {
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
  function createTestRegistry(
    entities: Array<{ id: string; category: Category; canon: boolean }>
  ): Registry {
    const registry = createEmptyRegistry();
    for (const entity of entities) {
      registry.entities.set(entity.id, {
        id: entity.id,
        category: entity.category,
        data: {
          template: entity.category,
          id: entity.id,
          versioning: {
            canon: entity.canon,
            source: 'test-author',
            priority: 'official',
          },
        },
        archivedAt: new Date().toISOString(),
      });
      registry.index.entries.push({
        id: entity.id,
        category: entity.category,
        canon: entity.canon,
        priority: 'official',
        archivedAt: new Date().toISOString(),
      });
    }
    return registry;
  }

  // 创建测试用的 Submission
  function createTestSubmission(
    id: string,
    template: Category,
    canon: boolean = true,
    fields: Record<string, unknown> = {}
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

  describe('validateCanonUniqueness', () => {
    it('should pass when submitting a new canon version with no existing canon', () => {
      const validator = createCanonValidator();
      const registry = createEmptyRegistry();
      const submission = createTestSubmission('event-001', 'history', true);
      const options: CanonValidationOptions = { filePath: 'test.yaml' };

      const result = validator.validateCanonUniqueness(
        submission,
        registry,
        [],
        options
      );

      expect(result.valid).toBe(true);
      expect(result.hardErrors).toHaveLength(0);
      expect(result.softWarnings).toHaveLength(0);
    });

    it('should pass when submitting a non-canon version even if canon exists', () => {
      const validator = createCanonValidator();
      const registry = createTestRegistry([
        { id: 'event-001', category: 'history', canon: true },
      ]);
      const submission = createTestSubmission('event-001', 'history', false);
      const options: CanonValidationOptions = { filePath: 'test.yaml' };

      const result = validator.validateCanonUniqueness(
        submission,
        registry,
        [],
        options
      );

      expect(result.valid).toBe(true);
      expect(result.hardErrors).toHaveLength(0);
    });

    it('should return hard error when canon version already exists in registry', () => {
      const validator = createCanonValidator();
      const registry = createTestRegistry([
        { id: 'event-001', category: 'history', canon: true },
      ]);
      const submission = createTestSubmission('event-001', 'history', true);
      const options: CanonValidationOptions = { filePath: 'test.yaml' };

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
      expect(result.hardErrors[0].relatedEntities).toContain('event-001');
    });

    it('should pass when existing version in registry is non-canon', () => {
      const validator = createCanonValidator();
      const registry = createTestRegistry([
        { id: 'event-001', category: 'history', canon: false },
      ]);
      const submission = createTestSubmission('event-001', 'history', true);
      const options: CanonValidationOptions = { filePath: 'test.yaml' };

      const result = validator.validateCanonUniqueness(
        submission,
        registry,
        [],
        options
      );

      expect(result.valid).toBe(true);
      expect(result.hardErrors).toHaveLength(0);
    });

    it('should return hard error when duplicate canon exists in current batch', () => {
      const validator = createCanonValidator();
      const registry = createEmptyRegistry();
      const submission1 = createTestSubmission('event-001', 'history', true);
      const submission2 = createTestSubmission('event-001', 'history', true);
      const currentBatch = [submission1, submission2];
      const options: CanonValidationOptions = { filePath: 'test.yaml' };

      const result = validator.validateCanonUniqueness(
        submission2,
        registry,
        currentBatch,
        options
      );

      expect(result.valid).toBe(false);
      expect(result.hardErrors).toHaveLength(1);
      expect(result.hardErrors[0].code).toBe(ErrorCodes.CANON_DUPLICATE);
    });

    it('should pass when batch contains same ID but different canon status', () => {
      const validator = createCanonValidator();
      const registry = createEmptyRegistry();
      const canonSubmission = createTestSubmission('event-001', 'history', true);
      const nonCanonSubmission = createTestSubmission('event-001', 'history', false);
      const currentBatch = [canonSubmission, nonCanonSubmission];
      const options: CanonValidationOptions = { filePath: 'test.yaml' };

      // 验证正史版本
      const result1 = validator.validateCanonUniqueness(
        canonSubmission,
        registry,
        currentBatch,
        options
      );
      expect(result1.valid).toBe(true);

      // 验证野史版本
      const result2 = validator.validateCanonUniqueness(
        nonCanonSubmission,
        registry,
        currentBatch,
        options
      );
      expect(result2.valid).toBe(true);
    });

    it('should not count the submission itself as duplicate in batch', () => {
      const validator = createCanonValidator();
      const registry = createEmptyRegistry();
      const submission = createTestSubmission('event-001', 'history', true);
      const currentBatch = [submission];
      const options: CanonValidationOptions = { filePath: 'test.yaml' };

      const result = validator.validateCanonUniqueness(
        submission,
        registry,
        currentBatch,
        options
      );

      expect(result.valid).toBe(true);
      expect(result.hardErrors).toHaveLength(0);
    });
  });

  describe('isCanon', () => {
    it('should return true when versioning.canon is true', () => {
      const submission = createTestSubmission('test-id', 'history', true);
      const validator = createCanonValidator();
      expect(validator.isCanon(submission)).toBe(true);
    });

    it('should return false when versioning.canon is false', () => {
      const submission = createTestSubmission('test-id', 'history', false);
      const validator = createCanonValidator();
      expect(validator.isCanon(submission)).toBe(false);
    });

    it('should return true when versioning is not present (default)', () => {
      const submission: Submission = {
        template: 'history',
        id: 'test-id',
      };
      const validator = createCanonValidator();
      expect(validator.isCanon(submission)).toBe(true);
    });

    it('should return true when versioning is present but canon is not defined', () => {
      const submission: Submission = {
        template: 'history',
        id: 'test-id',
        versioning: {
          source: 'test',
          priority: 'official',
        } as any,
      };
      const validator = createCanonValidator();
      expect(validator.isCanon(submission)).toBe(true);
    });
  });

  describe('getValidationMode', () => {
    it('should return strict for canon submissions', () => {
      const submission = createTestSubmission('test-id', 'history', true);
      const validator = createCanonValidator();
      expect(validator.getValidationMode(submission)).toBe('strict');
    });

    it('should return relaxed for non-canon submissions', () => {
      const submission = createTestSubmission('test-id', 'history', false);
      const validator = createCanonValidator();
      expect(validator.getValidationMode(submission)).toBe('relaxed');
    });

    it('should return strict when versioning is not present (default)', () => {
      const submission: Submission = {
        template: 'history',
        id: 'test-id',
      };
      const validator = createCanonValidator();
      expect(validator.getValidationMode(submission)).toBe('strict');
    });
  });

  describe('convenience functions', () => {
    it('validateCanonUniqueness should work correctly', () => {
      const registry = createTestRegistry([
        { id: 'event-001', category: 'history', canon: true },
      ]);
      const submission = createTestSubmission('event-001', 'history', true);
      const options: CanonValidationOptions = { filePath: 'test.yaml' };

      const result = validateCanonUniqueness(submission, registry, [], options);

      expect(result.valid).toBe(false);
      expect(result.hardErrors[0].code).toBe(ErrorCodes.CANON_DUPLICATE);
    });

    it('isCanon should work correctly', () => {
      const canonSubmission = createTestSubmission('test-id', 'history', true);
      const nonCanonSubmission = createTestSubmission('test-id', 'history', false);

      expect(isCanon(canonSubmission)).toBe(true);
      expect(isCanon(nonCanonSubmission)).toBe(false);
    });

    it('getValidationMode should work correctly', () => {
      const canonSubmission = createTestSubmission('test-id', 'history', true);
      const nonCanonSubmission = createTestSubmission('test-id', 'history', false);

      expect(getValidationMode(canonSubmission)).toBe('strict');
      expect(getValidationMode(nonCanonSubmission)).toBe('relaxed');
    });
  });

  describe('shouldRelaxCrossReferenceValidation', () => {
    it('should return false for canon submissions', () => {
      const submission = createTestSubmission('test-id', 'history', true);
      expect(shouldRelaxCrossReferenceValidation(submission)).toBe(false);
    });

    it('should return true for non-canon submissions', () => {
      const submission = createTestSubmission('test-id', 'history', false);
      expect(shouldRelaxCrossReferenceValidation(submission)).toBe(true);
    });
  });

  describe('shouldRelaxTimelineValidation', () => {
    it('should return false for canon submissions', () => {
      const submission = createTestSubmission('test-id', 'history', true);
      expect(shouldRelaxTimelineValidation(submission)).toBe(false);
    });

    it('should return true for non-canon submissions', () => {
      const submission = createTestSubmission('test-id', 'history', false);
      expect(shouldRelaxTimelineValidation(submission)).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle multiple non-canon versions with same ID', () => {
      const validator = createCanonValidator();
      const registry = createEmptyRegistry();
      const submission1 = createTestSubmission('event-001', 'history', false);
      const submission2 = createTestSubmission('event-001', 'history', false);
      const currentBatch = [submission1, submission2];
      const options: CanonValidationOptions = { filePath: 'test.yaml' };

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
    });

    it('should handle different IDs with same canon status', () => {
      const validator = createCanonValidator();
      const registry = createEmptyRegistry();
      const submission1 = createTestSubmission('event-001', 'history', true);
      const submission2 = createTestSubmission('event-002', 'history', true);
      const currentBatch = [submission1, submission2];
      const options: CanonValidationOptions = { filePath: 'test.yaml' };

      // Different IDs should not conflict
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
    });

    it('should work with different categories', () => {
      const validator = createCanonValidator();
      const registry = createTestRegistry([
        { id: 'char-001', category: 'character', canon: true },
      ]);
      const submission = createTestSubmission('char-001', 'character', true);
      const options: CanonValidationOptions = { filePath: 'test.yaml' };

      const result = validator.validateCanonUniqueness(
        submission,
        registry,
        [],
        options
      );

      expect(result.valid).toBe(false);
      expect(result.hardErrors[0].code).toBe(ErrorCodes.CANON_DUPLICATE);
    });
  });
});

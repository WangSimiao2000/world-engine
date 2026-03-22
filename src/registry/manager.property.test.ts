/**
 * Registry Manager Property-Based Tests
 * 注册表管理器属性测试
 * 
 * Feature: initialize, Property 15: 归档数据标准化
 * **Validates: Requirements 6.1, 6.4**
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as yaml from 'js-yaml';
import { createRegistryManager } from './manager.js';
import type { Category, Submission, RegisteredEntity, Versioning, Priority } from '../types/index.js';
import { CATEGORIES } from '../types/index.js';

// ============================================================================
// Arbitraries - 数据生成器
// ============================================================================

/**
 * Arbitrary: Generate a valid category
 */
const categoryArb = fc.constantFrom(...CATEGORIES);

/**
 * Arbitrary: Generate a valid entity ID
 */
const entityIdArb = (category: Category) =>
  fc.stringMatching(/^[a-z0-9]{1,10}$/).map((suffix) => `${category}-${suffix}`);

/**
 * Arbitrary: Generate a valid bilingual name
 */
const bilingualNameArb = fc.record({
  zh: fc.stringMatching(/^[\u4e00-\u9fa5]{2,10}$/),
  en: fc.option(fc.stringMatching(/^[A-Za-z ]{2,20}$/), { nil: undefined }),
});

/**
 * Arbitrary: Generate a valid priority
 */
const priorityArb: fc.Arbitrary<Priority> = fc.constantFrom('official', 'secondary');

/**
 * Arbitrary: Generate a valid versioning object
 */
const versioningArb: fc.Arbitrary<Versioning> = fc.record({
  canon: fc.boolean(),
  source: fc.stringMatching(/^author-[a-z0-9]{1,10}$/),
  priority: priorityArb,
});

/**
 * Arbitrary: Generate a valid submission
 */
const submissionArb: fc.Arbitrary<Submission> = categoryArb.chain((category) =>
  fc.record({
    template: fc.constant(category),
    id: entityIdArb(category),
    name: bilingualNameArb,
    versioning: fc.option(versioningArb, { nil: undefined }),
  }).map((record) => {
    const submission: Submission = {
      template: record.template,
      id: record.id,
      name: record.name,
    };
    if (record.versioning !== undefined) {
      submission.versioning = record.versioning;
    }
    return submission;
  })
);

/**
 * Arbitrary: Generate a submission with versioning
 */
const submissionWithVersioningArb: fc.Arbitrary<Submission> = categoryArb.chain((category) =>
  fc.record({
    template: fc.constant(category),
    id: entityIdArb(category),
    name: bilingualNameArb,
    versioning: versioningArb,
  })
);

/**
 * Arbitrary: Generate a submission without versioning
 */
const submissionWithoutVersioningArb: fc.Arbitrary<Submission> = categoryArb.chain((category) =>
  fc.record({
    template: fc.constant(category),
    id: entityIdArb(category),
    name: bilingualNameArb,
  })
);

/**
 * Arbitrary: Generate additional submission fields
 */
const additionalFieldsArb = fc.record({
  description: fc.option(bilingualNameArb, { nil: undefined }),
  epoch: fc.option(fc.stringMatching(/^epoch-[0-9]{2}$/), { nil: undefined }),
  birth_year: fc.option(fc.integer({ min: 1, max: 10000 }), { nil: undefined }),
});

/**
 * Arbitrary: Generate a submission with additional fields
 */
const submissionWithAdditionalFieldsArb: fc.Arbitrary<Submission> = categoryArb.chain((category) =>
  fc.record({
    template: fc.constant(category),
    id: entityIdArb(category),
    name: bilingualNameArb,
    versioning: fc.option(versioningArb, { nil: undefined }),
    additionalFields: additionalFieldsArb,
  }).map((record) => {
    const submission: Submission = {
      template: record.template,
      id: record.id,
      name: record.name,
    };
    if (record.versioning !== undefined) {
      submission.versioning = record.versioning;
    }
    // Add additional fields
    if (record.additionalFields.description !== undefined) {
      submission['description'] = record.additionalFields.description;
    }
    if (record.additionalFields.epoch !== undefined) {
      submission['epoch'] = record.additionalFields.epoch;
    }
    if (record.additionalFields.birth_year !== undefined) {
      submission['birth_year'] = record.additionalFields.birth_year;
    }
    return submission;
  })
);

// ============================================================================
// Helper Functions - 辅助函数
// ============================================================================

/**
 * Check if a string is a valid ISO 8601 timestamp
 */
function isValidISOTimestamp(timestamp: string): boolean {
  const date = new Date(timestamp);
  return !isNaN(date.getTime()) && date.toISOString() === timestamp;
}

// ============================================================================
// Property Tests - 属性测试
// ============================================================================

describe('Feature: initialize, Property 15: 归档数据标准化', () => {
  let tempDir: string;
  let buildDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'registry-pbt-'));
    buildDir = path.join(tempDir, '_build');
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  /**
   * Property 15.1: Archived data maintains all original submission fields
   * 
   * For any valid submission, after archiving, the archived data should
   * contain all original submission fields unchanged.
   */
  it('should maintain all original submission fields after archiving', async () => {
    await fc.assert(
      fc.asyncProperty(submissionWithAdditionalFieldsArb, async (submission) => {
        const manager = createRegistryManager();
        await manager.archive(submission, buildDir);

        // Read the archived file
        const filePath = path.join(buildDir, submission.template, `${submission.id}.yaml`);
        const content = await fs.readFile(filePath, 'utf-8');
        const parsed = yaml.load(content) as RegisteredEntity;

        // Verify all original submission fields are preserved in data
        expect(parsed.data.template).toBe(submission.template);
        expect(parsed.data.id).toBe(submission.id);
        expect(parsed.data.name).toEqual(submission.name);

        // Verify versioning is preserved if present
        if (submission.versioning !== undefined) {
          expect(parsed.data.versioning).toEqual(submission.versioning);
        }

        // Verify additional fields are preserved
        if (submission['description'] !== undefined) {
          expect(parsed.data['description']).toEqual(submission['description']);
        }
        if (submission['epoch'] !== undefined) {
          expect(parsed.data['epoch']).toBe(submission['epoch']);
        }
        if (submission['birth_year'] !== undefined) {
          expect(parsed.data['birth_year']).toBe(submission['birth_year']);
        }

        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 15.2: RegisteredEntity format is consistent (id, category, data, archivedAt)
   * 
   * For any valid submission, the archived file should have the standard
   * RegisteredEntity format with id, category, data, and archivedAt fields.
   */
  it('should produce RegisteredEntity format with id, category, data, archivedAt', async () => {
    await fc.assert(
      fc.asyncProperty(submissionArb, async (submission) => {
        const manager = createRegistryManager();
        await manager.archive(submission, buildDir);

        // Read the archived file
        const filePath = path.join(buildDir, submission.template, `${submission.id}.yaml`);
        const content = await fs.readFile(filePath, 'utf-8');
        const parsed = yaml.load(content) as Record<string, unknown>;

        // Verify RegisteredEntity format
        expect(parsed).toHaveProperty('id');
        expect(parsed).toHaveProperty('category');
        expect(parsed).toHaveProperty('data');
        expect(parsed).toHaveProperty('archivedAt');

        // Verify field types
        expect(typeof parsed.id).toBe('string');
        expect(typeof parsed.category).toBe('string');
        expect(typeof parsed.data).toBe('object');
        expect(typeof parsed.archivedAt).toBe('string');

        // Verify id matches submission id
        expect(parsed.id).toBe(submission.id);

        // Verify category matches submission template
        expect(parsed.category).toBe(submission.template);

        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 15.3: Category directory structure is correct
   * 
   * For any valid submission, the archived file should be placed in the
   * correct category subdirectory under _build/.
   */
  it('should place archived file in correct category directory', async () => {
    await fc.assert(
      fc.asyncProperty(submissionArb, async (submission) => {
        const manager = createRegistryManager();
        await manager.archive(submission, buildDir);

        // Verify the file exists in the correct category directory
        const expectedDir = path.join(buildDir, submission.template);
        const expectedFile = path.join(expectedDir, `${submission.id}.yaml`);

        const dirExists = await fs.stat(expectedDir).then((s) => s.isDirectory()).catch(() => false);
        const fileExists = await fs.stat(expectedFile).then((s) => s.isFile()).catch(() => false);

        expect(dirExists).toBe(true);
        expect(fileExists).toBe(true);

        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 15.4: Versioning information is preserved
   * 
   * For any submission with versioning information, the archived data
   * should preserve the versioning fields (canon, source, priority).
   */
  it('should preserve versioning information in archived data', async () => {
    await fc.assert(
      fc.asyncProperty(submissionWithVersioningArb, async (submission) => {
        const manager = createRegistryManager();
        await manager.archive(submission, buildDir);

        // Read the archived file
        const filePath = path.join(buildDir, submission.template, `${submission.id}.yaml`);
        const content = await fs.readFile(filePath, 'utf-8');
        const parsed = yaml.load(content) as RegisteredEntity;

        // Verify versioning is preserved
        expect(parsed.data.versioning).toBeDefined();
        expect(parsed.data.versioning!.canon).toBe(submission.versioning!.canon);
        expect(parsed.data.versioning!.source).toBe(submission.versioning!.source);
        expect(parsed.data.versioning!.priority).toBe(submission.versioning!.priority);

        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 15.5: archivedAt is a valid ISO timestamp
   * 
   * For any valid submission, the archivedAt field in the archived file
   * should be a valid ISO 8601 timestamp.
   */
  it('should generate valid ISO timestamp for archivedAt', async () => {
    await fc.assert(
      fc.asyncProperty(submissionArb, async (submission) => {
        const manager = createRegistryManager();
        await manager.archive(submission, buildDir);

        // Read the archived file
        const filePath = path.join(buildDir, submission.template, `${submission.id}.yaml`);
        const content = await fs.readFile(filePath, 'utf-8');
        const parsed = yaml.load(content) as RegisteredEntity;

        // Verify archivedAt is a valid ISO timestamp
        expect(isValidISOTimestamp(parsed.archivedAt)).toBe(true);

        // Verify the timestamp is recent (within last minute)
        const archivedDate = new Date(parsed.archivedAt);
        const now = new Date();
        const diffMs = now.getTime() - archivedDate.getTime();
        expect(diffMs).toBeGreaterThanOrEqual(0);
        expect(diffMs).toBeLessThan(60000); // Within 1 minute

        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 15.6: File can be loaded back and matches original submission
   * 
   * For any valid submission, after archiving and loading back,
   * the data should match the original submission.
   */
  it('should allow archived file to be loaded back matching original submission', async () => {
    await fc.assert(
      fc.asyncProperty(submissionWithAdditionalFieldsArb, async (submission) => {
        const manager = createRegistryManager();
        await manager.archive(submission, buildDir);

        // Load the registry back
        const registry = await manager.loadRegistry(buildDir);

        // Verify the entity exists in the registry
        expect(registry.entities.has(submission.id)).toBe(true);

        const entity = registry.entities.get(submission.id)!;

        // Verify entity fields
        expect(entity.id).toBe(submission.id);
        expect(entity.category).toBe(submission.template);
        expect(entity.data.template).toBe(submission.template);
        expect(entity.data.id).toBe(submission.id);
        expect(entity.data.name).toEqual(submission.name);

        // Verify versioning if present
        if (submission.versioning !== undefined) {
          expect(entity.data.versioning).toEqual(submission.versioning);
        }

        // Verify additional fields
        if (submission['description'] !== undefined) {
          expect(entity.data['description']).toEqual(submission['description']);
        }
        if (submission['epoch'] !== undefined) {
          expect(entity.data['epoch']).toBe(submission['epoch']);
        }
        if (submission['birth_year'] !== undefined) {
          expect(entity.data['birth_year']).toBe(submission['birth_year']);
        }

        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 15.7: Submissions without versioning are handled correctly
   * 
   * For any submission without versioning, the archived data should
   * not contain a versioning field.
   */
  it('should handle submissions without versioning correctly', async () => {
    await fc.assert(
      fc.asyncProperty(submissionWithoutVersioningArb, async (submission) => {
        const manager = createRegistryManager();
        await manager.archive(submission, buildDir);

        // Read the archived file
        const filePath = path.join(buildDir, submission.template, `${submission.id}.yaml`);
        const content = await fs.readFile(filePath, 'utf-8');
        const parsed = yaml.load(content) as RegisteredEntity;

        // Verify versioning is not present in data
        expect(parsed.data.versioning).toBeUndefined();

        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 15.8: All 9 categories are supported
   * 
   * For any of the 9 categories, archiving should work correctly
   * and place files in the appropriate category directory.
   */
  it('should support all 9 categories', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...CATEGORIES),
        fc.stringMatching(/^[a-z0-9]{1,10}$/),
        bilingualNameArb,
        async (category, idSuffix, name) => {
          const submission: Submission = {
            template: category,
            id: `${category}-${idSuffix}`,
            name,
          };

          const manager = createRegistryManager();
          await manager.archive(submission, buildDir);

          // Verify file exists in correct category directory
          const filePath = path.join(buildDir, category, `${submission.id}.yaml`);
          const fileExists = await fs.stat(filePath).then((s) => s.isFile()).catch(() => false);
          expect(fileExists).toBe(true);

          // Verify content
          const content = await fs.readFile(filePath, 'utf-8');
          const parsed = yaml.load(content) as RegisteredEntity;
          expect(parsed.category).toBe(category);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 15.9: Multiple submissions to same category are handled correctly
   * 
   * For multiple submissions to the same category, each should be archived
   * to its own file without overwriting others.
   */
  it('should handle multiple submissions to same category correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        categoryArb,
        fc.array(fc.stringMatching(/^[a-z0-9]{1,10}$/), { minLength: 2, maxLength: 5 }),
        async (category, idSuffixes) => {
          // Ensure unique IDs
          const uniqueSuffixes = [...new Set(idSuffixes)];
          if (uniqueSuffixes.length < 2) return true; // Skip if not enough unique IDs

          const manager = createRegistryManager();

          // Archive multiple submissions
          for (const suffix of uniqueSuffixes) {
            const submission: Submission = {
              template: category,
              id: `${category}-${suffix}`,
              name: { zh: `测试${suffix}` },
            };
            await manager.archive(submission, buildDir);
          }

          // Verify all files exist
          for (const suffix of uniqueSuffixes) {
            const filePath = path.join(buildDir, category, `${category}-${suffix}.yaml`);
            const fileExists = await fs.stat(filePath).then((s) => s.isFile()).catch(() => false);
            expect(fileExists).toBe(true);
          }

          // Verify registry status
          const status = manager.getStatus();
          expect(status.totalCount).toBe(uniqueSuffixes.length);
          expect(status.byCategory[category]).toBe(uniqueSuffixes.length);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 15.10: Overwriting existing entity updates the file
   * 
   * For a submission with the same ID as an existing archived entity,
   * archiving should overwrite the existing file with updated data.
   */
  it('should overwrite existing entity when archiving with same ID', async () => {
    await fc.assert(
      fc.asyncProperty(
        categoryArb,
        fc.stringMatching(/^[a-z0-9]{1,10}$/),
        bilingualNameArb,
        bilingualNameArb,
        async (category, idSuffix, name1, name2) => {
          // Ensure names are different
          fc.pre(name1.zh !== name2.zh);

          const id = `${category}-${idSuffix}`;
          const manager = createRegistryManager();

          // Archive first submission
          const submission1: Submission = {
            template: category,
            id,
            name: name1,
          };
          await manager.archive(submission1, buildDir);

          // Archive second submission with same ID but different name
          const submission2: Submission = {
            template: category,
            id,
            name: name2,
          };
          await manager.archive(submission2, buildDir);

          // Read the archived file
          const filePath = path.join(buildDir, category, `${id}.yaml`);
          const content = await fs.readFile(filePath, 'utf-8');
          const parsed = yaml.load(content) as RegisteredEntity;

          // Verify the file contains the updated data
          expect(parsed.data.name).toEqual(name2);

          // Verify only one entity exists
          const status = manager.getStatus();
          expect(status.totalCount).toBe(1);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 15.11: Archived data is valid YAML
   * 
   * For any valid submission, the archived file should be valid YAML
   * that can be parsed without errors.
   */
  it('should produce valid YAML files', async () => {
    await fc.assert(
      fc.asyncProperty(submissionWithAdditionalFieldsArb, async (submission) => {
        const manager = createRegistryManager();
        await manager.archive(submission, buildDir);

        // Read the archived file
        const filePath = path.join(buildDir, submission.template, `${submission.id}.yaml`);
        const content = await fs.readFile(filePath, 'utf-8');

        // Verify YAML can be parsed without errors
        expect(() => yaml.load(content)).not.toThrow();

        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 15.12: Internal registry state is updated after archiving
   * 
   * For any valid submission, after archiving, the internal registry state
   * should reflect the archived entity.
   */
  it('should update internal registry state after archiving', async () => {
    await fc.assert(
      fc.asyncProperty(submissionWithVersioningArb, async (submission) => {
        const manager = createRegistryManager();
        await manager.archive(submission, buildDir);

        // Verify internal state via getStatus
        const status = manager.getStatus();
        expect(status.totalCount).toBe(1);
        expect(status.byCategory[submission.template]).toBe(1);

        // Verify canon/non-canon counts
        if (submission.versioning!.canon) {
          expect(status.canonCount).toBe(1);
          expect(status.nonCanonCount).toBe(0);
        } else {
          expect(status.canonCount).toBe(0);
          expect(status.nonCanonCount).toBe(1);
        }

        return true;
      }),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Property 16: 索引文件一致性
// Feature: initialize, Property 16: 索引文件一致性
// **Validates: Requirements 6.5, 6.6, 10.6**
// ============================================================================

describe('Feature: initialize, Property 16: 索引文件一致性', () => {
  let tempDir: string;
  let buildDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'registry-index-pbt-'));
    buildDir = path.join(tempDir, '_build');
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  /**
   * Property 16.1: Index file contains all archived entities
   * 
   * For any set of archived submissions, the _index.yaml file should
   * contain an entry for each archived entity.
   */
  it('should contain all archived entities in index file', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(submissionArb, { minLength: 1, maxLength: 3 }),
        async (submissions) => {
          // Ensure unique IDs
          const uniqueSubmissions = submissions.filter(
            (s, i, arr) => arr.findIndex(x => x.id === s.id) === i
          );
          if (uniqueSubmissions.length === 0) return true;

          const manager = createRegistryManager();
          
          // Archive all submissions
          for (const submission of uniqueSubmissions) {
            await manager.archive(submission, buildDir);
          }
          await manager.updateIndex(buildDir);

          // Read and parse index file
          const indexPath = path.join(buildDir, '_index.yaml');
          const content = await fs.readFile(indexPath, 'utf-8');
          const parsed = yaml.load(content) as { entries?: Array<{ id: string }> };
          const entries = parsed.entries || [];

          // Verify all archived entities are in index
          expect(entries).toHaveLength(uniqueSubmissions.length);
          
          for (const submission of uniqueSubmissions) {
            const entry = entries.find(e => e.id === submission.id);
            expect(entry).toBeDefined();
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 16.2: Index entries match entity data
   * 
   * For any archived submission, the index entry should match the entity's
   * id, category, canon, priority, and archivedAt fields.
   */
  it('should have index entries matching entity data', async () => {
    await fc.assert(
      fc.asyncProperty(submissionWithVersioningArb, async (submission) => {
        const manager = createRegistryManager();
        await manager.archive(submission, buildDir);
        await manager.updateIndex(buildDir);

        // Read index file
        const indexPath = path.join(buildDir, '_index.yaml');
        const indexContent = await fs.readFile(indexPath, 'utf-8');
        const indexParsed = yaml.load(indexContent) as { 
          entries?: Array<{ 
            id: string; 
            category: string; 
            canon: boolean; 
            priority: string; 
            archivedAt: string;
          }> 
        };
        const entries = indexParsed.entries || [];

        // Read entity file
        const entityPath = path.join(buildDir, submission.template, `${submission.id}.yaml`);
        const entityContent = await fs.readFile(entityPath, 'utf-8');
        const entityParsed = yaml.load(entityContent) as RegisteredEntity;

        // Find index entry
        const indexEntry = entries.find(e => e.id === submission.id);
        expect(indexEntry).toBeDefined();

        // Verify fields match
        expect(indexEntry!.id).toBe(entityParsed.id);
        expect(indexEntry!.category).toBe(entityParsed.category);
        expect(indexEntry!.canon).toBe(submission.versioning!.canon);
        expect(indexEntry!.priority).toBe(submission.versioning!.priority);
        expect(indexEntry!.archivedAt).toBe(entityParsed.archivedAt);

        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 16.3: lastUpdated is a valid ISO timestamp
   * 
   * For any index file, the lastUpdated field should be a valid ISO 8601 timestamp.
   */
  it('should have valid ISO timestamp for lastUpdated', async () => {
    await fc.assert(
      fc.asyncProperty(submissionArb, async (submission) => {
        const manager = createRegistryManager();
        await manager.archive(submission, buildDir);
        await manager.updateIndex(buildDir);

        // Read index file
        const indexPath = path.join(buildDir, '_index.yaml');
        const content = await fs.readFile(indexPath, 'utf-8');
        const parsed = yaml.load(content) as { lastUpdated: string };

        // Verify lastUpdated is valid ISO timestamp
        expect(isValidISOTimestamp(parsed.lastUpdated)).toBe(true);

        // Verify timestamp is recent (within last minute)
        const lastUpdated = new Date(parsed.lastUpdated);
        const now = new Date();
        const diffMs = now.getTime() - lastUpdated.getTime();
        expect(diffMs).toBeGreaterThanOrEqual(0);
        expect(diffMs).toBeLessThan(60000);

        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 16.4: Index can be loaded back and matches internal state
   * 
   * For any set of archived submissions, after updating the index and
   * loading it back, the loaded index should match the internal state.
   */
  it('should allow index to be loaded back matching internal state', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(submissionWithVersioningArb, { minLength: 1, maxLength: 3 }),
        async (submissions) => {
          // Ensure unique IDs
          const uniqueSubmissions = submissions.filter(
            (s, i, arr) => arr.findIndex(x => x.id === s.id) === i
          );
          if (uniqueSubmissions.length === 0) return true;

          const manager = createRegistryManager();
          
          // Archive all submissions
          for (const submission of uniqueSubmissions) {
            await manager.archive(submission, buildDir);
          }
          await manager.updateIndex(buildDir);

          // Load registry with a new manager
          const newManager = createRegistryManager();
          const registry = await newManager.loadRegistry(buildDir);

          // Verify index entries match
          expect(registry.index.entries).toHaveLength(uniqueSubmissions.length);

          for (const submission of uniqueSubmissions) {
            const entry = registry.index.entries.find(e => e.id === submission.id);
            expect(entry).toBeDefined();
            expect(entry!.category).toBe(submission.template);
            expect(entry!.canon).toBe(submission.versioning!.canon);
            expect(entry!.priority).toBe(submission.versioning!.priority);
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  }, 30000); // Increase timeout for this test

  /**
   * Property 16.5: Index is consistent after multiple archive operations
   * 
   * For any sequence of archive operations, the index should always
   * reflect the current state of all archived entities.
   */
  it('should maintain consistency after multiple archive operations', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(submissionWithVersioningArb, { minLength: 2, maxLength: 3 }),
        async (submissions) => {
          // Ensure unique IDs
          const uniqueSubmissions = submissions.filter(
            (s, i, arr) => arr.findIndex(x => x.id === s.id) === i
          );
          if (uniqueSubmissions.length < 2) return true;

          const manager = createRegistryManager();
          
          // Archive all submissions first
          for (const submission of uniqueSubmissions) {
            await manager.archive(submission, buildDir);
          }
          await manager.updateIndex(buildDir);

          // Read index file
          const indexPath = path.join(buildDir, '_index.yaml');
          const content = await fs.readFile(indexPath, 'utf-8');
          const parsed = yaml.load(content) as { entries?: Array<{ id: string }> };
          const entries = parsed.entries || [];

          // Verify index has correct number of entries
          expect(entries).toHaveLength(uniqueSubmissions.length);

          // Verify all archived submissions are in index
          for (const submission of uniqueSubmissions) {
            const entry = entries.find(e => e.id === submission.id);
            expect(entry).toBeDefined();
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 16.6: Default values are applied correctly for missing versioning
   * 
   * For any submission without versioning, the index entry should use
   * default values: canon=true, priority='official'.
   */
  it('should apply default values for missing versioning', async () => {
    await fc.assert(
      fc.asyncProperty(submissionWithoutVersioningArb, async (submission) => {
        const manager = createRegistryManager();
        await manager.archive(submission, buildDir);
        await manager.updateIndex(buildDir);

        // Read index file
        const indexPath = path.join(buildDir, '_index.yaml');
        const content = await fs.readFile(indexPath, 'utf-8');
        const parsed = yaml.load(content) as { 
          entries?: Array<{ 
            id: string; 
            canon: boolean; 
            priority: string;
          }> 
        };
        const entries = parsed.entries || [];

        // Find index entry
        const entry = entries.find(e => e.id === submission.id);
        expect(entry).toBeDefined();

        // Verify default values are applied (updateIndex uses canon=true, priority='official' as defaults)
        expect(entry!.canon).toBe(true);
        expect(entry!.priority).toBe('official');

        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 16.7: Index entries preserve versioning information
   * 
   * For any submission with versioning, the index entry should preserve
   * the canon status and priority level from the versioning field.
   */
  it('should preserve versioning information in index entries', async () => {
    await fc.assert(
      fc.asyncProperty(submissionWithVersioningArb, async (submission) => {
        const manager = createRegistryManager();
        await manager.archive(submission, buildDir);
        await manager.updateIndex(buildDir);

        // Read index file
        const indexPath = path.join(buildDir, '_index.yaml');
        const content = await fs.readFile(indexPath, 'utf-8');
        const parsed = yaml.load(content) as { 
          entries?: Array<{ 
            id: string; 
            canon: boolean; 
            priority: string;
          }> 
        };
        const entries = parsed.entries || [];

        // Find index entry
        const entry = entries.find(e => e.id === submission.id);
        expect(entry).toBeDefined();

        // Verify versioning is preserved
        expect(entry!.canon).toBe(submission.versioning!.canon);
        expect(entry!.priority).toBe(submission.versioning!.priority);

        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 16.8: Index file is valid YAML
   * 
   * For any set of archived submissions, the generated _index.yaml
   * should be valid YAML that can be parsed without errors.
   */
  it('should produce valid YAML index file', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(submissionArb, { minLength: 0, maxLength: 3 }),
        async (submissions) => {
          // Ensure unique IDs
          const uniqueSubmissions = submissions.filter(
            (s, i, arr) => arr.findIndex(x => x.id === s.id) === i
          );

          const manager = createRegistryManager();
          
          // Archive all submissions
          for (const submission of uniqueSubmissions) {
            await manager.archive(submission, buildDir);
          }
          await manager.updateIndex(buildDir);

          // Read index file
          const indexPath = path.join(buildDir, '_index.yaml');
          const content = await fs.readFile(indexPath, 'utf-8');

          // Verify YAML can be parsed without errors
          expect(() => yaml.load(content)).not.toThrow();

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 16.9: Index entries have all required fields
   * 
   * For any archived submission, the index entry should have all
   * required fields: id, category, canon, priority, archivedAt.
   */
  it('should have all required fields in index entries', async () => {
    await fc.assert(
      fc.asyncProperty(submissionArb, async (submission) => {
        const manager = createRegistryManager();
        await manager.archive(submission, buildDir);
        await manager.updateIndex(buildDir);

        // Read index file
        const indexPath = path.join(buildDir, '_index.yaml');
        const content = await fs.readFile(indexPath, 'utf-8');
        const parsed = yaml.load(content) as { entries?: Array<Record<string, unknown>> };
        const entries = parsed.entries || [];

        // Find index entry
        const entry = entries.find(e => e.id === submission.id);
        expect(entry).toBeDefined();

        // Verify all required fields exist
        expect(entry).toHaveProperty('id');
        expect(entry).toHaveProperty('category');
        expect(entry).toHaveProperty('canon');
        expect(entry).toHaveProperty('priority');
        expect(entry).toHaveProperty('archivedAt');

        // Verify field types
        expect(typeof entry!.id).toBe('string');
        expect(typeof entry!.category).toBe('string');
        expect(typeof entry!.canon).toBe('boolean');
        expect(typeof entry!.priority).toBe('string');
        expect(typeof entry!.archivedAt).toBe('string');

        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 16.10: Index supports all 9 categories
   * 
   * For any of the 9 categories, archiving and updating index should
   * work correctly with proper category recorded.
   */
  it('should support all 9 categories in index', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...CATEGORIES),
        fc.stringMatching(/^[a-z0-9]{1,10}$/),
        bilingualNameArb,
        versioningArb,
        async (category, idSuffix, name, versioning) => {
          const submission: Submission = {
            template: category,
            id: `${category}-${idSuffix}`,
            name,
            versioning,
          };

          const manager = createRegistryManager();
          await manager.archive(submission, buildDir);
          await manager.updateIndex(buildDir);

          // Read index file
          const indexPath = path.join(buildDir, '_index.yaml');
          const content = await fs.readFile(indexPath, 'utf-8');
          const parsed = yaml.load(content) as { 
            entries?: Array<{ id: string; category: string }> 
          };
          const entries = parsed.entries || [];

          // Find index entry
          const entry = entries.find(e => e.id === submission.id);
          expect(entry).toBeDefined();
          expect(entry!.category).toBe(category);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 16.11: Overwriting entity updates index entry
   * 
   * For a submission with the same ID as an existing archived entity,
   * archiving and updating index should update the existing entry.
   */
  it('should update index entry when overwriting entity', async () => {
    await fc.assert(
      fc.asyncProperty(
        categoryArb,
        fc.stringMatching(/^[a-z0-9]{1,10}$/),
        bilingualNameArb,
        fc.record({
          canon: fc.constant(false),
          source: fc.stringMatching(/^author-[a-z0-9]{1,10}$/),
          priority: fc.constant('secondary' as Priority),
        }),
        fc.record({
          canon: fc.constant(true),
          source: fc.stringMatching(/^author-[a-z0-9]{1,10}$/),
          priority: fc.constant('official' as Priority),
        }),
        async (category, idSuffix, name, versioning1, versioning2) => {
          const id = `${category}-${idSuffix}`;
          const manager = createRegistryManager();

          // Archive first submission (non-canon)
          const submission1: Submission = {
            template: category,
            id,
            name,
            versioning: versioning1,
          };
          await manager.archive(submission1, buildDir);
          await manager.updateIndex(buildDir);

          // Archive second submission with same ID (canon)
          const submission2: Submission = {
            template: category,
            id,
            name,
            versioning: versioning2,
          };
          await manager.archive(submission2, buildDir);
          await manager.updateIndex(buildDir);

          // Read index file
          const indexPath = path.join(buildDir, '_index.yaml');
          const content = await fs.readFile(indexPath, 'utf-8');
          const parsed = yaml.load(content) as { 
            entries?: Array<{ id: string; canon: boolean; priority: string }> 
          };
          const entries = parsed.entries || [];

          // Verify only one entry exists
          expect(entries).toHaveLength(1);

          // Verify entry has updated values
          const entry = entries.find(e => e.id === id);
          expect(entry).toBeDefined();
          expect(entry!.canon).toBe(true);
          expect(entry!.priority).toBe('official');

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 16.12: Index lastUpdated is updated on each updateIndex call
   * 
   * For any updateIndex call, the lastUpdated timestamp should be
   * updated to reflect the current time.
   */
  it('should update lastUpdated timestamp on each updateIndex call', async () => {
    await fc.assert(
      fc.asyncProperty(submissionArb, async (submission) => {
        const manager = createRegistryManager();
        await manager.archive(submission, buildDir);
        
        // First updateIndex
        const beforeFirst = new Date();
        await manager.updateIndex(buildDir);
        
        // Read first timestamp
        const indexPath = path.join(buildDir, '_index.yaml');
        let content = await fs.readFile(indexPath, 'utf-8');
        let parsed = yaml.load(content) as { lastUpdated: string };
        const firstTimestamp = parsed.lastUpdated;
        
        // Wait a small amount to ensure time difference
        await new Promise(resolve => setTimeout(resolve, 10));
        
        // Second updateIndex
        await manager.updateIndex(buildDir);
        
        // Read second timestamp
        content = await fs.readFile(indexPath, 'utf-8');
        parsed = yaml.load(content) as { lastUpdated: string };
        const secondTimestamp = parsed.lastUpdated;
        
        // Verify timestamps are valid
        expect(isValidISOTimestamp(firstTimestamp)).toBe(true);
        expect(isValidISOTimestamp(secondTimestamp)).toBe(true);
        
        // Verify first timestamp is after beforeFirst
        const firstDate = new Date(firstTimestamp);
        expect(firstDate.getTime()).toBeGreaterThanOrEqual(beforeFirst.getTime() - 1000);
        
        // Verify second timestamp is >= first timestamp
        const secondDate = new Date(secondTimestamp);
        expect(secondDate.getTime()).toBeGreaterThanOrEqual(firstDate.getTime());

        return true;
      }),
      { numRuns: 100 }
    );
  });
});


// ============================================================================
// Property 19: 注册表重建幂等性
// Feature: initialize, Property 19: 注册表重建幂等性
// **Validates: Requirements 8.4**
// ============================================================================

describe('Feature: initialize, Property 19: 注册表重建幂等性', () => {
  let tempDir: string;
  let submissionsDir: string;
  let buildDir: string;

  beforeEach(async () => {
    // Use a unique temp directory for each test to ensure isolation
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), `registry-rebuild-pbt-${Date.now()}-`));
    submissionsDir = path.join(tempDir, 'submissions');
    buildDir = path.join(tempDir, '_build');
    await fs.mkdir(submissionsDir, { recursive: true });
  });

  afterEach(async () => {
    // Add a small delay to allow file handles to be released on Windows
    await new Promise(resolve => setTimeout(resolve, 50));
    try {
      await fs.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch {
      // Ignore cleanup errors - temp directory will be cleaned up by OS
    }
  });

  /**
   * Helper: Clean up directories between fast-check iterations
   */
  async function cleanupDirectories(): Promise<void> {
    // Clean submissions directory
    try {
      await fs.rm(submissionsDir, { recursive: true, force: true });
    } catch {
      // Ignore errors
    }
    await fs.mkdir(submissionsDir, { recursive: true });
    
    // Clean build directory
    try {
      await fs.rm(buildDir, { recursive: true, force: true });
    } catch {
      // Ignore errors
    }
  }

  /**
   * Helper: Create a submission file in the submissions directory
   */
  async function createSubmissionFile(submission: Submission): Promise<void> {
    const categoryDir = path.join(submissionsDir, submission.template);
    await fs.mkdir(categoryDir, { recursive: true });
    const filePath = path.join(categoryDir, `${submission.id}.yaml`);
    const content = yaml.dump(submission, {
      indent: 2,
      lineWidth: -1,
      quotingType: '"',
      forceQuotes: false,
    });
    await fs.writeFile(filePath, content, 'utf-8');
  }

  /**
   * Helper: Read all files from build directory and return normalized content
   */
  async function readBuildDirectory(dir: string): Promise<Map<string, unknown>> {
    const result = new Map<string, unknown>();
    
    const dirExists = await fs.stat(dir).then(s => s.isDirectory()).catch(() => false);
    if (!dirExists) {
      return result;
    }

    // Read index file
    const indexPath = path.join(dir, '_index.yaml');
    const indexExists = await fs.stat(indexPath).then(s => s.isFile()).catch(() => false);
    if (indexExists) {
      const indexContent = await fs.readFile(indexPath, 'utf-8');
      const indexParsed = yaml.load(indexContent) as Record<string, unknown>;
      // Normalize: remove lastUpdated for comparison (it changes on each rebuild)
      const normalizedIndex = { ...indexParsed };
      delete normalizedIndex.lastUpdated;
      // Sort entries by id for consistent comparison
      if (Array.isArray(normalizedIndex.entries)) {
        normalizedIndex.entries = [...normalizedIndex.entries].sort((a: { id: string }, b: { id: string }) => 
          a.id.localeCompare(b.id)
        );
        // Remove archivedAt from entries for comparison
        normalizedIndex.entries = normalizedIndex.entries.map((entry: Record<string, unknown>) => {
          const { archivedAt, ...rest } = entry;
          return rest;
        });
      }
      result.set('_index.yaml', normalizedIndex);
    }

    // Read all category directories
    for (const category of CATEGORIES) {
      const categoryDir = path.join(dir, category);
      const categoryExists = await fs.stat(categoryDir).then(s => s.isDirectory()).catch(() => false);
      if (!categoryExists) continue;

      const files = await fs.readdir(categoryDir);
      for (const file of files) {
        if (!file.endsWith('.yaml') && !file.endsWith('.yml')) continue;
        
        const filePath = path.join(categoryDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const parsed = yaml.load(content) as Record<string, unknown>;
        
        // Normalize: remove archivedAt for comparison (it changes on each rebuild)
        const normalized = { ...parsed };
        delete normalized.archivedAt;
        
        result.set(`${category}/${file}`, normalized);
      }
    }

    return result;
  }

  /**
   * Property 19.1: Rebuild produces same results when run multiple times (idempotency)
   * 
   * For any set of submissions, running rebuild() multiple times should produce
   * the same output directory content (excluding timestamps).
   */
  it('should produce same results when rebuild is run multiple times', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(submissionArb, { minLength: 1, maxLength: 3 }),
        async (submissions) => {
          // Clean up directories between iterations
          await cleanupDirectories();
          
          // Ensure unique IDs
          const uniqueSubmissions = submissions.filter(
            (s, i, arr) => arr.findIndex(x => x.id === s.id) === i
          );
          if (uniqueSubmissions.length === 0) return true;

          // Create submission files
          for (const submission of uniqueSubmissions) {
            await createSubmissionFile(submission);
          }

          const manager1 = createRegistryManager();
          const manager2 = createRegistryManager();

          // First rebuild
          await manager1.rebuild(submissionsDir, buildDir);
          const firstResult = await readBuildDirectory(buildDir);

          // Second rebuild (should clear and rebuild)
          await manager2.rebuild(submissionsDir, buildDir);
          const secondResult = await readBuildDirectory(buildDir);

          // Compare results (excluding timestamps)
          expect(firstResult.size).toBe(secondResult.size);
          
          for (const [key, value] of firstResult) {
            expect(secondResult.has(key)).toBe(true);
            expect(secondResult.get(key)).toEqual(value);
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  }, 60000);

  /**
   * Property 19.2: All submissions are archived correctly after rebuild
   * 
   * For any set of submissions, after rebuild, all submissions should be
   * present in the build directory with correct data.
   */
  it('should archive all submissions correctly after rebuild', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(submissionArb, { minLength: 1, maxLength: 3 }),
        async (submissions) => {
          // Clean up directories between iterations
          await cleanupDirectories();
          
          // Ensure unique IDs
          const uniqueSubmissions = submissions.filter(
            (s, i, arr) => arr.findIndex(x => x.id === s.id) === i
          );
          if (uniqueSubmissions.length === 0) return true;

          // Create submission files
          for (const submission of uniqueSubmissions) {
            await createSubmissionFile(submission);
          }

          const manager = createRegistryManager();
          await manager.rebuild(submissionsDir, buildDir);

          // Verify all submissions are archived
          for (const submission of uniqueSubmissions) {
            const entityPath = path.join(buildDir, submission.template, `${submission.id}.yaml`);
            const fileExists = await fs.stat(entityPath).then(s => s.isFile()).catch(() => false);
            expect(fileExists).toBe(true);

            // Verify entity content
            const content = await fs.readFile(entityPath, 'utf-8');
            const parsed = yaml.load(content) as RegisteredEntity;
            
            expect(parsed.id).toBe(submission.id);
            expect(parsed.category).toBe(submission.template);
            expect(parsed.data.template).toBe(submission.template);
            expect(parsed.data.id).toBe(submission.id);
            expect(parsed.data.name).toEqual(submission.name);
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  }, 60000);

  /**
   * Property 19.3: Files starting with `_` are skipped during rebuild
   * 
   * For any submissions directory containing files starting with `_`,
   * those files should not be archived during rebuild.
   */
  it('should skip files starting with underscore during rebuild', async () => {
    await fc.assert(
      fc.asyncProperty(
        submissionArb,
        fc.stringMatching(/^[a-z0-9]{1,10}$/),
        async (submission, exampleSuffix) => {
          // Clean up directories between iterations
          await cleanupDirectories();
          
          // Create a valid submission file
          await createSubmissionFile(submission);

          // Create an example file (starting with _)
          const categoryDir = path.join(submissionsDir, submission.template);
          const examplePath = path.join(categoryDir, `_example-${exampleSuffix}.yaml`);
          const exampleContent = yaml.dump({
            template: submission.template,
            id: `${submission.template}-example-${exampleSuffix}`,
            name: { zh: '示例' },
          });
          await fs.writeFile(examplePath, exampleContent, 'utf-8');

          const manager = createRegistryManager();
          await manager.rebuild(submissionsDir, buildDir);

          // Verify the valid submission is archived
          const validEntityPath = path.join(buildDir, submission.template, `${submission.id}.yaml`);
          const validExists = await fs.stat(validEntityPath).then(s => s.isFile()).catch(() => false);
          expect(validExists).toBe(true);

          // Verify the example file is NOT archived
          const exampleEntityPath = path.join(buildDir, submission.template, `_example-${exampleSuffix}.yaml`);
          const exampleExists = await fs.stat(exampleEntityPath).then(s => s.isFile()).catch(() => false);
          expect(exampleExists).toBe(false);

          // Also verify the example ID is not in the build directory
          const exampleIdPath = path.join(buildDir, submission.template, `${submission.template}-example-${exampleSuffix}.yaml`);
          const exampleIdExists = await fs.stat(exampleIdPath).then(s => s.isFile()).catch(() => false);
          expect(exampleIdExists).toBe(false);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  }, 60000);

  /**
   * Property 19.4: Index file is consistent after rebuild
   * 
   * For any set of submissions, after rebuild, the _index.yaml file should
   * contain entries for all archived submissions with correct metadata.
   */
  it('should have consistent index file after rebuild', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(submissionWithVersioningArb, { minLength: 1, maxLength: 3 }),
        async (submissions) => {
          // Clean up directories between iterations
          await cleanupDirectories();
          
          // Ensure unique IDs
          const uniqueSubmissions = submissions.filter(
            (s, i, arr) => arr.findIndex(x => x.id === s.id) === i
          );
          if (uniqueSubmissions.length === 0) return true;

          // Create submission files
          for (const submission of uniqueSubmissions) {
            await createSubmissionFile(submission);
          }

          const manager = createRegistryManager();
          await manager.rebuild(submissionsDir, buildDir);

          // Read index file
          const indexPath = path.join(buildDir, '_index.yaml');
          const indexContent = await fs.readFile(indexPath, 'utf-8');
          const indexParsed = yaml.load(indexContent) as { 
            lastUpdated: string;
            entries: Array<{ 
              id: string; 
              category: string; 
              canon: boolean; 
              priority: string;
              archivedAt: string;
            }>;
          };

          // Verify lastUpdated is valid ISO timestamp
          expect(isValidISOTimestamp(indexParsed.lastUpdated)).toBe(true);

          // Verify all submissions are in index
          expect(indexParsed.entries).toHaveLength(uniqueSubmissions.length);

          for (const submission of uniqueSubmissions) {
            const entry = indexParsed.entries.find(e => e.id === submission.id);
            expect(entry).toBeDefined();
            expect(entry!.category).toBe(submission.template);
            expect(entry!.canon).toBe(submission.versioning!.canon);
            expect(entry!.priority).toBe(submission.versioning!.priority);
            expect(isValidISOTimestamp(entry!.archivedAt)).toBe(true);
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  }, 60000);

  /**
   * Property 19.5: Entity data matches original submission after rebuild
   * 
   * For any submission, after rebuild, the archived entity's data field
   * should exactly match the original submission content.
   */
  it('should have entity data matching original submission after rebuild', async () => {
    await fc.assert(
      fc.asyncProperty(submissionWithAdditionalFieldsArb, async (submission) => {
        // Clean up directories between iterations
        await cleanupDirectories();
        
        // Create submission file
        await createSubmissionFile(submission);

        const manager = createRegistryManager();
        await manager.rebuild(submissionsDir, buildDir);

        // Read archived entity
        const entityPath = path.join(buildDir, submission.template, `${submission.id}.yaml`);
        const content = await fs.readFile(entityPath, 'utf-8');
        const parsed = yaml.load(content) as RegisteredEntity;

        // Verify data matches original submission
        expect(parsed.data.template).toBe(submission.template);
        expect(parsed.data.id).toBe(submission.id);
        expect(parsed.data.name).toEqual(submission.name);

        if (submission.versioning !== undefined) {
          expect(parsed.data.versioning).toEqual(submission.versioning);
        }

        // Verify additional fields
        if (submission['description'] !== undefined) {
          expect(parsed.data['description']).toEqual(submission['description']);
        }
        if (submission['epoch'] !== undefined) {
          expect(parsed.data['epoch']).toBe(submission['epoch']);
        }
        if (submission['birth_year'] !== undefined) {
          expect(parsed.data['birth_year']).toBe(submission['birth_year']);
        }

        return true;
      }),
      { numRuns: 100 }
    );
  }, 60000);

  /**
   * Property 19.6: Rebuild clears old data before rebuilding
   * 
   * For any rebuild operation, the build directory should be cleared first,
   * ensuring no stale data remains from previous builds.
   */
  it('should clear old data before rebuilding', async () => {
    await fc.assert(
      fc.asyncProperty(
        submissionArb,
        submissionArb,
        async (submission1, submission2) => {
          // Clean up directories between iterations
          await cleanupDirectories();
          
          // Ensure different IDs
          fc.pre(submission1.id !== submission2.id);

          // First: create and rebuild with submission1
          await createSubmissionFile(submission1);
          
          const manager1 = createRegistryManager();
          await manager1.rebuild(submissionsDir, buildDir);

          // Verify submission1 is archived
          const entity1Path = path.join(buildDir, submission1.template, `${submission1.id}.yaml`);
          let entity1Exists = await fs.stat(entity1Path).then(s => s.isFile()).catch(() => false);
          expect(entity1Exists).toBe(true);

          // Remove submission1 and add submission2
          const submission1Path = path.join(submissionsDir, submission1.template, `${submission1.id}.yaml`);
          await fs.unlink(submission1Path);
          
          // Clean up empty category directory if needed
          const category1Dir = path.join(submissionsDir, submission1.template);
          const category1Files = await fs.readdir(category1Dir).catch(() => []);
          if (category1Files.length === 0) {
            await fs.rmdir(category1Dir).catch(() => {});
          }

          await createSubmissionFile(submission2);

          // Second rebuild
          const manager2 = createRegistryManager();
          await manager2.rebuild(submissionsDir, buildDir);

          // Verify submission1 is NO LONGER archived (old data cleared)
          entity1Exists = await fs.stat(entity1Path).then(s => s.isFile()).catch(() => false);
          expect(entity1Exists).toBe(false);

          // Verify submission2 IS archived
          const entity2Path = path.join(buildDir, submission2.template, `${submission2.id}.yaml`);
          const entity2Exists = await fs.stat(entity2Path).then(s => s.isFile()).catch(() => false);
          expect(entity2Exists).toBe(true);

          // Verify index only contains submission2
          const indexPath = path.join(buildDir, '_index.yaml');
          const indexContent = await fs.readFile(indexPath, 'utf-8');
          const indexParsed = yaml.load(indexContent) as { entries: Array<{ id: string }> };
          
          expect(indexParsed.entries).toHaveLength(1);
          expect(indexParsed.entries[0].id).toBe(submission2.id);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  }, 60000);

  /**
   * Property 19.7: Rebuild supports all 9 categories
   * 
   * For any of the 9 categories, rebuild should correctly archive
   * submissions from that category.
   */
  it('should support all 9 categories during rebuild', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...CATEGORIES),
        fc.stringMatching(/^[a-z0-9]{1,10}$/),
        bilingualNameArb,
        async (category, idSuffix, name) => {
          // Clean up directories between iterations
          await cleanupDirectories();
          
          const submission: Submission = {
            template: category,
            id: `${category}-${idSuffix}`,
            name,
          };

          await createSubmissionFile(submission);

          const manager = createRegistryManager();
          await manager.rebuild(submissionsDir, buildDir);

          // Verify entity is archived in correct category
          const entityPath = path.join(buildDir, category, `${submission.id}.yaml`);
          const fileExists = await fs.stat(entityPath).then(s => s.isFile()).catch(() => false);
          expect(fileExists).toBe(true);

          // Verify content
          const content = await fs.readFile(entityPath, 'utf-8');
          const parsed = yaml.load(content) as RegisteredEntity;
          expect(parsed.category).toBe(category);
          expect(parsed.data.template).toBe(category);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  }, 60000);

  /**
   * Property 19.8: Rebuild with empty submissions directory produces empty build
   * 
   * For an empty submissions directory, rebuild should produce an empty
   * build directory with only the index file.
   */
  it('should produce empty build for empty submissions directory', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(null), async () => {
        // Clean up directories between iterations
        await cleanupDirectories();
        
        const manager = createRegistryManager();
        await manager.rebuild(submissionsDir, buildDir);

        // Verify build directory exists
        const buildExists = await fs.stat(buildDir).then(s => s.isDirectory()).catch(() => false);
        expect(buildExists).toBe(true);

        // Verify index file exists with empty entries
        const indexPath = path.join(buildDir, '_index.yaml');
        const indexContent = await fs.readFile(indexPath, 'utf-8');
        const indexParsed = yaml.load(indexContent) as { entries: unknown[] };
        
        expect(indexParsed.entries).toEqual([]);

        // Verify no category directories have files
        for (const category of CATEGORIES) {
          const categoryDir = path.join(buildDir, category);
          const categoryExists = await fs.stat(categoryDir).then(s => s.isDirectory()).catch(() => false);
          if (categoryExists) {
            const files = await fs.readdir(categoryDir);
            expect(files).toHaveLength(0);
          }
        }

        return true;
      }),
      { numRuns: 10 } // Fewer runs since this is a simple case
    );
  });

  /**
   * Property 19.9: Rebuild handles multiple submissions in same category
   * 
   * For multiple submissions in the same category, rebuild should archive
   * all of them correctly without overwriting each other.
   */
  it('should handle multiple submissions in same category during rebuild', async () => {
    await fc.assert(
      fc.asyncProperty(
        categoryArb,
        fc.array(fc.stringMatching(/^[a-z0-9]{1,10}$/), { minLength: 2, maxLength: 4 }),
        async (category, idSuffixes) => {
          // Clean up directories between iterations
          await cleanupDirectories();
          
          // Ensure unique suffixes
          const uniqueSuffixes = [...new Set(idSuffixes)];
          if (uniqueSuffixes.length < 2) return true;

          // Create multiple submissions in same category
          const submissions: Submission[] = uniqueSuffixes.map(suffix => ({
            template: category,
            id: `${category}-${suffix}`,
            name: { zh: `测试${suffix}` },
          }));

          for (const submission of submissions) {
            await createSubmissionFile(submission);
          }

          const manager = createRegistryManager();
          await manager.rebuild(submissionsDir, buildDir);

          // Verify all submissions are archived
          for (const submission of submissions) {
            const entityPath = path.join(buildDir, category, `${submission.id}.yaml`);
            const fileExists = await fs.stat(entityPath).then(s => s.isFile()).catch(() => false);
            expect(fileExists).toBe(true);
          }

          // Verify index contains all entries
          const indexPath = path.join(buildDir, '_index.yaml');
          const indexContent = await fs.readFile(indexPath, 'utf-8');
          const indexParsed = yaml.load(indexContent) as { entries: Array<{ id: string }> };
          
          expect(indexParsed.entries).toHaveLength(submissions.length);
          
          for (const submission of submissions) {
            const entry = indexParsed.entries.find(e => e.id === submission.id);
            expect(entry).toBeDefined();
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  }, 60000);

  /**
   * Property 19.10: Rebuild handles submissions across multiple categories
   * 
   * For submissions across different categories, rebuild should archive
   * all of them to their respective category directories.
   */
  it('should handle submissions across multiple categories during rebuild', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(categoryArb, { minLength: 2, maxLength: 4 }),
        async (categories) => {
          // Clean up directories between iterations
          await cleanupDirectories();
          
          // Ensure unique categories
          const uniqueCategories = [...new Set(categories)];
          if (uniqueCategories.length < 2) return true;

          // Create one submission per category
          const submissions: Submission[] = uniqueCategories.map(category => ({
            template: category,
            id: `${category}-test`,
            name: { zh: `测试${category}` },
          }));

          for (const submission of submissions) {
            await createSubmissionFile(submission);
          }

          const manager = createRegistryManager();
          await manager.rebuild(submissionsDir, buildDir);

          // Verify all submissions are archived in correct categories
          for (const submission of submissions) {
            const entityPath = path.join(buildDir, submission.template, `${submission.id}.yaml`);
            const fileExists = await fs.stat(entityPath).then(s => s.isFile()).catch(() => false);
            expect(fileExists).toBe(true);

            const content = await fs.readFile(entityPath, 'utf-8');
            const parsed = yaml.load(content) as RegisteredEntity;
            expect(parsed.category).toBe(submission.template);
          }

          // Verify index contains all entries
          const indexPath = path.join(buildDir, '_index.yaml');
          const indexContent = await fs.readFile(indexPath, 'utf-8');
          const indexParsed = yaml.load(indexContent) as { entries: Array<{ id: string; category: string }> };
          
          expect(indexParsed.entries).toHaveLength(submissions.length);
          
          for (const submission of submissions) {
            const entry = indexParsed.entries.find(e => e.id === submission.id);
            expect(entry).toBeDefined();
            expect(entry!.category).toBe(submission.template);
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  }, 60000);
});


// ============================================================================
// Property 20: 注册表状态统计准确性
// Feature: initialize, Property 20: 注册表状态统计准确性
// **Validates: Requirements 8.5**
// ============================================================================

describe('Feature: initialize, Property 20: 注册表状态统计准确性', () => {
  let tempDir: string;
  let submissionsDir: string;
  let buildDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), `registry-status-pbt-${Date.now()}-`));
    submissionsDir = path.join(tempDir, 'submissions');
    buildDir = path.join(tempDir, '_build');
    await fs.mkdir(submissionsDir, { recursive: true });
  });

  afterEach(async () => {
    await new Promise(resolve => setTimeout(resolve, 50));
    try {
      await fs.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch {
      // Ignore cleanup errors
    }
  });

  /**
   * Helper: Clean up directories between fast-check iterations
   */
  async function cleanupDirectories(): Promise<void> {
    try {
      await fs.rm(submissionsDir, { recursive: true, force: true });
    } catch {
      // Ignore errors
    }
    await fs.mkdir(submissionsDir, { recursive: true });
    
    try {
      await fs.rm(buildDir, { recursive: true, force: true });
    } catch {
      // Ignore errors
    }
  }

  /**
   * Helper: Create a submission file in the submissions directory
   */
  async function createSubmissionFile(submission: Submission): Promise<void> {
    const categoryDir = path.join(submissionsDir, submission.template);
    await fs.mkdir(categoryDir, { recursive: true });
    const filePath = path.join(categoryDir, `${submission.id}.yaml`);
    const content = yaml.dump(submission, {
      indent: 2,
      lineWidth: -1,
      quotingType: '"',
      forceQuotes: false,
    });
    await fs.writeFile(filePath, content, 'utf-8');
  }

  /**
   * Property 20.1: totalCount equals sum of all byCategory counts
   * 
   * For any set of archived submissions, the totalCount in getStatus()
   * should equal the sum of all byCategory counts.
   */
  it('should have totalCount equal to sum of all byCategory counts', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(submissionArb, { minLength: 0, maxLength: 5 }),
        async (submissions) => {
          await cleanupDirectories();
          
          // Ensure unique IDs
          const uniqueSubmissions = submissions.filter(
            (s, i, arr) => arr.findIndex(x => x.id === s.id) === i
          );

          const manager = createRegistryManager();
          
          // Archive all submissions
          for (const submission of uniqueSubmissions) {
            await manager.archive(submission, buildDir);
          }

          const status = manager.getStatus();
          
          // Calculate sum of all byCategory counts
          const categorySum = CATEGORIES.reduce(
            (sum, category) => sum + status.byCategory[category],
            0
          );

          expect(status.totalCount).toBe(categorySum);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 20.2: totalCount equals canonCount + nonCanonCount
   * 
   * For any set of archived submissions, the totalCount should equal
   * the sum of canonCount and nonCanonCount.
   */
  it('should have totalCount equal to canonCount + nonCanonCount', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(submissionArb, { minLength: 0, maxLength: 5 }),
        async (submissions) => {
          await cleanupDirectories();
          
          // Ensure unique IDs
          const uniqueSubmissions = submissions.filter(
            (s, i, arr) => arr.findIndex(x => x.id === s.id) === i
          );

          const manager = createRegistryManager();
          
          // Archive all submissions
          for (const submission of uniqueSubmissions) {
            await manager.archive(submission, buildDir);
          }

          const status = manager.getStatus();
          
          expect(status.totalCount).toBe(status.canonCount + status.nonCanonCount);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 20.3: byCategory counts match actual entity counts per category
   * 
   * For any set of archived submissions, the byCategory counts should
   * match the actual number of entities archived in each category.
   */
  it('should have byCategory counts matching actual entity counts per category', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(submissionArb, { minLength: 1, maxLength: 5 }),
        async (submissions) => {
          await cleanupDirectories();
          
          // Ensure unique IDs
          const uniqueSubmissions = submissions.filter(
            (s, i, arr) => arr.findIndex(x => x.id === s.id) === i
          );
          if (uniqueSubmissions.length === 0) return true;

          const manager = createRegistryManager();
          
          // Archive all submissions
          for (const submission of uniqueSubmissions) {
            await manager.archive(submission, buildDir);
          }

          const status = manager.getStatus();
          
          // Calculate expected counts per category
          const expectedCounts: Record<Category, number> = {
            character: 0,
            race: 0,
            creature: 0,
            flora: 0,
            location: 0,
            history: 0,
            faction: 0,
            artifact: 0,
            concept: 0,
          };
          
          for (const submission of uniqueSubmissions) {
            expectedCounts[submission.template]++;
          }

          // Verify each category count
          for (const category of CATEGORIES) {
            expect(status.byCategory[category]).toBe(expectedCounts[category]);
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 20.4: canonCount matches entities with versioning.canon=true
   * 
   * For any set of archived submissions, the canonCount should match
   * the number of entities that have versioning.canon=true.
   */
  it('should have canonCount matching entities with versioning.canon=true', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(submissionWithVersioningArb, { minLength: 1, maxLength: 5 }),
        async (submissions) => {
          await cleanupDirectories();
          
          // Ensure unique IDs
          const uniqueSubmissions = submissions.filter(
            (s, i, arr) => arr.findIndex(x => x.id === s.id) === i
          );
          if (uniqueSubmissions.length === 0) return true;

          const manager = createRegistryManager();
          
          // Archive all submissions
          for (const submission of uniqueSubmissions) {
            await manager.archive(submission, buildDir);
          }

          const status = manager.getStatus();
          
          // Calculate expected canon count
          const expectedCanonCount = uniqueSubmissions.filter(
            s => s.versioning?.canon === true
          ).length;

          expect(status.canonCount).toBe(expectedCanonCount);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 20.5: nonCanonCount matches entities with versioning.canon=false or missing versioning
   * 
   * For any set of archived submissions, the nonCanonCount should match
   * the number of entities that have versioning.canon=false or no versioning field.
   */
  it('should have nonCanonCount matching entities with versioning.canon=false or missing versioning', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(submissionArb, { minLength: 1, maxLength: 5 }),
        async (submissions) => {
          await cleanupDirectories();
          
          // Ensure unique IDs
          const uniqueSubmissions = submissions.filter(
            (s, i, arr) => arr.findIndex(x => x.id === s.id) === i
          );
          if (uniqueSubmissions.length === 0) return true;

          const manager = createRegistryManager();
          
          // Archive all submissions
          for (const submission of uniqueSubmissions) {
            await manager.archive(submission, buildDir);
          }

          const status = manager.getStatus();
          
          // Calculate expected non-canon count
          // Non-canon includes: versioning.canon=false OR no versioning field
          const expectedNonCanonCount = uniqueSubmissions.filter(
            s => !s.versioning?.canon
          ).length;

          expect(status.nonCanonCount).toBe(expectedNonCanonCount);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 20.6: Statistics are accurate after archive operations
   * 
   * For any sequence of archive operations, the statistics should
   * accurately reflect the current state after each operation.
   */
  it('should have accurate statistics after archive operations', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(submissionWithVersioningArb, { minLength: 2, maxLength: 4 }),
        async (submissions) => {
          await cleanupDirectories();
          
          // Ensure unique IDs
          const uniqueSubmissions = submissions.filter(
            (s, i, arr) => arr.findIndex(x => x.id === s.id) === i
          );
          if (uniqueSubmissions.length < 2) return true;

          const manager = createRegistryManager();
          
          // Archive submissions one by one and verify statistics after each
          let archivedCount = 0;
          let canonCount = 0;
          let nonCanonCount = 0;
          const categoryCounts: Record<Category, number> = {
            character: 0,
            race: 0,
            creature: 0,
            flora: 0,
            location: 0,
            history: 0,
            faction: 0,
            artifact: 0,
            concept: 0,
          };

          for (const submission of uniqueSubmissions) {
            await manager.archive(submission, buildDir);
            
            archivedCount++;
            categoryCounts[submission.template]++;
            if (submission.versioning?.canon) {
              canonCount++;
            } else {
              nonCanonCount++;
            }

            const status = manager.getStatus();
            
            expect(status.totalCount).toBe(archivedCount);
            expect(status.canonCount).toBe(canonCount);
            expect(status.nonCanonCount).toBe(nonCanonCount);
            
            for (const category of CATEGORIES) {
              expect(status.byCategory[category]).toBe(categoryCounts[category]);
            }
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  }, 60000);

  /**
   * Property 20.7: Statistics are accurate after rebuild operations
   * 
   * For any set of submissions, after rebuild, the statistics should
   * accurately reflect all archived entities.
   */
  it('should have accurate statistics after rebuild operations', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(submissionWithVersioningArb, { minLength: 1, maxLength: 4 }),
        async (submissions) => {
          await cleanupDirectories();
          
          // Ensure unique IDs
          const uniqueSubmissions = submissions.filter(
            (s, i, arr) => arr.findIndex(x => x.id === s.id) === i
          );
          if (uniqueSubmissions.length === 0) return true;

          // Create submission files
          for (const submission of uniqueSubmissions) {
            await createSubmissionFile(submission);
          }

          const manager = createRegistryManager();
          await manager.rebuild(submissionsDir, buildDir);

          const status = manager.getStatus();
          
          // Calculate expected values
          const expectedTotal = uniqueSubmissions.length;
          const expectedCanon = uniqueSubmissions.filter(s => s.versioning?.canon === true).length;
          const expectedNonCanon = uniqueSubmissions.filter(s => !s.versioning?.canon).length;
          
          const expectedByCategory: Record<Category, number> = {
            character: 0,
            race: 0,
            creature: 0,
            flora: 0,
            location: 0,
            history: 0,
            faction: 0,
            artifact: 0,
            concept: 0,
          };
          for (const submission of uniqueSubmissions) {
            expectedByCategory[submission.template]++;
          }

          // Verify all statistics
          expect(status.totalCount).toBe(expectedTotal);
          expect(status.canonCount).toBe(expectedCanon);
          expect(status.nonCanonCount).toBe(expectedNonCanon);
          
          for (const category of CATEGORIES) {
            expect(status.byCategory[category]).toBe(expectedByCategory[category]);
          }

          // Also verify the invariants
          expect(status.totalCount).toBe(status.canonCount + status.nonCanonCount);
          
          const categorySum = CATEGORIES.reduce(
            (sum, category) => sum + status.byCategory[category],
            0
          );
          expect(status.totalCount).toBe(categorySum);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  }, 60000);

  /**
   * Property 20.8: Empty registry has zero counts
   * 
   * For an empty registry (no archived entities), all counts should be zero.
   */
  it('should have zero counts for empty registry', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(null), async () => {
        await cleanupDirectories();
        
        const manager = createRegistryManager();
        const status = manager.getStatus();
        
        expect(status.totalCount).toBe(0);
        expect(status.canonCount).toBe(0);
        expect(status.nonCanonCount).toBe(0);
        
        for (const category of CATEGORIES) {
          expect(status.byCategory[category]).toBe(0);
        }

        return true;
      }),
      { numRuns: 10 }
    );
  });

  /**
   * Property 20.9: Statistics are consistent after overwriting entities
   * 
   * For any entity that is overwritten (same ID, different data),
   * the statistics should not double-count the entity.
   */
  it('should not double-count entities when overwriting', async () => {
    await fc.assert(
      fc.asyncProperty(
        categoryArb,
        fc.stringMatching(/^[a-z0-9]{1,10}$/),
        bilingualNameArb,
        bilingualNameArb,
        versioningArb,
        versioningArb,
        async (category, idSuffix, name1, name2, versioning1, versioning2) => {
          await cleanupDirectories();
          
          // Ensure names are different
          fc.pre(name1.zh !== name2.zh);

          const id = `${category}-${idSuffix}`;
          const manager = createRegistryManager();

          // Archive first submission
          const submission1: Submission = {
            template: category,
            id,
            name: name1,
            versioning: versioning1,
          };
          await manager.archive(submission1, buildDir);

          // Archive second submission with same ID
          const submission2: Submission = {
            template: category,
            id,
            name: name2,
            versioning: versioning2,
          };
          await manager.archive(submission2, buildDir);

          const status = manager.getStatus();
          
          // Should only count as one entity
          expect(status.totalCount).toBe(1);
          expect(status.byCategory[category]).toBe(1);
          
          // Canon/non-canon should reflect the latest versioning
          if (versioning2.canon) {
            expect(status.canonCount).toBe(1);
            expect(status.nonCanonCount).toBe(0);
          } else {
            expect(status.canonCount).toBe(0);
            expect(status.nonCanonCount).toBe(1);
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 20.10: Statistics support all 9 categories
   * 
   * For any of the 9 categories, archiving entities should correctly
   * update the byCategory count for that specific category.
   */
  it('should correctly track all 9 categories in statistics', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...CATEGORIES),
        fc.array(fc.stringMatching(/^[a-z0-9]{1,10}$/), { minLength: 1, maxLength: 3 }),
        async (category, idSuffixes) => {
          await cleanupDirectories();
          
          // Ensure unique suffixes
          const uniqueSuffixes = [...new Set(idSuffixes)];
          if (uniqueSuffixes.length === 0) return true;

          const manager = createRegistryManager();
          
          // Archive multiple entities in the same category
          for (const suffix of uniqueSuffixes) {
            const submission: Submission = {
              template: category,
              id: `${category}-${suffix}`,
              name: { zh: `测试${suffix}` },
            };
            await manager.archive(submission, buildDir);
          }

          const status = manager.getStatus();
          
          // Verify the specific category count
          expect(status.byCategory[category]).toBe(uniqueSuffixes.length);
          
          // Verify other categories are zero
          for (const otherCategory of CATEGORIES) {
            if (otherCategory !== category) {
              expect(status.byCategory[otherCategory]).toBe(0);
            }
          }
          
          // Verify total count
          expect(status.totalCount).toBe(uniqueSuffixes.length);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 20.11: Mixed canon and non-canon submissions are counted correctly
   * 
   * For any mix of canon and non-canon submissions, the canonCount and
   * nonCanonCount should accurately reflect the distribution.
   */
  it('should correctly count mixed canon and non-canon submissions', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.tuple(
            categoryArb,
            fc.stringMatching(/^[a-z0-9]{1,10}$/),
            fc.boolean()
          ),
          { minLength: 2, maxLength: 5 }
        ),
        async (submissionData) => {
          await cleanupDirectories();
          
          // Create submissions with explicit canon values
          const submissions: Submission[] = submissionData.map(([category, suffix, isCanon]) => ({
            template: category,
            id: `${category}-${suffix}`,
            name: { zh: `测试${suffix}` },
            versioning: {
              canon: isCanon,
              source: 'author-test',
              priority: 'official' as Priority,
            },
          }));

          // Ensure unique IDs
          const uniqueSubmissions = submissions.filter(
            (s, i, arr) => arr.findIndex(x => x.id === s.id) === i
          );
          if (uniqueSubmissions.length < 2) return true;

          const manager = createRegistryManager();
          
          for (const submission of uniqueSubmissions) {
            await manager.archive(submission, buildDir);
          }

          const status = manager.getStatus();
          
          // Calculate expected counts
          const expectedCanon = uniqueSubmissions.filter(s => s.versioning?.canon === true).length;
          const expectedNonCanon = uniqueSubmissions.filter(s => s.versioning?.canon === false).length;

          expect(status.canonCount).toBe(expectedCanon);
          expect(status.nonCanonCount).toBe(expectedNonCanon);
          expect(status.totalCount).toBe(expectedCanon + expectedNonCanon);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 20.12: Statistics are accurate after loading registry
   * 
   * For any set of archived submissions, after loading the registry
   * with a new manager, the statistics should match the original.
   */
  it('should have accurate statistics after loading registry', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(submissionWithVersioningArb, { minLength: 1, maxLength: 3 }),
        async (submissions) => {
          await cleanupDirectories();
          
          // Ensure unique IDs
          const uniqueSubmissions = submissions.filter(
            (s, i, arr) => arr.findIndex(x => x.id === s.id) === i
          );
          if (uniqueSubmissions.length === 0) return true;

          // Archive with first manager
          const manager1 = createRegistryManager();
          for (const submission of uniqueSubmissions) {
            await manager1.archive(submission, buildDir);
          }
          await manager1.updateIndex(buildDir);
          
          const originalStatus = manager1.getStatus();

          // Load with new manager
          const manager2 = createRegistryManager();
          await manager2.loadRegistry(buildDir);
          
          const loadedStatus = manager2.getStatus();

          // Verify statistics match
          expect(loadedStatus.totalCount).toBe(originalStatus.totalCount);
          expect(loadedStatus.canonCount).toBe(originalStatus.canonCount);
          expect(loadedStatus.nonCanonCount).toBe(originalStatus.nonCanonCount);
          
          for (const category of CATEGORIES) {
            expect(loadedStatus.byCategory[category]).toBe(originalStatus.byCategory[category]);
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

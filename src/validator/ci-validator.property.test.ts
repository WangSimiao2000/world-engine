/**
 * CI Validator Property-Based Tests
 * CI 验证器属性测试
 * 
 * Feature: initialize, Property 13: CI 验证结果一致性
 * **Validates: Requirements 5.3, 5.4**
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  createCIValidator,
  validateSubmissions,
  type CIValidationOptions,
  type CIValidationResult,
} from './ci-validator.js';
import type { Registry, EpochIndex, Category } from '../types/index.js';
import { ErrorCodes } from '../types/index.js';

// ============================================================================
// Test Fixtures and Helpers
// ============================================================================

let tempDir: string;
let submissionsDir: string;
let templatesDir: string;
let buildDir: string;

/**
 * Create temporary test directories
 */
async function setupTestDirs(): Promise<void> {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ci-validator-prop-test-'));
  submissionsDir = path.join(tempDir, 'submissions');
  templatesDir = path.join(tempDir, 'templates');
  buildDir = path.join(tempDir, '_build');

  await fs.mkdir(submissionsDir, { recursive: true });
  await fs.mkdir(path.join(submissionsDir, 'character'), { recursive: true });
  await fs.mkdir(path.join(submissionsDir, 'race'), { recursive: true });
  await fs.mkdir(templatesDir, { recursive: true });
  await fs.mkdir(buildDir, { recursive: true });

  // Create basic templates
  await createCharacterTemplate();
  await createRaceTemplate();
}

/**
 * Clean up temporary directories
 */
async function cleanupTestDirs(): Promise<void> {
  if (tempDir) {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

/**
 * Create character template
 */
async function createCharacterTemplate(): Promise<void> {
  const template = `
category: character
description:
  zh: 人物设定模板
  en: Character template
required:
  - name: id
    type: string
    description:
      zh: 唯一标识符
  - name: name
    type: bilingual
    description:
      zh: 角色名称
  - name: race
    type: entity_ref
    description:
      zh: 所属种族
  - name: birth_epoch
    type: epoch_ref
    description:
      zh: 出生纪元
  - name: birth_year
    type: integer
    description:
      zh: 出生年份
  - name: lifespan
    type: integer
    description:
      zh: 寿命
optional:
  - name: description
    type: bilingual
    description:
      zh: 角色描述
`;
  await fs.writeFile(path.join(templatesDir, 'character.yaml'), template);
}

/**
 * Create race template
 */
async function createRaceTemplate(): Promise<void> {
  const template = `
category: race
description:
  zh: 种族设定模板
  en: Race template
required:
  - name: id
    type: string
    description:
      zh: 唯一标识符
  - name: name
    type: bilingual
    description:
      zh: 种族名称
  - name: average_lifespan
    type: integer
    description:
      zh: 平均寿命
optional:
  - name: description
    type: bilingual
    description:
      zh: 种族描述
`;
  await fs.writeFile(path.join(templatesDir, 'race.yaml'), template);
}

/**
 * Create empty registry
 */
function createEmptyRegistry(): Registry {
  return {
    entities: new Map(),
    index: {
      entries: [],
      lastUpdated: new Date().toISOString(),
    },
  };
}

/**
 * Create epoch index
 */
function createEpochIndex(): EpochIndex {
  return {
    epochs: [
      { id: 'epoch-01', name: { zh: '混沌纪元' }, order: 1, duration: 10000 },
      { id: 'epoch-02', name: { zh: '神荒纪元' }, order: 2, duration: 5000 },
    ],
  };
}

// ============================================================================
// Arbitraries (Test Data Generators)
// ============================================================================

/**
 * Generate a valid file name segment
 */
const fileNameSegmentArb = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'),
  { minLength: 3, maxLength: 15 }
).filter((s) => /^[a-z][a-z0-9]*$/.test(s));

/**
 * Generate a file name starting with underscore (skipped files)
 */
const skippedFileNameArb = fc.tuple(fileNameSegmentArb)
  .map(([name]) => `_${name}.yaml`);

/**
 * Generate a regular file name (not starting with underscore)
 */
const regularFileNameArb = fc.tuple(fileNameSegmentArb)
  .map(([name]) => `${name}.yaml`);

/**
 * Generate a valid race submission YAML content
 */
const validRaceYamlArb = fc.tuple(
  fileNameSegmentArb,
  fc.integer({ min: 50, max: 500 })
).map(([id, lifespan]) => `
template: race
id: race-${id}
name:
  zh: 测试种族${id}
average_lifespan: ${lifespan}
`);

/**
 * Generate an invalid YAML content (missing required fields)
 */
const invalidRaceYamlArb = fc.tuple(fileNameSegmentArb)
  .map(([id]) => `
template: race
id: race-${id}
name:
  zh: 缺少必填项的种族
`);

/**
 * Generate a protected path (in _build/ directory)
 */
const protectedPathArb = fc.tuple(fileNameSegmentArb)
  .map(([name]) => `_build/${name}.yaml`);

/**
 * Generate a non-YAML file path
 */
const nonYamlPathArb = fc.tuple(fileNameSegmentArb, fc.constantFrom('.md', '.txt', '.json'))
  .map(([name, ext]) => `submissions/race/${name}${ext}`);

// ============================================================================
// Property Tests
// ============================================================================

describe('Feature: initialize, Property 13: CI 验证结果一致性', () => {
  beforeEach(async () => {
    await setupTestDirs();
  });

  afterEach(async () => {
    await cleanupTestDirs();
  });

  /**
   * Property 13.1: Validation result is deterministic
   * 
   * For any given set of input files, running validation multiple times
   * should produce identical results.
   */
  it('should produce deterministic results for the same input', async () => {
    await fc.assert(
      fc.asyncProperty(
        validRaceYamlArb,
        async (yamlContent) => {
          const filePath = path.join(submissionsDir, 'race', 'race-test.yaml');
          await fs.writeFile(filePath, yamlContent);

          const options: CIValidationOptions = {
            changedFiles: [filePath],
            submissionsDir,
            templatesDir,
            buildDir,
          };

          // Run validation multiple times
          const result1 = await validateSubmissions(options);
          const result2 = await validateSubmissions(options);
          const result3 = await validateSubmissions(options);

          // All results should be identical
          expect(result1.valid).toBe(result2.valid);
          expect(result2.valid).toBe(result3.valid);
          expect(result1.totalFiles).toBe(result2.totalFiles);
          expect(result2.totalFiles).toBe(result3.totalFiles);
          expect(result1.validatedFiles).toBe(result2.validatedFiles);
          expect(result2.validatedFiles).toBe(result3.validatedFiles);
          expect(result1.skippedFiles).toBe(result2.skippedFiles);
          expect(result2.skippedFiles).toBe(result3.skippedFiles);
          expect(result1.errors.length).toBe(result2.errors.length);
          expect(result2.errors.length).toBe(result3.errors.length);
          expect(result1.warnings.length).toBe(result2.warnings.length);
          expect(result2.warnings.length).toBe(result3.warnings.length);

          // Clean up
          await fs.unlink(filePath);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 13.2: totalFiles = validatedFiles + skippedFiles
   * 
   * For any validation result, the total number of files should equal
   * the sum of validated files and skipped files.
   */
  it('should satisfy totalFiles = validatedFiles + skippedFiles', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.boolean(), { minLength: 1, maxLength: 5 }),
        async (fileTypes) => {
          const filePaths: string[] = [];
          
          // Create files based on the boolean array (true = skipped, false = regular)
          for (let i = 0; i < fileTypes.length; i++) {
            const isSkipped = fileTypes[i];
            const fileName = isSkipped ? `_test${i}.yaml` : `test${i}.yaml`;
            const filePath = path.join(submissionsDir, 'race', fileName);
            
            await fs.writeFile(filePath, `
template: race
id: race-test${i}
name:
  zh: 测试种族${i}
average_lifespan: 100
`);
            filePaths.push(filePath);
          }

          const options: CIValidationOptions = {
            changedFiles: filePaths,
            submissionsDir,
            templatesDir,
            buildDir,
          };

          const result = await validateSubmissions(options);

          // Property: totalFiles = validatedFiles + skippedFiles
          expect(result.totalFiles).toBe(result.validatedFiles + result.skippedFiles);

          // Clean up
          for (const filePath of filePaths) {
            await fs.unlink(filePath);
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 13.3: valid = (errors.length === 0)
   * 
   * The validation result's valid flag should be true if and only if
   * there are no errors.
   */
  it('should have valid = (errors.length === 0)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.boolean(),
        async (useValidYaml) => {
          const filePath = path.join(submissionsDir, 'race', 'race-validity-test.yaml');
          
          if (useValidYaml) {
            await fs.writeFile(filePath, `
template: race
id: race-validity-test
name:
  zh: 有效种族
average_lifespan: 100
`);
          } else {
            // Missing required field average_lifespan
            await fs.writeFile(filePath, `
template: race
id: race-validity-test
name:
  zh: 无效种族
`);
          }

          const options: CIValidationOptions = {
            changedFiles: [filePath],
            submissionsDir,
            templatesDir,
            buildDir,
          };

          const result = await validateSubmissions(options);

          // Property: valid = (errors.length === 0)
          expect(result.valid).toBe(result.errors.length === 0);

          // Clean up
          await fs.unlink(filePath);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 13.4: Files starting with _ are always skipped
   * 
   * For any file whose name starts with underscore, it should be counted
   * as skipped and not validated.
   */
  it('should always skip files starting with underscore', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(skippedFileNameArb, { minLength: 1, maxLength: 5 }),
        async (skippedFileNames) => {
          const filePaths: string[] = [];
          
          for (const fileName of skippedFileNames) {
            const filePath = path.join(submissionsDir, 'race', fileName);
            // Even invalid content should be skipped
            await fs.writeFile(filePath, `
template: race
id: invalid
`);
            filePaths.push(filePath);
          }

          const options: CIValidationOptions = {
            changedFiles: filePaths,
            submissionsDir,
            templatesDir,
            buildDir,
          };

          const result = await validateSubmissions(options);

          // All files should be skipped
          expect(result.skippedFiles).toBe(skippedFileNames.length);
          expect(result.validatedFiles).toBe(0);
          // Skipped files don't produce errors
          expect(result.valid).toBe(true);
          expect(result.errors.length).toBe(0);

          // Clean up
          for (const filePath of filePaths) {
            await fs.unlink(filePath);
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 13.5: Output protection errors cause early return with validatedFiles = 0
   * 
   * When output protection check fails (files in _build/ are modified),
   * the validation should return immediately with validatedFiles = 0.
   */
  it('should return early with validatedFiles = 0 when output protection fails', async () => {
    await fc.assert(
      fc.asyncProperty(
        protectedPathArb,
        fc.array(regularFileNameArb, { minLength: 0, maxLength: 3 }),
        async (protectedPath, regularFileNames) => {
          // Create regular submission files
          const regularPaths: string[] = [];
          for (const fileName of regularFileNames) {
            const filePath = path.join(submissionsDir, 'race', fileName);
            await fs.writeFile(filePath, `
template: race
id: race-${fileName.replace('.yaml', '')}
name:
  zh: 测试种族
average_lifespan: 100
`);
            regularPaths.push(filePath);
          }

          const options: CIValidationOptions = {
            changedFiles: [protectedPath, ...regularPaths],
            submissionsDir,
            templatesDir,
            buildDir,
          };

          const result = await validateSubmissions(options);

          // Output protection failure should cause early return
          expect(result.valid).toBe(false);
          expect(result.validatedFiles).toBe(0);
          expect(result.skippedFiles).toBe(0);
          expect(result.errors.length).toBe(1);
          expect(result.errors[0].code).toBe(ErrorCodes.OUTPUT_MODIFIED);

          // Clean up
          for (const filePath of regularPaths) {
            await fs.unlink(filePath);
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 13.6: All errors have valid error codes
   * 
   * Every error in the validation result should have a non-empty error code
   * that matches one of the defined error codes.
   */
  it('should have valid error codes for all errors', async () => {
    const validErrorCodes = Object.values(ErrorCodes);

    await fc.assert(
      fc.asyncProperty(
        invalidRaceYamlArb,
        async (yamlContent) => {
          const filePath = path.join(submissionsDir, 'race', 'race-error-test.yaml');
          await fs.writeFile(filePath, yamlContent);

          const options: CIValidationOptions = {
            changedFiles: [filePath],
            submissionsDir,
            templatesDir,
            buildDir,
          };

          const result = await validateSubmissions(options);

          // All errors should have valid error codes
          for (const error of result.errors) {
            expect(error.code).toBeDefined();
            expect(error.code.length).toBeGreaterThan(0);
            expect(error.code.startsWith('ERR_')).toBe(true);
          }

          // Clean up
          await fs.unlink(filePath);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 13.7: All errors have bilingual messages
   * 
   * Every error in the validation result should have both Chinese (zh)
   * and English (en) error messages.
   */
  it('should have bilingual messages for all errors', async () => {
    await fc.assert(
      fc.asyncProperty(
        invalidRaceYamlArb,
        async (yamlContent) => {
          const filePath = path.join(submissionsDir, 'race', 'race-bilingual-test.yaml');
          await fs.writeFile(filePath, yamlContent);

          const options: CIValidationOptions = {
            changedFiles: [filePath],
            submissionsDir,
            templatesDir,
            buildDir,
          };

          const result = await validateSubmissions(options);

          // All errors should have bilingual messages
          for (const error of result.errors) {
            expect(error.message).toBeDefined();
            expect(error.message.zh).toBeDefined();
            expect(error.message.zh.length).toBeGreaterThan(0);
            expect(error.message.en).toBeDefined();
            expect(error.message.en.length).toBeGreaterThan(0);
          }

          // Clean up
          await fs.unlink(filePath);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 13.8: Empty file list produces valid result with zero counts
   * 
   * When no files are provided for validation, the result should be valid
   * with all counts at zero.
   */
  it('should handle empty file list correctly', async () => {
    const options: CIValidationOptions = {
      changedFiles: [],
      submissionsDir,
      templatesDir,
      buildDir,
    };

    const result = await validateSubmissions(options);

    expect(result.valid).toBe(true);
    expect(result.totalFiles).toBe(0);
    expect(result.validatedFiles).toBe(0);
    expect(result.skippedFiles).toBe(0);
    expect(result.errors.length).toBe(0);
    expect(result.warnings.length).toBe(0);
  });

  /**
   * Property 13.9: Non-YAML files are filtered out
   * 
   * Files that are not YAML files (.yaml or .yml) should not be counted
   * in totalFiles.
   */
  it('should filter out non-YAML files', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(nonYamlPathArb, { minLength: 1, maxLength: 5 }),
        async (nonYamlPaths) => {
          const options: CIValidationOptions = {
            changedFiles: nonYamlPaths,
            submissionsDir,
            templatesDir,
            buildDir,
          };

          const result = await validateSubmissions(options);

          // Non-YAML files should be filtered out
          expect(result.totalFiles).toBe(0);
          expect(result.validatedFiles).toBe(0);
          expect(result.skippedFiles).toBe(0);
          expect(result.valid).toBe(true);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 13.10: Files outside submissions directory are filtered out
   * 
   * Files that are not in the submissions directory should not be counted
   * in totalFiles.
   */
  it('should filter out files outside submissions directory', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fileNameSegmentArb, { minLength: 1, maxLength: 5 }),
        async (fileNames) => {
          const outsidePaths = fileNames.map(name => `other/${name}.yaml`);

          const options: CIValidationOptions = {
            changedFiles: outsidePaths,
            submissionsDir,
            templatesDir,
            buildDir,
          };

          const result = await validateSubmissions(options);

          // Files outside submissions should be filtered out
          expect(result.totalFiles).toBe(0);
          expect(result.validatedFiles).toBe(0);
          expect(result.skippedFiles).toBe(0);
          expect(result.valid).toBe(true);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 13.11: CI status reflects validation result
   * 
   * If any hard error is produced, CI status (valid) should be false.
   * If no errors are produced, CI status should be true.
   * This validates Requirements 5.3 and 5.4.
   */
  it('should set CI status based on error presence', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.boolean(), { minLength: 1, maxLength: 5 }),
        async (validFlags) => {
          const filePaths: string[] = [];
          
          for (let i = 0; i < validFlags.length; i++) {
            const isValid = validFlags[i];
            const fileName = `test${i}.yaml`;
            const filePath = path.join(submissionsDir, 'race', fileName);
            
            if (isValid) {
              await fs.writeFile(filePath, `
template: race
id: race-test${i}
name:
  zh: 有效种族${i}
average_lifespan: 100
`);
            } else {
              // Missing required field
              await fs.writeFile(filePath, `
template: race
id: race-test${i}
name:
  zh: 无效种族${i}
`);
            }
            filePaths.push(filePath);
          }

          const options: CIValidationOptions = {
            changedFiles: filePaths,
            submissionsDir,
            templatesDir,
            buildDir,
          };

          const result = await validateSubmissions(options);

          // CI status should reflect error presence
          const hasInvalidFiles = validFlags.some(v => !v);
          if (hasInvalidFiles) {
            expect(result.valid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
          } else {
            expect(result.valid).toBe(true);
            expect(result.errors.length).toBe(0);
          }

          // Clean up
          for (const filePath of filePaths) {
            await fs.unlink(filePath);
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 13.12: Validation order does not affect final result validity
   * 
   * The order of files in the changedFiles array should not affect
   * whether the overall validation passes or fails.
   */
  it('should produce consistent validity regardless of file order', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.boolean(), { minLength: 2, maxLength: 5 }),
        async (validFlags) => {
          const filePaths: string[] = [];
          
          for (let i = 0; i < validFlags.length; i++) {
            const isValid = validFlags[i];
            const fileName = `order${i}.yaml`;
            const filePath = path.join(submissionsDir, 'race', fileName);
            
            if (isValid) {
              await fs.writeFile(filePath, `
template: race
id: race-order${i}
name:
  zh: 种族${i}
average_lifespan: 100
`);
            } else {
              await fs.writeFile(filePath, `
template: race
id: race-order${i}
name:
  zh: 种族${i}
`);
            }
            filePaths.push(filePath);
          }

          // Test with original order
          const options1: CIValidationOptions = {
            changedFiles: [...filePaths],
            submissionsDir,
            templatesDir,
            buildDir,
          };
          const result1 = await validateSubmissions(options1);

          // Test with reversed order
          const options2: CIValidationOptions = {
            changedFiles: [...filePaths].reverse(),
            submissionsDir,
            templatesDir,
            buildDir,
          };
          const result2 = await validateSubmissions(options2);

          // Validity should be the same regardless of order
          expect(result1.valid).toBe(result2.valid);
          expect(result1.totalFiles).toBe(result2.totalFiles);
          expect(result1.validatedFiles).toBe(result2.validatedFiles);
          expect(result1.errors.length).toBe(result2.errors.length);

          // Clean up
          for (const filePath of filePaths) {
            await fs.unlink(filePath);
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 13.13: All errors have valid location information
   * 
   * Every error should have a location with a non-empty file path.
   */
  it('should have valid location information for all errors', async () => {
    await fc.assert(
      fc.asyncProperty(
        invalidRaceYamlArb,
        async (yamlContent) => {
          const filePath = path.join(submissionsDir, 'race', 'race-location-test.yaml');
          await fs.writeFile(filePath, yamlContent);

          const options: CIValidationOptions = {
            changedFiles: [filePath],
            submissionsDir,
            templatesDir,
            buildDir,
          };

          const result = await validateSubmissions(options);

          // All errors should have valid location
          for (const error of result.errors) {
            expect(error.location).toBeDefined();
            expect(error.location.file).toBeDefined();
            expect(error.location.file.length).toBeGreaterThan(0);
            expect(typeof error.location.field).toBe('string');
          }

          // Clean up
          await fs.unlink(filePath);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

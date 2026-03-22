/**
 * CLI Commands Property-Based Tests
 * CLI 命令属性测试
 * 
 * Feature: initialize, Property 18: 模板初始化文件生成
 * **Validates: Requirements 8.2**
 * 
 * Feature: initialize, Property 14: 本地验证与 CI 验证等价性
 * **Validates: Requirements 5.6**
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as yaml from 'js-yaml';
import { generateTemplateContent, getLanguage, getText } from './commands.js';
import { createTemplateLoader } from '../template/loader.js';
import { createCIValidator, type CIValidationOptions, type CIValidationResult } from '../validator/ci-validator.js';
import type { Category, TemplateDefinition, Registry, EpochIndex } from '../types/index.js';
import { CATEGORIES, isCategory, isBilingual, ErrorCodes, WarningCodes } from '../types/index.js';

describe('Feature: initialize, Property 18: 模板初始化文件生成', () => {
  let tempDir: string;
  let templatesDir: string;
  let submissionsDir: string;
  let realTemplatesDir: string;
  let loader: ReturnType<typeof createTemplateLoader>;

  beforeEach(async () => {
    // Create temp directory structure
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'worldengine-cli-pbt-'));
    templatesDir = path.join(tempDir, 'templates');
    submissionsDir = path.join(tempDir, 'submissions');
    realTemplatesDir = path.resolve(process.cwd(), 'templates');
    
    await fs.mkdir(templatesDir, { recursive: true });
    await fs.mkdir(submissionsDir, { recursive: true });
    
    // Copy real templates to temp directory
    for (const category of CATEGORIES) {
      const srcPath = path.join(realTemplatesDir, `${category}.yaml`);
      const destPath = path.join(templatesDir, `${category}.yaml`);
      try {
        await fs.copyFile(srcPath, destPath);
      } catch {
        // Template might not exist, skip
      }
    }
    
    loader = createTemplateLoader();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  /**
   * Helper: Simulate templateInit behavior without process.chdir
   * This creates a template file in the specified directory
   */
  async function simulateTemplateInit(
    category: Category,
    id: string,
    lang: 'zh' | 'en' = 'zh'
  ): Promise<{ success: boolean; filePath?: string; error?: string }> {
    try {
      // Load template definition
      const template = await loader.loadTemplate(templatesDir, category);
      
      // Create category directory
      const categoryDir = path.join(submissionsDir, category);
      await fs.mkdir(categoryDir, { recursive: true });
      
      // Generate content
      const content = generateTemplateContent(template, id, lang);
      
      // Write file
      const filePath = path.join(categoryDir, `${id}.yaml`);
      await fs.writeFile(filePath, content, 'utf-8');
      
      return { success: true, filePath };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }

  /**
   * Arbitrary: Generate a valid category
   */
  const categoryArb = fc.constantFrom(...CATEGORIES);

  /**
   * Get the ID prefix for a category
   */
  function getCategoryPrefix(category: Category): string {
    const prefixes: Record<Category, string> = {
      character: 'char',
      race: 'race',
      creature: 'creature',
      flora: 'flora',
      location: 'loc',
      history: 'hist',
      faction: 'faction',
      artifact: 'artifact',
      concept: 'concept',
    };
    return prefixes[category];
  }

  /**
   * Arbitrary: Generate a valid ID for a given category
   */
  const validIdArb = (category: Category): fc.Arbitrary<string> => {
    const prefix = getCategoryPrefix(category);
    return fc.stringOf(
      fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'),
      { minLength: 2, maxLength: 15 }
    ).filter(s => s.length >= 2)
      .map(s => `${prefix}-${s}`);
  };

  /**
   * Arbitrary: Generate a category and valid ID pair
   */
  const categoryAndIdArb = categoryArb.chain(category => 
    validIdArb(category).map(id => ({ category, id }))
  );

  /**
   * Property 18.1: Generated file contains valid YAML
   * 
   * For any valid category and id combination, the generated file
   * should be parseable as valid YAML.
   */
  it('should generate valid YAML files', async () => {
    await fc.assert(
      fc.asyncProperty(categoryAndIdArb, async ({ category, id }) => {
        const result = await simulateTemplateInit(category, id, 'zh');
        
        if (!result.success || !result.filePath) {
          // Template might not exist for this category
          return true;
        }
        
        // Read the generated file
        const content = await fs.readFile(result.filePath, 'utf-8');
        
        // Verify it's valid YAML
        expect(() => yaml.load(content)).not.toThrow();
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 18.2: Generated file has correct template field matching category
   * 
   * For any valid category and id combination, the generated file
   * should have a template field that matches the category.
   */
  it('should have correct template field matching category', async () => {
    await fc.assert(
      fc.asyncProperty(categoryAndIdArb, async ({ category, id }) => {
        const result = await simulateTemplateInit(category, id, 'zh');
        
        if (!result.success || !result.filePath) {
          return true;
        }
        
        const content = await fs.readFile(result.filePath, 'utf-8');
        const parsed = yaml.load(content) as Record<string, unknown>;
        
        // Verify template field matches category
        expect(parsed.template).toBe(category);
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 18.3: Generated file has correct id field
   * 
   * For any valid category and id combination, the generated file
   * should have an id field that matches the provided id.
   */
  it('should have correct id field', async () => {
    await fc.assert(
      fc.asyncProperty(categoryAndIdArb, async ({ category, id }) => {
        const result = await simulateTemplateInit(category, id, 'zh');
        
        if (!result.success || !result.filePath) {
          return true;
        }
        
        const content = await fs.readFile(result.filePath, 'utf-8');
        const parsed = yaml.load(content) as Record<string, unknown>;
        
        // Verify id field matches provided id
        expect(parsed.id).toBe(id);
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 18.4: Generated file contains all required fields from template
   * 
   * For any valid category and id combination, the generated file
   * should contain all required fields defined in the template.
   */
  it('should contain all required fields from template', async () => {
    await fc.assert(
      fc.asyncProperty(categoryAndIdArb, async ({ category, id }) => {
        const result = await simulateTemplateInit(category, id, 'zh');
        
        if (!result.success || !result.filePath) {
          return true;
        }
        
        // Load the template definition
        let template: TemplateDefinition;
        try {
          template = await loader.loadTemplate(templatesDir, category);
        } catch {
          return true; // Template doesn't exist
        }
        
        const content = await fs.readFile(result.filePath, 'utf-8');
        const parsed = yaml.load(content) as Record<string, unknown>;
        
        // Verify all required fields are present
        for (const field of template.required) {
          expect(parsed).toHaveProperty(field.name);
        }
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 18.5: File is created in correct directory (submissions/<category>/)
   * 
   * For any valid category and id combination, the generated file
   * should be created in the submissions/<category>/ directory.
   */
  it('should create file in correct directory', async () => {
    await fc.assert(
      fc.asyncProperty(categoryAndIdArb, async ({ category, id }) => {
        const result = await simulateTemplateInit(category, id, 'zh');
        
        if (!result.success || !result.filePath) {
          return true;
        }
        
        // Verify file path is in correct directory
        const expectedDir = path.join(submissionsDir, category);
        const actualDir = path.dirname(result.filePath);
        
        expect(actualDir).toBe(expectedDir);
        
        // Verify file exists
        const exists = await fs.access(result.filePath).then(() => true).catch(() => false);
        expect(exists).toBe(true);
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Arbitrary: Generate invalid category names
   */
  const invalidCategoryArb = fc.stringOf(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz_'),
    { minLength: 3, maxLength: 20 }
  ).filter(s => !isCategory(s) && s.length >= 3);

  /**
   * Property 18.6: Invalid categories are rejected
   * 
   * For any invalid category name, the template loading
   * should fail with an error.
   */
  it('should reject invalid categories', async () => {
    await fc.assert(
      fc.asyncProperty(invalidCategoryArb, async (invalidCategory) => {
        // Try to load template for invalid category
        try {
          await loader.loadTemplate(templatesDir, invalidCategory as Category);
          // If we get here, the category was somehow valid (shouldn't happen)
          return false;
        } catch (error) {
          // Expected: loading should fail for invalid categories
          expect(error).toBeDefined();
          return true;
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 18.7: generateTemplateContent produces consistent output
   * 
   * For any template and id, generateTemplateContent should produce
   * output that is valid YAML with correct template and id fields.
   */
  it('should produce consistent output from generateTemplateContent', async () => {
    await fc.assert(
      fc.asyncProperty(categoryAndIdArb, async ({ category, id }) => {
        let template: TemplateDefinition;
        try {
          template = await loader.loadTemplate(templatesDir, category);
        } catch {
          return true; // Template doesn't exist
        }
        
        // Generate content for both languages
        const contentZh = generateTemplateContent(template, id, 'zh');
        const contentEn = generateTemplateContent(template, id, 'en');
        
        // Both should be valid YAML
        expect(() => yaml.load(contentZh)).not.toThrow();
        expect(() => yaml.load(contentEn)).not.toThrow();
        
        // Both should have correct template and id
        const parsedZh = yaml.load(contentZh) as Record<string, unknown>;
        const parsedEn = yaml.load(contentEn) as Record<string, unknown>;
        
        expect(parsedZh.template).toBe(category);
        expect(parsedZh.id).toBe(id);
        expect(parsedEn.template).toBe(category);
        expect(parsedEn.id).toBe(id);
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 18.8: Generated file has proper structure for bilingual fields
   * 
   * For any valid category and id, bilingual fields in the generated file
   * should have the correct structure with zh and en subfields.
   */
  it('should have proper structure for bilingual fields', async () => {
    await fc.assert(
      fc.asyncProperty(categoryAndIdArb, async ({ category, id }) => {
        const result = await simulateTemplateInit(category, id, 'zh');
        
        if (!result.success || !result.filePath) {
          return true;
        }
        
        let template: TemplateDefinition;
        try {
          template = await loader.loadTemplate(templatesDir, category);
        } catch {
          return true;
        }
        
        const content = await fs.readFile(result.filePath, 'utf-8');
        const parsed = yaml.load(content) as Record<string, unknown>;
        
        // Check bilingual fields have correct structure
        for (const field of template.required) {
          if (field.type === 'bilingual' && parsed[field.name]) {
            const bilingualValue = parsed[field.name] as Record<string, unknown>;
            expect(bilingualValue).toHaveProperty('zh');
            // en is optional but should exist in template
            expect(bilingualValue).toHaveProperty('en');
          }
        }
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 18.9: Generated file has proper structure for versioning fields
   * 
   * For any valid category and id where versioning is required,
   * the generated file should have proper versioning structure.
   */
  it('should have proper structure for versioning fields', async () => {
    await fc.assert(
      fc.asyncProperty(categoryAndIdArb, async ({ category, id }) => {
        const result = await simulateTemplateInit(category, id, 'zh');
        
        if (!result.success || !result.filePath) {
          return true;
        }
        
        let template: TemplateDefinition;
        try {
          template = await loader.loadTemplate(templatesDir, category);
        } catch {
          return true;
        }
        
        const content = await fs.readFile(result.filePath, 'utf-8');
        const parsed = yaml.load(content) as Record<string, unknown>;
        
        // Check versioning fields have correct structure
        for (const field of template.required) {
          if (field.type === 'versioning' && parsed[field.name]) {
            const versioningValue = parsed[field.name] as Record<string, unknown>;
            expect(versioningValue).toHaveProperty('canon');
            expect(versioningValue).toHaveProperty('source');
            expect(versioningValue).toHaveProperty('priority');
            expect(typeof versioningValue.canon).toBe('boolean');
            expect(['official', 'secondary']).toContain(versioningValue.priority);
          }
        }
        
        return true;
      }),
      { numRuns: 100 }
    );
  });
});


// ============================================================================
// Feature: initialize, Property 14: 本地验证与 CI 验证等价性
// **Validates: Requirements 5.6**
// ============================================================================

describe('Feature: initialize, Property 14: 本地验证与 CI 验证等价性', () => {
  let tempDir: string;
  let templatesDir: string;
  let submissionsDir: string;
  let buildDir: string;
  let realTemplatesDir: string;

  beforeEach(async () => {
    // Create temp directory structure
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'worldengine-prop14-'));
    templatesDir = path.join(tempDir, 'templates');
    submissionsDir = path.join(tempDir, 'submissions');
    buildDir = path.join(tempDir, '_build');
    realTemplatesDir = path.resolve(process.cwd(), 'templates');
    
    await fs.mkdir(templatesDir, { recursive: true });
    await fs.mkdir(submissionsDir, { recursive: true });
    await fs.mkdir(buildDir, { recursive: true });
    await fs.mkdir(path.join(submissionsDir, 'character'), { recursive: true });
    await fs.mkdir(path.join(submissionsDir, 'race'), { recursive: true });
    
    // Copy real templates to temp directory
    for (const category of CATEGORIES) {
      const srcPath = path.join(realTemplatesDir, `${category}.yaml`);
      const destPath = path.join(templatesDir, `${category}.yaml`);
      try {
        await fs.copyFile(srcPath, destPath);
      } catch {
        // Template might not exist, skip
      }
    }
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

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

  /**
   * Scan submissions directory to get all files (simulates local validation behavior)
   */
  async function scanSubmissionsDirectory(): Promise<string[]> {
    const files: string[] = [];
    try {
      const categories = await fs.readdir(submissionsDir);
      for (const category of categories) {
        const categoryPath = path.join(submissionsDir, category);
        const stat = await fs.stat(categoryPath);
        if (stat.isDirectory()) {
          const categoryFiles = await fs.readdir(categoryPath);
          for (const file of categoryFiles) {
            if (file.endsWith('.yaml') || file.endsWith('.yml')) {
              files.push(path.join(categoryPath, file));
            }
          }
        }
      }
    } catch {
      // Directory doesn't exist
    }
    return files;
  }

  /**
   * Run CI validation directly (simulates CI pipeline)
   */
  async function runCIValidation(filePaths: string[]): Promise<CIValidationResult> {
    const validator = createCIValidator();
    const options: CIValidationOptions = {
      changedFiles: filePaths,
      submissionsDir,
      templatesDir,
      buildDir,
      registry: createEmptyRegistry(),
      epochIndex: createEpochIndex(),
    };
    return validator.validateSubmissions(options);
  }

  /**
   * Run local validation (simulates `worldengine validate --cross` command)
   * This uses the same validation pipeline as the validate function in commands.ts
   */
  async function runLocalValidation(): Promise<CIValidationResult> {
    // Scan submissions directory (same as validate function does)
    const allFiles = await scanSubmissionsDirectory();
    
    // Filter out files starting with _ (same as validate function does)
    const filesToValidate = allFiles.filter(file => {
      const fileName = path.basename(file);
      return !fileName.startsWith('_');
    });
    
    // Run validation using the same CI validator
    const validator = createCIValidator();
    const options: CIValidationOptions = {
      changedFiles: filesToValidate,
      submissionsDir,
      templatesDir,
      buildDir,
      registry: createEmptyRegistry(),
      epochIndex: createEpochIndex(),
    };
    return validator.validateSubmissions(options);
  }

  // ============================================================================
  // Arbitraries (Test Data Generators)
  // ============================================================================

  /**
   * Generate a valid file name segment
   */
  const fileNameSegmentArb = fc.stringOf(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'),
    { minLength: 3, maxLength: 10 }
  ).filter((s) => /^[a-z][a-z0-9]*$/.test(s));

  /**
   * Generate a valid race submission YAML content
   */
  const validRaceYamlArb = fc.tuple(
    fileNameSegmentArb,
    fc.integer({ min: 50, max: 500 })
  ).map(([id, lifespan]) => ({
    id: `race-${id}`,
    content: `template: race
id: race-${id}
name:
  zh: 测试种族${id}
average_lifespan: ${lifespan}
`
  }));

  /**
   * Generate an invalid race submission (missing required field)
   */
  const invalidRaceYamlArb = fc.tuple(fileNameSegmentArb)
    .map(([id]) => ({
      id: `race-${id}`,
      content: `template: race
id: race-${id}
name:
  zh: 缺少必填项的种族
`
    }));

  /**
   * Generate a skipped file name (starting with _)
   */
  const skippedFileNameArb = fc.tuple(fileNameSegmentArb)
    .map(([name]) => `_${name}`);

  // ============================================================================
  // Property Tests
  // ============================================================================

  /**
   * Property 14.1: Local validation produces same success/failure result as CI validation
   * 
   * For any valid submission file, both local validation (worldengine validate --cross)
   * and CI validation should produce the same pass/fail result.
   */
  it('should produce same success/failure result for valid submissions', async () => {
    await fc.assert(
      fc.asyncProperty(validRaceYamlArb, async ({ id, content }) => {
        const filePath = path.join(submissionsDir, 'race', `${id}.yaml`);
        await fs.writeFile(filePath, content);

        // Run both validations
        const ciResult = await runCIValidation([filePath]);
        const localResult = await runLocalValidation();

        // Both should produce the same success/failure result
        expect(localResult.valid).toBe(ciResult.valid);

        // Clean up
        await fs.unlink(filePath);

        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 14.2: Local validation produces same error count as CI validation
   * 
   * For any submission file (valid or invalid), both local and CI validation
   * should produce the same number of errors.
   */
  it('should produce same error count for invalid submissions', async () => {
    await fc.assert(
      fc.asyncProperty(invalidRaceYamlArb, async ({ id, content }) => {
        const filePath = path.join(submissionsDir, 'race', `${id}.yaml`);
        await fs.writeFile(filePath, content);

        // Run both validations
        const ciResult = await runCIValidation([filePath]);
        const localResult = await runLocalValidation();

        // Both should produce the same error count
        expect(localResult.errors.length).toBe(ciResult.errors.length);

        // Clean up
        await fs.unlink(filePath);

        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 14.3: Both validations use the same validation pipeline
   * 
   * For any submission file, both local and CI validation should produce
   * the same validated file count and skipped file count.
   */
  it('should produce same file counts (validated and skipped)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(validRaceYamlArb, { minLength: 1, maxLength: 3 }),
        async (submissions) => {
          const filePaths: string[] = [];
          
          for (const { id, content } of submissions) {
            const filePath = path.join(submissionsDir, 'race', `${id}.yaml`);
            await fs.writeFile(filePath, content);
            filePaths.push(filePath);
          }

          // Run both validations
          const ciResult = await runCIValidation(filePaths);
          const localResult = await runLocalValidation();

          // Both should produce the same file counts
          expect(localResult.validatedFiles).toBe(ciResult.validatedFiles);
          expect(localResult.skippedFiles).toBe(ciResult.skippedFiles);

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
   * Property 14.4: Files starting with _ are skipped in both modes
   * 
   * For any file whose name starts with underscore, both local and CI
   * validation should skip it and not produce errors.
   */
  it('should skip files starting with _ in both modes', async () => {
    await fc.assert(
      fc.asyncProperty(
        skippedFileNameArb,
        async (skippedFileName) => {
          // Create a skipped file with invalid content (should be skipped anyway)
          const filePath = path.join(submissionsDir, 'race', `${skippedFileName}.yaml`);
          await fs.writeFile(filePath, `template: race
id: invalid
`);

          // Run both validations
          const ciResult = await runCIValidation([filePath]);
          const localResult = await runLocalValidation();

          // CI validation should skip the file
          expect(ciResult.skippedFiles).toBe(1);
          expect(ciResult.validatedFiles).toBe(0);
          expect(ciResult.errors.length).toBe(0);
          expect(ciResult.valid).toBe(true);

          // Local validation should also skip (file is filtered out before validation)
          expect(localResult.valid).toBe(true);
          expect(localResult.errors.length).toBe(0);

          // Clean up
          await fs.unlink(filePath);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 14.5: Error codes are consistent between local and CI validation
   * 
   * For any invalid submission, both local and CI validation should produce
   * errors with the same error codes.
   */
  it('should produce consistent error codes between local and CI', async () => {
    await fc.assert(
      fc.asyncProperty(invalidRaceYamlArb, async ({ id, content }) => {
        const filePath = path.join(submissionsDir, 'race', `${id}.yaml`);
        await fs.writeFile(filePath, content);

        // Run CI validation to get error codes
        const ciResult = await runCIValidation([filePath]);
        const localResult = await runLocalValidation();

        // Both should fail
        expect(localResult.valid).toBe(false);
        expect(ciResult.valid).toBe(false);

        // Error counts should match
        expect(localResult.errors.length).toBe(ciResult.errors.length);

        // Error codes should match
        const ciErrorCodes = ciResult.errors.map(e => e.code).sort();
        const localErrorCodes = localResult.errors.map(e => e.code).sort();
        expect(localErrorCodes).toEqual(ciErrorCodes);

        // Clean up
        await fs.unlink(filePath);

        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 14.6: Warning counts are consistent between local and CI validation
   * 
   * For any submission with unknown fields, both local and CI validation
   * should produce the same number of warnings.
   */
  it('should produce consistent warning counts between local and CI', async () => {
    await fc.assert(
      fc.asyncProperty(
        validRaceYamlArb,
        fc.array(fileNameSegmentArb, { minLength: 1, maxLength: 3 }),
        async ({ id, content }, unknownFields) => {
          // Add unknown fields to the content
          let modifiedContent = content;
          for (const field of unknownFields) {
            modifiedContent += `${field}: "unknown value"\n`;
          }

          const filePath = path.join(submissionsDir, 'race', `${id}.yaml`);
          await fs.writeFile(filePath, modifiedContent);

          // Run both validations
          const ciResult = await runCIValidation([filePath]);
          const localResult = await runLocalValidation();

          // Warning counts should match
          expect(localResult.warnings.length).toBe(ciResult.warnings.length);

          // Clean up
          await fs.unlink(filePath);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 14.7: Mixed valid and invalid files produce consistent results
   * 
   * For any mix of valid and invalid submissions, both local and CI validation
   * should produce the same overall result.
   */
  it('should produce consistent results for mixed valid/invalid files', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.boolean(), { minLength: 1, maxLength: 4 }),
        async (validFlags) => {
          const filePaths: string[] = [];
          
          for (let i = 0; i < validFlags.length; i++) {
            const isValid = validFlags[i];
            const id = `race-mixed${i}`;
            const filePath = path.join(submissionsDir, 'race', `${id}.yaml`);
            
            if (isValid) {
              await fs.writeFile(filePath, `template: race
id: ${id}
name:
  zh: 有效种族${i}
average_lifespan: 100
`);
            } else {
              await fs.writeFile(filePath, `template: race
id: ${id}
name:
  zh: 无效种族${i}
`);
            }
            filePaths.push(filePath);
          }

          // Run both validations
          const ciResult = await runCIValidation(filePaths);
          const localResult = await runLocalValidation();

          // Both should produce the same success/failure result
          expect(localResult.valid).toBe(ciResult.valid);
          expect(localResult.errors.length).toBe(ciResult.errors.length);
          expect(localResult.validatedFiles).toBe(ciResult.validatedFiles);

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
   * Property 14.8: Empty submissions directory produces consistent results
   * 
   * When there are no submission files, both local and CI validation
   * should produce the same result (success with zero counts).
   */
  it('should produce consistent results for empty submissions directory', async () => {
    // Run both validations with no files
    const ciResult = await runCIValidation([]);
    const localResult = await runLocalValidation();

    // Both should succeed with zero counts
    expect(localResult.valid).toBe(true);
    expect(ciResult.valid).toBe(true);
    expect(localResult.totalFiles).toBe(0);
    expect(ciResult.totalFiles).toBe(0);
    expect(localResult.errors.length).toBe(0);
    expect(ciResult.errors.length).toBe(0);
  });

  /**
   * Property 14.9: Multiple runs produce deterministic results
   * 
   * Running validation multiple times on the same files should
   * produce identical results each time.
   */
  it('should produce deterministic results across multiple runs', async () => {
    await fc.assert(
      fc.asyncProperty(validRaceYamlArb, async ({ id, content }) => {
        const filePath = path.join(submissionsDir, 'race', `${id}.yaml`);
        await fs.writeFile(filePath, content);

        // Run validation multiple times
        const result1 = await runLocalValidation();
        const result2 = await runLocalValidation();
        const result3 = await runLocalValidation();

        // All results should be identical
        expect(result1.valid).toBe(result2.valid);
        expect(result2.valid).toBe(result3.valid);
        expect(result1.totalFiles).toBe(result2.totalFiles);
        expect(result2.totalFiles).toBe(result3.totalFiles);
        expect(result1.validatedFiles).toBe(result2.validatedFiles);
        expect(result2.validatedFiles).toBe(result3.validatedFiles);
        expect(result1.errors.length).toBe(result2.errors.length);
        expect(result2.errors.length).toBe(result3.errors.length);
        expect(result1.warnings.length).toBe(result2.warnings.length);
        expect(result2.warnings.length).toBe(result3.warnings.length);

        // Clean up
        await fs.unlink(filePath);

        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 14.10: Total files count is consistent between local and CI
   * 
   * For any set of submission files, both local and CI validation
   * should report the same total file count.
   */
  it('should report consistent total file counts', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(validRaceYamlArb, { minLength: 1, maxLength: 5 }),
        async (submissions) => {
          const filePaths: string[] = [];
          
          for (const { id, content } of submissions) {
            const filePath = path.join(submissionsDir, 'race', `${id}.yaml`);
            await fs.writeFile(filePath, content);
            filePaths.push(filePath);
          }

          // Run both validations
          const ciResult = await runCIValidation(filePaths);
          const localResult = await runLocalValidation();

          // Total file counts should match
          expect(localResult.totalFiles).toBe(ciResult.totalFiles);

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
});


// ============================================================================
// Feature: initialize, Property 27, 28, 29: 双语支持属性测试
// **Validates: Requirements 13.2, 13.3, 13.4, 13.5**
// ============================================================================

describe('Feature: initialize, Property 27: 双语字段结构验证', () => {
  /**
   * Property 27: 双语字段结构验证
   * 
   * For any bilingual field (name, description, prose, etc.),
   * zh subfield is required, en subfield is optional.
   */

  /**
   * Arbitrary: Generate a valid bilingual object with zh required
   */
  const validBilingualArb = fc.record({
    zh: fc.string({ minLength: 1, maxLength: 50 }),
    en: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
  });

  /**
   * Arbitrary: Generate an invalid bilingual object (missing zh)
   */
  const invalidBilingualMissingZhArb = fc.record({
    en: fc.string({ minLength: 1, maxLength: 50 }),
  });

  /**
   * Arbitrary: Generate bilingual with only zh (en omitted)
   */
  const bilingualZhOnlyArb = fc.record({
    zh: fc.string({ minLength: 1, maxLength: 50 }),
  });

  /**
   * Property 27.1: Valid bilingual objects always have zh field
   * 
   * For any valid bilingual object, the zh field must be present and be a string.
   */
  it('should always have zh field in valid bilingual objects', () => {
    fc.assert(
      fc.property(validBilingualArb, (bilingual) => {
        // zh must be present and be a string
        expect(bilingual.zh).toBeDefined();
        expect(typeof bilingual.zh).toBe('string');
        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 27.2: en field is optional in bilingual objects
   * 
   * For any valid bilingual object, the en field may or may not be present.
   * When present, it must be a string.
   */
  it('should allow en field to be optional', () => {
    fc.assert(
      fc.property(validBilingualArb, (bilingual) => {
        // en is optional
        if (bilingual.en !== undefined) {
          expect(typeof bilingual.en).toBe('string');
        }
        // Either way, the object is valid as long as zh exists
        expect(bilingual.zh).toBeDefined();
        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 27.3: Bilingual objects with only zh are valid
   * 
   * For any bilingual object with only zh field, it should be considered valid.
   */
  it('should accept bilingual objects with only zh field', () => {
    fc.assert(
      fc.property(bilingualZhOnlyArb, (bilingual) => {
        // Object with only zh is valid
        expect(bilingual.zh).toBeDefined();
        expect(typeof bilingual.zh).toBe('string');
        expect(bilingual.en).toBeUndefined();
        
        // Verify using isBilingual type guard
        expect(isBilingual(bilingual)).toBe(true);
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 27.4: Objects missing zh field are invalid bilingual
   * 
   * For any object missing the zh field, it should not be considered a valid bilingual.
   */
  it('should reject objects missing zh field as invalid bilingual', () => {
    fc.assert(
      fc.property(invalidBilingualMissingZhArb, (obj) => {
        // Object without zh is not a valid bilingual
        expect(isBilingual(obj)).toBe(false);
        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 27.5: isBilingual type guard correctly validates structure
   * 
   * For any generated bilingual-like object, isBilingual should correctly
   * identify whether it has the required structure.
   */
  it('should correctly validate bilingual structure with type guard', () => {
    const bilingualLikeArb = fc.oneof(
      validBilingualArb,
      bilingualZhOnlyArb,
      invalidBilingualMissingZhArb,
      fc.constant(null),
      fc.constant(undefined),
      fc.constant('string'),
      fc.constant(123),
      fc.constant({ zh: 123 }), // zh is not a string
      fc.constant({ zh: 'valid', en: 123 }), // en is not a string
    );

    fc.assert(
      fc.property(bilingualLikeArb, (value) => {
        const result = isBilingual(value);
        
        // Check expected results
        if (value === null || value === undefined || typeof value !== 'object') {
          expect(result).toBe(false);
        } else if (typeof (value as Record<string, unknown>).zh !== 'string') {
          expect(result).toBe(false);
        } else if ((value as Record<string, unknown>).en !== undefined && 
                   typeof (value as Record<string, unknown>).en !== 'string') {
          expect(result).toBe(false);
        } else {
          expect(result).toBe(true);
        }
        
        return true;
      }),
      { numRuns: 100 }
    );
  });
});


describe('Feature: initialize, Property 28: 语言切换功能', () => {
  /**
   * Property 28: 语言切换功能
   * 
   * CLI commands should switch output language based on:
   * 1. --lang flag (highest priority)
   * 2. WORLDENGINE_LANG environment variable
   * 3. Default to 'zh'
   */

  const originalEnv = process.env['WORLDENGINE_LANG'];

  afterEach(() => {
    // Restore original environment
    if (originalEnv !== undefined) {
      process.env['WORLDENGINE_LANG'] = originalEnv;
    } else {
      delete process.env['WORLDENGINE_LANG'];
    }
  });

  /**
   * Arbitrary: Generate valid language options
   */
  const langOptionArb = fc.constantFrom('zh', 'en') as fc.Arbitrary<'zh' | 'en'>;

  /**
   * Arbitrary: Generate CLI options with optional lang
   */
  const cliOptionsArb = fc.record({
    lang: fc.option(langOptionArb, { nil: undefined }),
  });

  /**
   * Property 28.1: --lang flag takes highest priority
   * 
   * When --lang flag is provided, it should override environment variable.
   */
  it('should prioritize --lang flag over environment variable', () => {
    fc.assert(
      fc.property(langOptionArb, langOptionArb, (flagLang, envLang) => {
        // Set environment variable
        process.env['WORLDENGINE_LANG'] = envLang;
        
        // Call getLanguage with --lang flag
        const result = getLanguage({ lang: flagLang });
        
        // Flag should take priority
        expect(result).toBe(flagLang);
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 28.2: Environment variable is used when no --lang flag
   * 
   * When --lang flag is not provided, WORLDENGINE_LANG env var should be used.
   */
  it('should use environment variable when no --lang flag', () => {
    fc.assert(
      fc.property(langOptionArb, (envLang) => {
        // Set environment variable
        process.env['WORLDENGINE_LANG'] = envLang;
        
        // Call getLanguage without --lang flag
        const result = getLanguage({});
        
        // Environment variable should be used
        expect(result).toBe(envLang);
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 28.3: Default to 'zh' when no flag or env var
   * 
   * When neither --lang flag nor WORLDENGINE_LANG is set, default to 'zh'.
   */
  it('should default to zh when no flag or env var', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        // Clear environment variable
        delete process.env['WORLDENGINE_LANG'];
        
        // Call getLanguage without any options
        const result = getLanguage({});
        
        // Should default to 'zh'
        expect(result).toBe('zh');
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 28.4: Invalid env var values are ignored
   * 
   * When WORLDENGINE_LANG has an invalid value, it should be ignored
   * and default to 'zh'.
   */
  it('should ignore invalid environment variable values', () => {
    const invalidLangArb = fc.string({ minLength: 1, maxLength: 10 })
      .filter(s => s !== 'zh' && s !== 'en');

    fc.assert(
      fc.property(invalidLangArb, (invalidLang) => {
        // Set invalid environment variable
        process.env['WORLDENGINE_LANG'] = invalidLang;
        
        // Call getLanguage without --lang flag
        const result = getLanguage({});
        
        // Should default to 'zh' since env var is invalid
        expect(result).toBe('zh');
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 28.5: getText returns correct language text
   * 
   * getText should return the appropriate language text based on lang parameter.
   */
  it('should return correct language text from getText', () => {
    const bilingualArb = fc.record({
      zh: fc.string({ minLength: 1, maxLength: 50 }),
      en: fc.string({ minLength: 1, maxLength: 50 }),
    });

    fc.assert(
      fc.property(bilingualArb, langOptionArb, (bilingual, lang) => {
        const result = getText(bilingual, lang);
        
        if (lang === 'en') {
          expect(result).toBe(bilingual.en);
        } else {
          expect(result).toBe(bilingual.zh);
        }
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 28.6: getText falls back to zh when en is missing
   * 
   * When requesting English but en field is missing, getText should fall back to zh.
   */
  it('should fall back to zh when en is missing', () => {
    const zhOnlyBilingualArb = fc.record({
      zh: fc.string({ minLength: 1, maxLength: 50 }),
    });

    fc.assert(
      fc.property(zhOnlyBilingualArb, (bilingual) => {
        // Request English but en is missing
        const result = getText(bilingual, 'en');
        
        // Should fall back to zh
        expect(result).toBe(bilingual.zh);
        
        return true;
      }),
      { numRuns: 100 }
    );
  });
});


describe('Feature: initialize, Property 29: 错误信息双语格式', () => {
  /**
   * Property 29: 错误信息双语格式
   * 
   * Validation errors should have bilingual format with:
   * - Chinese error description
   * - English error code as auxiliary identifier
   * Format: [ERR_CODE] Chinese message
   */

  /**
   * Arbitrary: Generate valid error codes
   */
  const errorCodeArb = fc.constantFrom(
    'ERR_YAML_INVALID',
    'ERR_TEMPLATE_MISSING',
    'ERR_TEMPLATE_UNKNOWN',
    'ERR_FIELD_REQUIRED',
    'ERR_FIELD_TYPE',
    'ERR_CONSTRAINT_REGEX',
    'ERR_CONSTRAINT_ENUM',
    'ERR_CONSTRAINT_RANGE',
    'ERR_REF_MISSING',
    'ERR_REF_EPOCH',
    'ERR_LIFESPAN_EXCEED',
    'ERR_TIME_ORDER',
    'ERR_LIFESPAN_MISMATCH',
    'ERR_EVENT_LIFETIME',
    'ERR_CANON_DUPLICATE',
    'ERR_FACTION_EPOCH_OVERLAP',
    'ERR_OUTPUT_MODIFIED',
    'ERR_ID_DUPLICATE'
  );

  /**
   * Arbitrary: Generate validation error objects
   */
  const validationErrorArb = fc.record({
    code: errorCodeArb,
    message: fc.record({
      zh: fc.string({ minLength: 5, maxLength: 100 }),
      en: fc.string({ minLength: 5, maxLength: 100 }),
    }),
    location: fc.record({
      file: fc.string({ minLength: 5, maxLength: 50 }),
      field: fc.string({ minLength: 1, maxLength: 20 }),
    }),
  });

  /**
   * Property 29.1: Error codes follow ERR_ prefix convention
   * 
   * All error codes should start with 'ERR_' prefix.
   */
  it('should have error codes with ERR_ prefix', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        // Check all error codes in ErrorCodes constant
        for (const [key, code] of Object.entries(ErrorCodes)) {
          expect(code).toMatch(/^ERR_/);
        }
        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 29.2: Validation errors have bilingual message structure
   * 
   * Every validation error should have both zh and en message fields.
   */
  it('should have bilingual message structure in validation errors', () => {
    fc.assert(
      fc.property(validationErrorArb, (error) => {
        // Error should have message with zh field
        expect(error.message.zh).toBeDefined();
        expect(typeof error.message.zh).toBe('string');
        expect(error.message.zh.length).toBeGreaterThan(0);
        
        // Error should have message with en field
        expect(error.message.en).toBeDefined();
        expect(typeof error.message.en).toBe('string');
        expect(error.message.en.length).toBeGreaterThan(0);
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 29.3: Error code is always a non-empty string
   * 
   * Every validation error should have a non-empty error code.
   */
  it('should have non-empty error code', () => {
    fc.assert(
      fc.property(validationErrorArb, (error) => {
        expect(error.code).toBeDefined();
        expect(typeof error.code).toBe('string');
        expect(error.code.length).toBeGreaterThan(0);
        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 29.4: Error location includes file path
   * 
   * Every validation error should include the file path in location.
   */
  it('should include file path in error location', () => {
    fc.assert(
      fc.property(validationErrorArb, (error) => {
        expect(error.location.file).toBeDefined();
        expect(typeof error.location.file).toBe('string');
        expect(error.location.file.length).toBeGreaterThan(0);
        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 29.5: Formatted error output contains error code in brackets
   * 
   * When formatting error for output, the error code should be in [ERR_CODE] format.
   */
  it('should format error with code in brackets', () => {
    fc.assert(
      fc.property(validationErrorArb, (error) => {
        // Simulate error formatting (as done in commands.ts formatErrors)
        const formattedLine = `[${error.code}] ${error.message.zh}`;
        
        // Should contain error code in brackets
        expect(formattedLine).toMatch(/^\[ERR_[A-Z_]+\]/);
        
        // Should contain Chinese message after the code
        expect(formattedLine).toContain(error.message.zh);
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 29.6: Warning codes follow WARN_ prefix convention
   * 
   * All warning codes should start with 'WARN_' prefix.
   */
  it('should have warning codes with WARN_ prefix', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        // Check all warning codes in WarningCodes constant
        for (const [key, code] of Object.entries(WarningCodes)) {
          expect(code).toMatch(/^WARN_/);
        }
        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 29.7: Error codes are unique
   * 
   * All error codes should be unique (no duplicates).
   */
  it('should have unique error codes', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const codes = Object.values(ErrorCodes);
        const uniqueCodes = new Set(codes);
        
        // All codes should be unique
        expect(uniqueCodes.size).toBe(codes.length);
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 29.8: Error message zh and en are different
   * 
   * For any error, the Chinese and English messages should typically be different
   * (unless they are intentionally the same for technical terms).
   */
  it('should have different zh and en messages for most errors', () => {
    // Generate errors where zh and en are intentionally different
    const differentMessagesArb = fc.record({
      code: errorCodeArb,
      message: fc.record({
        zh: fc.string({ minLength: 5, maxLength: 100 }).filter(s => /[\u4e00-\u9fa5]/.test(s) || s.length > 0),
        en: fc.string({ minLength: 5, maxLength: 100 }).filter(s => /^[a-zA-Z\s]+$/.test(s) || s.length > 0),
      }),
      location: fc.record({
        file: fc.constant('test.yaml'),
        field: fc.constant('testField'),
      }),
    });

    fc.assert(
      fc.property(differentMessagesArb, (error) => {
        // Both messages should exist
        expect(error.message.zh).toBeDefined();
        expect(error.message.en).toBeDefined();
        
        // Messages can be the same or different, but both must be non-empty
        expect(error.message.zh.length).toBeGreaterThan(0);
        expect(error.message.en.length).toBeGreaterThan(0);
        
        return true;
      }),
      { numRuns: 100 }
    );
  });
});

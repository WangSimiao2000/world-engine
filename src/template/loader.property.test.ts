/**
 * Template Loader Property-Based Tests
 * 模板加载器属性测试
 * 
 * Feature: initialize, Property 2: 模板格式错误报告完整性
 * **Validates: Requirements 1.6**
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { createTemplateLoader, TemplateLoadError } from './loader.js';
import type { Category } from '../types/index.js';
import { CATEGORIES } from '../types/index.js';

describe('Feature: initialize, Property 2: 模板格式错误报告完整性', () => {
  let tempDir: string;
  let loader: ReturnType<typeof createTemplateLoader>;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'worldengine-pbt-'));
    loader = createTemplateLoader();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  /**
   * Helper: Create a template file with given content
   */
  async function createTemplateFile(category: Category, content: string): Promise<string> {
    const filePath = path.join(tempDir, `${category}.yaml`);
    await fs.writeFile(filePath, content, 'utf-8');
    return filePath;
  }

  /**
   * Arbitrary: Generate a random category
   */
  const categoryArb = fc.constantFrom(...CATEGORIES);

  /**
   * Arbitrary: Generate invalid YAML syntax with unclosed brackets/braces
   * These will cause YAML parse errors with line/column information
   */
  const invalidYamlSyntaxArb = fc.oneof(
    // Unclosed bracket
    fc.record({
      category: categoryArb,
      lineNumber: fc.integer({ min: 2, max: 10 }),
    }).map(({ category, lineNumber }) => {
      const lines = [
        `category: ${category}`,
        'description:',
        '  zh: 测试模板',
      ];
      // Insert invalid YAML at specified line
      for (let i = lines.length; i < lineNumber; i++) {
        lines.push(`field${i}: value${i}`);
      }
      lines.push('invalid: [unclosed');
      return { category, content: lines.join('\n'), expectedLine: lines.length };
    }),
    // Unclosed brace
    fc.record({
      category: categoryArb,
      lineNumber: fc.integer({ min: 2, max: 10 }),
    }).map(({ category, lineNumber }) => {
      const lines = [
        `category: ${category}`,
        'description:',
        '  zh: 测试模板',
      ];
      for (let i = lines.length; i < lineNumber; i++) {
        lines.push(`field${i}: value${i}`);
      }
      lines.push('invalid: {unclosed');
      return { category, content: lines.join('\n'), expectedLine: lines.length };
    }),
    // Tab character causing issues
    fc.record({
      category: categoryArb,
    }).map(({ category }) => ({
      category,
      content: `category: ${category}\ndescription:\n\tzh: 测试模板`,
      expectedLine: 3,
    })),
    // Duplicate key at same level
    fc.record({
      category: categoryArb,
    }).map(({ category }) => ({
      category,
      content: `category: ${category}\ncategory: ${category}\ndescription:\n  zh: 测试模板`,
      expectedLine: 2,
    }))
  );

  /**
   * Property 2.1: Invalid YAML syntax errors include file path and line/column location
   * 
   * For any template YAML file with invalid YAML syntax, the TemplateLoadError
   * should include the file path and line/column location information.
   */
  it('should include file path and line/column location for invalid YAML syntax errors', async () => {
    await fc.assert(
      fc.asyncProperty(invalidYamlSyntaxArb, async ({ category, content }) => {
        const filePath = await createTemplateFile(category, content);

        try {
          await loader.loadTemplate(tempDir, category);
          // If no error thrown, the test should fail
          return false;
        } catch (error) {
          expect(error).toBeInstanceOf(TemplateLoadError);
          const loadError = error as TemplateLoadError;
          
          // Verify file path is included
          expect(loadError.filePath).toBeDefined();
          expect(loadError.filePath).toContain(`${category}.yaml`);
          
          // Verify location information is included for YAML syntax errors
          expect(loadError.location).toBeDefined();
          expect(loadError.location?.line).toBeDefined();
          expect(typeof loadError.location?.line).toBe('number');
          expect(loadError.location!.line).toBeGreaterThan(0);
          
          // Verify toString() includes file path
          const errorString = loadError.toString();
          expect(errorString).toContain(loadError.filePath);
          
          return true;
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Arbitrary: Generate YAML with missing required fields
   */
  const missingRequiredFieldsArb = fc.oneof(
    // Missing category field
    categoryArb.map((category) => ({
      category,
      content: `description:\n  zh: 测试模板\nrequired: []\noptional: []`,
      errorType: 'missing_category',
    })),
    // Missing description field
    categoryArb.map((category) => ({
      category,
      content: `category: ${category}\nrequired: []\noptional: []`,
      errorType: 'missing_description',
    })),
    // Missing description.zh field
    categoryArb.map((category) => ({
      category,
      content: `category: ${category}\ndescription:\n  en: Test template\nrequired: []\noptional: []`,
      errorType: 'missing_description_zh',
    }))
  );

  /**
   * Property 2.2: Missing required fields errors include file path
   * 
   * For any template YAML file missing required fields (category, description, description.zh),
   * the TemplateLoadError should include the file path.
   */
  it('should include file path for missing required fields errors', async () => {
    await fc.assert(
      fc.asyncProperty(missingRequiredFieldsArb, async ({ category, content }) => {
        await createTemplateFile(category, content);

        try {
          await loader.loadTemplate(tempDir, category);
          return false;
        } catch (error) {
          expect(error).toBeInstanceOf(TemplateLoadError);
          const loadError = error as TemplateLoadError;
          
          // Verify file path is included
          expect(loadError.filePath).toBeDefined();
          expect(loadError.filePath).toContain(`${category}.yaml`);
          
          // Verify toString() includes file path
          const errorString = loadError.toString();
          expect(errorString).toContain(loadError.filePath);
          
          return true;
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Arbitrary: Generate YAML with invalid field types
   */
  const invalidFieldTypeArb = fc.record({
    category: categoryArb,
    invalidType: fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz_'), { minLength: 3, maxLength: 15 })
      .filter((s) => !['string', 'integer', 'boolean', 'epoch_ref', 'entity_ref', 'bilingual', 'versioning'].includes(s))
      .filter((s) => !s.startsWith('array<')),
  }).map(({ category, invalidType }) => ({
    category,
    content: `category: ${category}
description:
  zh: 测试模板
required:
  - name: test_field
    type: ${invalidType}
    description:
      zh: 测试字段
optional: []`,
    invalidType,
  }));

  /**
   * Property 2.3: Invalid field type errors include file path
   * 
   * For any template YAML file with invalid field types,
   * the TemplateLoadError should include the file path.
   */
  it('should include file path for invalid field type errors', async () => {
    await fc.assert(
      fc.asyncProperty(invalidFieldTypeArb, async ({ category, content }) => {
        await createTemplateFile(category, content);

        try {
          await loader.loadTemplate(tempDir, category);
          return false;
        } catch (error) {
          expect(error).toBeInstanceOf(TemplateLoadError);
          const loadError = error as TemplateLoadError;
          
          // Verify file path is included
          expect(loadError.filePath).toBeDefined();
          expect(loadError.filePath).toContain(`${category}.yaml`);
          
          // Verify error message mentions type
          expect(loadError.message).toMatch(/类型|type/i);
          
          // Verify toString() includes file path
          const errorString = loadError.toString();
          expect(errorString).toContain(loadError.filePath);
          
          return true;
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Arbitrary: Generate YAML with invalid constraint types
   */
  const invalidConstraintArb = fc.record({
    category: categoryArb,
    invalidConstraintType: fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz_'), { minLength: 3, maxLength: 15 })
      .filter((s) => !['regex', 'enum', 'range', 'ref_exists'].includes(s)),
  }).map(({ category, invalidConstraintType }) => ({
    category,
    content: `category: ${category}
description:
  zh: 测试模板
required:
  - name: test_field
    type: string
    description:
      zh: 测试字段
    constraints:
      - type: ${invalidConstraintType}
        value: test
        errorCode: ERR_TEST
        errorMessage:
          zh: 测试错误
          en: Test error
optional: []`,
    invalidConstraintType,
  }));

  /**
   * Property 2.4: Invalid constraint errors include file path
   * 
   * For any template YAML file with invalid constraint types,
   * the TemplateLoadError should include the file path.
   */
  it('should include file path for invalid constraint errors', async () => {
    await fc.assert(
      fc.asyncProperty(invalidConstraintArb, async ({ category, content }) => {
        await createTemplateFile(category, content);

        try {
          await loader.loadTemplate(tempDir, category);
          return false;
        } catch (error) {
          expect(error).toBeInstanceOf(TemplateLoadError);
          const loadError = error as TemplateLoadError;
          
          // Verify file path is included
          expect(loadError.filePath).toBeDefined();
          expect(loadError.filePath).toContain(`${category}.yaml`);
          
          // Verify toString() includes file path
          const errorString = loadError.toString();
          expect(errorString).toContain(loadError.filePath);
          
          return true;
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Arbitrary: Generate various invalid template structures
   */
  const invalidTemplateStructureArb = fc.oneof(
    // description is not an object
    categoryArb.map((category) => ({
      category,
      content: `category: ${category}\ndescription: "not an object"\nrequired: []\noptional: []`,
    })),
    // required is not an array
    categoryArb.map((category) => ({
      category,
      content: `category: ${category}\ndescription:\n  zh: 测试\nrequired: "not an array"\noptional: []`,
    })),
    // optional is not an array
    categoryArb.map((category) => ({
      category,
      content: `category: ${category}\ndescription:\n  zh: 测试\nrequired: []\noptional: "not an array"`,
    })),
    // field definition is not an object
    categoryArb.map((category) => ({
      category,
      content: `category: ${category}\ndescription:\n  zh: 测试\nrequired:\n  - "not an object"\noptional: []`,
    })),
    // field name is missing
    categoryArb.map((category) => ({
      category,
      content: `category: ${category}\ndescription:\n  zh: 测试\nrequired:\n  - type: string\n    description:\n      zh: 测试\noptional: []`,
    })),
    // field type is missing
    categoryArb.map((category) => ({
      category,
      content: `category: ${category}\ndescription:\n  zh: 测试\nrequired:\n  - name: test\n    description:\n      zh: 测试\noptional: []`,
    })),
    // category mismatch with filename
    fc.tuple(categoryArb, categoryArb)
      .filter(([a, b]) => a !== b)
      .map(([fileCategory, contentCategory]) => ({
        category: fileCategory,
        content: `category: ${contentCategory}\ndescription:\n  zh: 测试\nrequired: []\noptional: []`,
      }))
  );

  /**
   * Property 2.5: All template structure errors include file path
   * 
   * For any template YAML file with invalid structure,
   * the TemplateLoadError should always include the file path.
   */
  it('should include file path for all template structure errors', async () => {
    await fc.assert(
      fc.asyncProperty(invalidTemplateStructureArb, async ({ category, content }) => {
        await createTemplateFile(category, content);

        try {
          await loader.loadTemplate(tempDir, category);
          return false;
        } catch (error) {
          expect(error).toBeInstanceOf(TemplateLoadError);
          const loadError = error as TemplateLoadError;
          
          // Verify file path is always included
          expect(loadError.filePath).toBeDefined();
          expect(loadError.filePath).toContain(`${category}.yaml`);
          expect(loadError.filePath.length).toBeGreaterThan(0);
          
          // Verify toString() includes file path
          const errorString = loadError.toString();
          expect(errorString).toContain('文件:');
          expect(errorString).toContain(loadError.filePath);
          
          return true;
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2.6: Error messages are informative
   * 
   * For any invalid template file, the error message should be non-empty
   * and provide meaningful information about the error.
   */
  it('should provide informative error messages for all error types', async () => {
    const allInvalidTemplatesArb = fc.oneof(
      missingRequiredFieldsArb.map(({ category, content }) => ({ category, content })),
      invalidFieldTypeArb.map(({ category, content }) => ({ category, content })),
      invalidConstraintArb.map(({ category, content }) => ({ category, content })),
      invalidTemplateStructureArb
    );

    await fc.assert(
      fc.asyncProperty(allInvalidTemplatesArb, async ({ category, content }) => {
        await createTemplateFile(category, content);

        try {
          await loader.loadTemplate(tempDir, category);
          return false;
        } catch (error) {
          expect(error).toBeInstanceOf(TemplateLoadError);
          const loadError = error as TemplateLoadError;
          
          // Verify error message is non-empty and informative
          expect(loadError.message).toBeDefined();
          expect(loadError.message.length).toBeGreaterThan(0);
          
          // Verify the error has a name
          expect(loadError.name).toBe('TemplateLoadError');
          
          // Verify toString() produces a meaningful string
          const errorString = loadError.toString();
          expect(errorString.length).toBeGreaterThan(loadError.message.length);
          expect(errorString).toContain('[TemplateLoadError]');
          
          return true;
        }
      }),
      { numRuns: 100 }
    );
  });
});

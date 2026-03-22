/**
 * CI Validator Unit Tests
 * CI 验证器单元测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  createCIValidator,
  validateSubmissions,
  type CIValidationOptions,
  type CIValidationResult,
} from './ci-validator.js';
import type { Registry, EpochIndex } from '../types/index.js';

describe('CIValidator', () => {
  let tempDir: string;
  let submissionsDir: string;
  let templatesDir: string;
  let buildDir: string;

  // 创建临时测试目录
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ci-validator-test-'));
    submissionsDir = path.join(tempDir, 'submissions');
    templatesDir = path.join(tempDir, 'templates');
    buildDir = path.join(tempDir, '_build');

    await fs.mkdir(submissionsDir, { recursive: true });
    await fs.mkdir(path.join(submissionsDir, 'character'), { recursive: true });
    await fs.mkdir(path.join(submissionsDir, 'race'), { recursive: true });
    await fs.mkdir(templatesDir, { recursive: true });
    await fs.mkdir(buildDir, { recursive: true });

    // 创建基本的模板文件
    await createCharacterTemplate();
    await createRaceTemplate();
  });

  // 清理临时目录
  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  // 辅助函数：创建 character 模板
  async function createCharacterTemplate() {
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

  // 辅助函数：创建 race 模板
  async function createRaceTemplate() {
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

  // 辅助函数：创建空的注册表
  function createEmptyRegistry(): Registry {
    return {
      entities: new Map(),
      index: {
        entries: [],
        lastUpdated: new Date().toISOString(),
      },
    };
  }

  // 辅助函数：创建纪元索引
  function createEpochIndex(): EpochIndex {
    return {
      epochs: [
        { id: 'epoch-01', name: { zh: '混沌纪元' }, order: 1, duration: 10000 },
        { id: 'epoch-02', name: { zh: '神荒纪元' }, order: 2, duration: 5000 },
      ],
    };
  }

  describe('createCIValidator', () => {
    it('should create a CI validator instance', () => {
      const validator = createCIValidator();
      expect(validator).toBeDefined();
      expect(typeof validator.validateSubmissions).toBe('function');
    });
  });

  describe('validateSubmissions', () => {
    describe('Output Directory Protection', () => {
      it('should fail if changed files include _build/ directory', async () => {
        const options: CIValidationOptions = {
          changedFiles: ['_build/character/char-test.yaml', 'submissions/character/char-test.yaml'],
          submissionsDir,
          templatesDir,
          buildDir,
        };

        const result = await validateSubmissions(options);

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0].code).toBe('ERR_OUTPUT_MODIFIED');
        // 验证在输出保护失败时不继续其他验证
        expect(result.validatedFiles).toBe(0);
      });

      it('should pass if no _build/ files are changed', async () => {
        const options: CIValidationOptions = {
          changedFiles: [],
          submissionsDir,
          templatesDir,
          buildDir,
        };

        const result = await validateSubmissions(options);

        expect(result.valid).toBe(true);
        expect(result.errors.length).toBe(0);
      });
    });

    describe('File Skipping', () => {
      it('should skip files starting with underscore', async () => {
        // 创建一个以 _ 开头的示例文件
        const exampleFile = path.join(submissionsDir, 'character', '_example.yaml');
        await fs.writeFile(exampleFile, `
template: character
id: char-example
name:
  zh: 示例角色
`);

        const options: CIValidationOptions = {
          changedFiles: [exampleFile],
          submissionsDir,
          templatesDir,
          buildDir,
        };

        const result = await validateSubmissions(options);

        expect(result.valid).toBe(true);
        expect(result.skippedFiles).toBe(1);
        expect(result.validatedFiles).toBe(0);
      });

      it('should not skip regular files', async () => {
        const regularFile = path.join(submissionsDir, 'race', 'race-test.yaml');
        await fs.writeFile(regularFile, `
template: race
id: race-test
name:
  zh: 测试种族
average_lifespan: 100
`);

        const options: CIValidationOptions = {
          changedFiles: [regularFile],
          submissionsDir,
          templatesDir,
          buildDir,
        };

        const result = await validateSubmissions(options);

        expect(result.skippedFiles).toBe(0);
        expect(result.validatedFiles).toBe(1);
      });
    });

    describe('Template Format Validation', () => {
      it('should fail for invalid YAML format', async () => {
        const invalidFile = path.join(submissionsDir, 'character', 'char-invalid.yaml');
        await fs.writeFile(invalidFile, `
template: character
id: char-invalid
name: [invalid yaml
`);

        const options: CIValidationOptions = {
          changedFiles: [invalidFile],
          submissionsDir,
          templatesDir,
          buildDir,
        };

        const result = await validateSubmissions(options);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.code === 'ERR_YAML_INVALID')).toBe(true);
      });

      it('should fail for missing template field', async () => {
        const noTemplateFile = path.join(submissionsDir, 'character', 'char-no-template.yaml');
        await fs.writeFile(noTemplateFile, `
id: char-no-template
name:
  zh: 无模板角色
`);

        const options: CIValidationOptions = {
          changedFiles: [noTemplateFile],
          submissionsDir,
          templatesDir,
          buildDir,
        };

        const result = await validateSubmissions(options);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.code === 'ERR_TEMPLATE_MISSING')).toBe(true);
      });

      it('should fail for unknown template type', async () => {
        const unknownTemplateFile = path.join(submissionsDir, 'character', 'char-unknown.yaml');
        await fs.writeFile(unknownTemplateFile, `
template: unknown_type
id: char-unknown
name:
  zh: 未知模板角色
`);

        const options: CIValidationOptions = {
          changedFiles: [unknownTemplateFile],
          submissionsDir,
          templatesDir,
          buildDir,
        };

        const result = await validateSubmissions(options);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.code === 'ERR_TEMPLATE_UNKNOWN')).toBe(true);
      });
    });

    describe('Required Fields Validation', () => {
      it('should fail for missing required fields', async () => {
        const missingFieldsFile = path.join(submissionsDir, 'character', 'char-missing.yaml');
        await fs.writeFile(missingFieldsFile, `
template: character
id: char-missing
name:
  zh: 缺少字段的角色
`);

        const options: CIValidationOptions = {
          changedFiles: [missingFieldsFile],
          submissionsDir,
          templatesDir,
          buildDir,
        };

        const result = await validateSubmissions(options);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.code === 'ERR_FIELD_REQUIRED')).toBe(true);
      });

      it('should pass for complete submission', async () => {
        // 先创建种族
        const raceFile = path.join(submissionsDir, 'race', 'race-human.yaml');
        await fs.writeFile(raceFile, `
template: race
id: race-human
name:
  zh: 人族
average_lifespan: 80
`);

        const charFile = path.join(submissionsDir, 'character', 'char-complete.yaml');
        await fs.writeFile(charFile, `
template: character
id: char-complete
name:
  zh: 完整角色
race: race-human
birth_epoch: epoch-01
birth_year: 100
lifespan: 80
`);

        const options: CIValidationOptions = {
          changedFiles: [raceFile, charFile],
          submissionsDir,
          templatesDir,
          buildDir,
          epochIndex: createEpochIndex(),
        };

        const result = await validateSubmissions(options);

        // 验证通过（种族和角色都在当前批次中）
        expect(result.valid).toBe(true);
        expect(result.validatedFiles).toBe(2);
      });
    });

    describe('Field Type Validation', () => {
      it('should fail for wrong field type', async () => {
        const wrongTypeFile = path.join(submissionsDir, 'race', 'race-wrong-type.yaml');
        await fs.writeFile(wrongTypeFile, `
template: race
id: race-wrong-type
name:
  zh: 类型错误的种族
average_lifespan: "not a number"
`);

        const options: CIValidationOptions = {
          changedFiles: [wrongTypeFile],
          submissionsDir,
          templatesDir,
          buildDir,
        };

        const result = await validateSubmissions(options);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.code === 'ERR_FIELD_TYPE')).toBe(true);
      });
    });

    describe('Unknown Fields Warning', () => {
      it('should generate warning for unknown fields', async () => {
        const unknownFieldFile = path.join(submissionsDir, 'race', 'race-unknown-field.yaml');
        await fs.writeFile(unknownFieldFile, `
template: race
id: race-unknown-field
name:
  zh: 有未知字段的种族
average_lifespan: 100
unknown_field: some value
`);

        const options: CIValidationOptions = {
          changedFiles: [unknownFieldFile],
          submissionsDir,
          templatesDir,
          buildDir,
        };

        const result = await validateSubmissions(options);

        // 未知字段只产生警告，不影响验证结果
        expect(result.valid).toBe(true);
        expect(result.warnings.some(w => w.code === 'WARN_FIELD_UNKNOWN')).toBe(true);
      });
    });

    describe('Cross-Reference Validation', () => {
      it('should fail for missing entity reference in canon mode', async () => {
        const charFile = path.join(submissionsDir, 'character', 'char-missing-ref.yaml');
        await fs.writeFile(charFile, `
template: character
id: char-missing-ref
name:
  zh: 引用缺失的角色
race: race-nonexistent
birth_epoch: epoch-01
birth_year: 100
lifespan: 80
`);

        const options: CIValidationOptions = {
          changedFiles: [charFile],
          submissionsDir,
          templatesDir,
          buildDir,
          epochIndex: createEpochIndex(),
          registry: createEmptyRegistry(),
        };

        const result = await validateSubmissions(options);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.code === 'ERR_REF_MISSING')).toBe(true);
      });

      it('should pass when reference exists in current batch', async () => {
        // 种族和角色在同一批次中
        const raceFile = path.join(submissionsDir, 'race', 'race-batch.yaml');
        await fs.writeFile(raceFile, `
template: race
id: race-batch
name:
  zh: 批次种族
average_lifespan: 100
`);

        const charFile = path.join(submissionsDir, 'character', 'char-batch.yaml');
        await fs.writeFile(charFile, `
template: character
id: char-batch
name:
  zh: 批次角色
race: race-batch
birth_epoch: epoch-01
birth_year: 100
lifespan: 80
`);

        const options: CIValidationOptions = {
          changedFiles: [raceFile, charFile],
          submissionsDir,
          templatesDir,
          buildDir,
          epochIndex: createEpochIndex(),
          registry: createEmptyRegistry(),
        };

        const result = await validateSubmissions(options);

        expect(result.valid).toBe(true);
      });

      it('should fail for missing epoch reference', async () => {
        const raceFile = path.join(submissionsDir, 'race', 'race-epoch.yaml');
        await fs.writeFile(raceFile, `
template: race
id: race-epoch
name:
  zh: 纪元种族
average_lifespan: 100
`);

        const charFile = path.join(submissionsDir, 'character', 'char-bad-epoch.yaml');
        await fs.writeFile(charFile, `
template: character
id: char-bad-epoch
name:
  zh: 纪元错误的角色
race: race-epoch
birth_epoch: epoch-nonexistent
birth_year: 100
lifespan: 80
`);

        const options: CIValidationOptions = {
          changedFiles: [raceFile, charFile],
          submissionsDir,
          templatesDir,
          buildDir,
          epochIndex: createEpochIndex(),
          registry: createEmptyRegistry(),
        };

        const result = await validateSubmissions(options);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.code === 'ERR_REF_EPOCH')).toBe(true);
      });
    });

    describe('Validation Pipeline Order', () => {
      it('should return early if output protection fails', async () => {
        // 同时包含 _build/ 文件和无效的 submission 文件
        const invalidFile = path.join(submissionsDir, 'character', 'char-invalid.yaml');
        await fs.writeFile(invalidFile, `
template: character
id: char-invalid
`);

        const options: CIValidationOptions = {
          changedFiles: ['_build/test.yaml', invalidFile],
          submissionsDir,
          templatesDir,
          buildDir,
        };

        const result = await validateSubmissions(options);

        // 应该只有输出保护错误，不应该有其他验证错误
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBe(1);
        expect(result.errors[0].code).toBe('ERR_OUTPUT_MODIFIED');
        expect(result.validatedFiles).toBe(0);
      });
    });

    describe('Result Aggregation', () => {
      it('should aggregate errors and warnings from multiple files', async () => {
        // 创建多个有问题的文件
        const file1 = path.join(submissionsDir, 'race', 'race-error1.yaml');
        await fs.writeFile(file1, `
template: race
id: race-error1
name:
  zh: 错误种族1
average_lifespan: "not a number"
`);

        const file2 = path.join(submissionsDir, 'race', 'race-error2.yaml');
        await fs.writeFile(file2, `
template: race
id: race-error2
name:
  zh: 错误种族2
`);

        const options: CIValidationOptions = {
          changedFiles: [file1, file2],
          submissionsDir,
          templatesDir,
          buildDir,
        };

        const result = await validateSubmissions(options);

        expect(result.valid).toBe(false);
        expect(result.validatedFiles).toBe(2);
        // 应该有来自两个文件的错误
        expect(result.errors.length).toBeGreaterThanOrEqual(2);
      });

      it('should correctly count total, validated, and skipped files', async () => {
        const validFile = path.join(submissionsDir, 'race', 'race-valid.yaml');
        await fs.writeFile(validFile, `
template: race
id: race-valid
name:
  zh: 有效种族
average_lifespan: 100
`);

        const skippedFile = path.join(submissionsDir, 'race', '_example.yaml');
        await fs.writeFile(skippedFile, `
template: race
id: race-example
`);

        const options: CIValidationOptions = {
          changedFiles: [validFile, skippedFile],
          submissionsDir,
          templatesDir,
          buildDir,
        };

        const result = await validateSubmissions(options);

        expect(result.totalFiles).toBe(2);
        expect(result.validatedFiles).toBe(1);
        expect(result.skippedFiles).toBe(1);
      });
    });

    describe('Empty Input', () => {
      it('should handle empty changed files list', async () => {
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

      it('should handle files outside submissions directory', async () => {
        const options: CIValidationOptions = {
          changedFiles: ['other/file.yaml', 'README.md'],
          submissionsDir,
          templatesDir,
          buildDir,
        };

        const result = await validateSubmissions(options);

        expect(result.valid).toBe(true);
        expect(result.totalFiles).toBe(0);
      });
    });
  });
});

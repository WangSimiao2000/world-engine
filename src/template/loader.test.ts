/**
 * Template Loader Tests
 * 模板加载器测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { createTemplateLoader, TemplateLoadError } from './loader.js';
import type { Category } from '../types/index.js';
import { CATEGORIES } from '../types/index.js';

describe('TemplateLoader', () => {
  let tempDir: string;
  let loader: ReturnType<typeof createTemplateLoader>;

  beforeEach(async () => {
    // 创建临时目录
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'worldengine-test-'));
    loader = createTemplateLoader();
  });

  afterEach(async () => {
    // 清理临时目录
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  /**
   * 辅助函数：创建模板文件
   */
  async function createTemplateFile(category: Category, content: string): Promise<void> {
    await fs.writeFile(path.join(tempDir, `${category}.yaml`), content, 'utf-8');
  }

  describe('loadTemplate', () => {
    it('should load a valid template file', async () => {
      const yamlContent = `
category: character
description:
  zh: 人物设定模板
  en: Character template
required:
  - name: id
    type: string
    description:
      zh: 唯一标识符
      en: Unique identifier
  - name: name
    type: bilingual
    description:
      zh: 角色名称
optional:
  - name: description
    type: bilingual
    description:
      zh: 角色描述
`;
      await createTemplateFile('character', yamlContent);

      const template = await loader.loadTemplate(tempDir, 'character');

      expect(template.category).toBe('character');
      expect(template.description.zh).toBe('人物设定模板');
      expect(template.description.en).toBe('Character template');
      expect(template.required).toHaveLength(2);
      expect(template.required[0].name).toBe('id');
      expect(template.required[0].type).toBe('string');
      expect(template.required[1].name).toBe('name');
      expect(template.required[1].type).toBe('bilingual');
      expect(template.optional).toHaveLength(1);
      expect(template.optional[0].name).toBe('description');
    });

    it('should parse field constraints correctly', async () => {
      const yamlContent = `
category: character
description:
  zh: 人物设定模板
required:
  - name: id
    type: string
    description:
      zh: 唯一标识符
    constraints:
      - type: regex
        value: "^char-[a-z0-9-]+$"
        errorCode: ERR_INVALID_ID
        errorMessage:
          zh: ID 格式错误
          en: Invalid ID format
  - name: priority
    type: string
    description:
      zh: 优先级
    constraints:
      - type: enum
        value: ["official", "secondary"]
        errorCode: ERR_INVALID_PRIORITY
        errorMessage:
          zh: 优先级值无效
          en: Invalid priority value
  - name: age
    type: integer
    description:
      zh: 年龄
    constraints:
      - type: range
        value:
          min: 1
          max: 10000
        errorCode: ERR_INVALID_AGE
        errorMessage:
          zh: 年龄超出范围
          en: Age out of range
optional: []
`;
      await createTemplateFile('character', yamlContent);

      const template = await loader.loadTemplate(tempDir, 'character');

      expect(template.required[0].constraints).toHaveLength(1);
      expect(template.required[0].constraints![0].type).toBe('regex');
      expect(template.required[0].constraints![0].value).toBe('^char-[a-z0-9-]+$');

      expect(template.required[1].constraints![0].type).toBe('enum');
      expect(template.required[1].constraints![0].value).toEqual(['official', 'secondary']);

      expect(template.required[2].constraints![0].type).toBe('range');
      expect(template.required[2].constraints![0].value).toEqual({ min: 1, max: 10000 });
    });

    it('should parse array types correctly', async () => {
      const yamlContent = `
category: history
description:
  zh: 历史事件模板
required:
  - name: participants
    type: array<entity_ref>
    description:
      zh: 参与人物列表
optional: []
`;
      await createTemplateFile('history', yamlContent);

      const template = await loader.loadTemplate(tempDir, 'history');

      expect(template.required[0].type).toBe('array<entity_ref>');
    });

    it('should parse refCategory for entity_ref fields', async () => {
      const yamlContent = `
category: character
description:
  zh: 人物设定模板
required:
  - name: race
    type: entity_ref
    description:
      zh: 所属种族
    refCategory: race
optional: []
`;
      await createTemplateFile('character', yamlContent);

      const template = await loader.loadTemplate(tempDir, 'character');

      expect(template.required[0].refCategory).toBe('race');
    });

    it('should throw error for non-existent file', async () => {
      await expect(loader.loadTemplate(tempDir, 'character')).rejects.toThrow(TemplateLoadError);
    });

    it('should throw error for invalid YAML syntax', async () => {
      const invalidYaml = `
category: character
description:
  zh: 人物设定模板
  invalid yaml here: [
`;
      await createTemplateFile('character', invalidYaml);

      await expect(loader.loadTemplate(tempDir, 'character')).rejects.toThrow(TemplateLoadError);
    });

    it('should throw error when category is missing', async () => {
      const yamlContent = `
description:
  zh: 人物设定模板
required: []
optional: []
`;
      await createTemplateFile('character', yamlContent);

      await expect(loader.loadTemplate(tempDir, 'character')).rejects.toThrow('模板缺少 category 字段');
    });

    it('should throw error when category does not match filename', async () => {
      const yamlContent = `
category: race
description:
  zh: 种族模板
required: []
optional: []
`;
      await createTemplateFile('character', yamlContent);

      await expect(loader.loadTemplate(tempDir, 'character')).rejects.toThrow('不匹配');
    });

    it('should throw error for invalid category value', async () => {
      const yamlContent = `
category: invalid_category
description:
  zh: 无效模板
required: []
optional: []
`;
      await createTemplateFile('character', yamlContent);

      await expect(loader.loadTemplate(tempDir, 'character')).rejects.toThrow('无效的 category 值');
    });

    it('should throw error when description.zh is missing', async () => {
      const yamlContent = `
category: character
description:
  en: Character template
required: []
optional: []
`;
      await createTemplateFile('character', yamlContent);

      await expect(loader.loadTemplate(tempDir, 'character')).rejects.toThrow('description.zh');
    });

    it('should throw error for invalid field type', async () => {
      const yamlContent = `
category: character
description:
  zh: 人物设定模板
required:
  - name: field1
    type: invalid_type
    description:
      zh: 无效字段
optional: []
`;
      await createTemplateFile('character', yamlContent);

      await expect(loader.loadTemplate(tempDir, 'character')).rejects.toThrow('类型');
    });

    it('should throw error for invalid constraint type', async () => {
      const yamlContent = `
category: character
description:
  zh: 人物设定模板
required:
  - name: id
    type: string
    description:
      zh: 唯一标识符
    constraints:
      - type: invalid_constraint
        value: test
        errorCode: ERR_TEST
        errorMessage:
          zh: 测试错误
optional: []
`;
      await createTemplateFile('character', yamlContent);

      await expect(loader.loadTemplate(tempDir, 'character')).rejects.toThrow('type 必须是以下值之一');
    });

    it('should include file path and location in error messages', async () => {
      const invalidYaml = `
category: character
description:
  zh: 人物设定模板
  invalid: [
`;
      await createTemplateFile('character', invalidYaml);

      try {
        await loader.loadTemplate(tempDir, 'character');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(TemplateLoadError);
        const loadError = error as TemplateLoadError;
        expect(loadError.filePath).toContain('character.yaml');
        expect(loadError.location).toBeDefined();
      }
    });
  });

  describe('loadTemplates', () => {
    it('should load all available templates from directory', async () => {
      // 创建多个模板文件
      const categories: Category[] = ['character', 'race', 'location'];
      for (const category of categories) {
        const yamlContent = `
category: ${category}
description:
  zh: ${category} 模板
required: []
optional: []
`;
        await createTemplateFile(category, yamlContent);
      }

      const templates = await loader.loadTemplates(tempDir);

      expect(templates.size).toBe(3);
      expect(templates.has('character')).toBe(true);
      expect(templates.has('race')).toBe(true);
      expect(templates.has('location')).toBe(true);
    });

    it('should skip non-existent template files', async () => {
      // 只创建一个模板文件
      const yamlContent = `
category: character
description:
  zh: 人物设定模板
required: []
optional: []
`;
      await createTemplateFile('character', yamlContent);

      const templates = await loader.loadTemplates(tempDir);

      expect(templates.size).toBe(1);
      expect(templates.has('character')).toBe(true);
    });

    it('should return empty map for empty directory', async () => {
      const templates = await loader.loadTemplates(tempDir);

      expect(templates.size).toBe(0);
    });

    it('should throw error if any template file has invalid format', async () => {
      // 创建一个有效的和一个无效的模板
      const validYaml = `
category: character
description:
  zh: 人物设定模板
required: []
optional: []
`;
      const invalidYaml = `
category: race
description: not_an_object
required: []
optional: []
`;
      await createTemplateFile('character', validYaml);
      await createTemplateFile('race', invalidYaml);

      await expect(loader.loadTemplates(tempDir)).rejects.toThrow(TemplateLoadError);
    });

    it('should load all 9 categories when all template files exist', async () => {
      // 创建所有 9 个类别的模板文件
      for (const category of CATEGORIES) {
        const yamlContent = `
category: ${category}
description:
  zh: ${category} 模板
required: []
optional: []
`;
        await createTemplateFile(category, yamlContent);
      }

      const templates = await loader.loadTemplates(tempDir);

      expect(templates.size).toBe(9);
      for (const category of CATEGORIES) {
        expect(templates.has(category)).toBe(true);
        expect(templates.get(category)?.category).toBe(category);
      }
    });
  });

  describe('TemplateLoadError', () => {
    it('should format error message with file path', () => {
      const error = new TemplateLoadError('测试错误', '/path/to/file.yaml');
      const str = error.toString();

      expect(str).toContain('测试错误');
      expect(str).toContain('/path/to/file.yaml');
    });

    it('should format error message with location', () => {
      const error = new TemplateLoadError('测试错误', '/path/to/file.yaml', { line: 10, column: 5 });
      const str = error.toString();

      expect(str).toContain('行号: 10');
      expect(str).toContain('列号: 5');
    });

    it('should format error message with cause', () => {
      const cause = new Error('原始错误');
      const error = new TemplateLoadError('测试错误', '/path/to/file.yaml', undefined, cause);
      const str = error.toString();

      expect(str).toContain('原因: 原始错误');
    });
  });
});

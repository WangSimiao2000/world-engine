/**
 * Registry Manager Tests
 * 注册表管理器测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as yaml from 'js-yaml';
import { createRegistryManager, createEmptyRegistry, RegistryLoadError } from './manager.js';
import type { Category } from '../types/index.js';

describe('RegistryManager', () => {
  let tempDir: string;
  let buildDir: string;

  beforeEach(async () => {
    // 创建临时目录
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'registry-test-'));
    buildDir = path.join(tempDir, '_build');
  });

  afterEach(async () => {
    // 清理临时目录
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('loadRegistry', () => {
    describe('when build directory does not exist', () => {
      it('should return empty registry', async () => {
        const manager = createRegistryManager();
        const registry = await manager.loadRegistry(buildDir);

        expect(registry.entities.size).toBe(0);
        expect(registry.index.entries).toHaveLength(0);
        expect(registry.index.lastUpdated).toBeDefined();
      });
    });

    describe('when build directory exists but is empty', () => {
      beforeEach(async () => {
        await fs.mkdir(buildDir, { recursive: true });
      });

      it('should return empty registry with no index file', async () => {
        const manager = createRegistryManager();
        const registry = await manager.loadRegistry(buildDir);

        expect(registry.entities.size).toBe(0);
        expect(registry.index.entries).toHaveLength(0);
      });
    });

    describe('when _index.yaml exists', () => {
      beforeEach(async () => {
        await fs.mkdir(buildDir, { recursive: true });
      });

      it('should load valid index file', async () => {
        const indexContent = `
lastUpdated: "2024-01-15T10:30:00Z"
entries:
  - id: char-test
    category: character
    canon: true
    priority: official
    archivedAt: "2024-01-15T10:30:00Z"
  - id: race-test
    category: race
    canon: false
    priority: secondary
    archivedAt: "2024-01-14T08:00:00Z"
`;
        await fs.writeFile(path.join(buildDir, '_index.yaml'), indexContent);

        const manager = createRegistryManager();
        const registry = await manager.loadRegistry(buildDir);

        expect(registry.index.lastUpdated).toBe('2024-01-15T10:30:00Z');
        expect(registry.index.entries).toHaveLength(2);
        expect(registry.index.entries[0]).toEqual({
          id: 'char-test',
          category: 'character',
          canon: true,
          priority: 'official',
          archivedAt: '2024-01-15T10:30:00Z',
        });
        expect(registry.index.entries[1]).toEqual({
          id: 'race-test',
          category: 'race',
          canon: false,
          priority: 'secondary',
          archivedAt: '2024-01-14T08:00:00Z',
        });
      });

      it('should handle empty index file', async () => {
        await fs.writeFile(path.join(buildDir, '_index.yaml'), '');

        const manager = createRegistryManager();
        const registry = await manager.loadRegistry(buildDir);

        expect(registry.index.entries).toHaveLength(0);
      });

      it('should handle index file with only lastUpdated', async () => {
        const indexContent = `lastUpdated: "2024-01-15T10:30:00Z"`;
        await fs.writeFile(path.join(buildDir, '_index.yaml'), indexContent);

        const manager = createRegistryManager();
        const registry = await manager.loadRegistry(buildDir);

        expect(registry.index.lastUpdated).toBe('2024-01-15T10:30:00Z');
        expect(registry.index.entries).toHaveLength(0);
      });

      it('should throw error for invalid YAML syntax', async () => {
        const invalidYaml = `
lastUpdated: "2024-01-15T10:30:00Z"
entries:
  - id: test
    category: [invalid yaml
`;
        await fs.writeFile(path.join(buildDir, '_index.yaml'), invalidYaml);

        const manager = createRegistryManager();
        await expect(manager.loadRegistry(buildDir)).rejects.toThrow(RegistryLoadError);
      });

      it('should throw error for invalid entry missing id', async () => {
        const indexContent = `
entries:
  - category: character
    canon: true
    priority: official
    archivedAt: "2024-01-15T10:30:00Z"
`;
        await fs.writeFile(path.join(buildDir, '_index.yaml'), indexContent);

        const manager = createRegistryManager();
        await expect(manager.loadRegistry(buildDir)).rejects.toThrow(RegistryLoadError);
      });

      it('should throw error for invalid category', async () => {
        const indexContent = `
entries:
  - id: test
    category: invalid_category
    canon: true
    priority: official
    archivedAt: "2024-01-15T10:30:00Z"
`;
        await fs.writeFile(path.join(buildDir, '_index.yaml'), indexContent);

        const manager = createRegistryManager();
        await expect(manager.loadRegistry(buildDir)).rejects.toThrow(RegistryLoadError);
      });

      it('should throw error for invalid priority', async () => {
        const indexContent = `
entries:
  - id: test
    category: character
    canon: true
    priority: invalid
    archivedAt: "2024-01-15T10:30:00Z"
`;
        await fs.writeFile(path.join(buildDir, '_index.yaml'), indexContent);

        const manager = createRegistryManager();
        await expect(manager.loadRegistry(buildDir)).rejects.toThrow(RegistryLoadError);
      });
    });

    describe('when entity files exist', () => {
      beforeEach(async () => {
        await fs.mkdir(buildDir, { recursive: true });
      });

      it('should load entity from category directory', async () => {
        // 创建 character 目录和实体文件
        const charDir = path.join(buildDir, 'character');
        await fs.mkdir(charDir, { recursive: true });

        const entityContent = `
id: char-test
category: character
archivedAt: "2024-01-15T10:30:00Z"
data:
  template: character
  id: char-test
  name:
    zh: 测试人物
  race: race-human
  birth_epoch: epoch-01
  birth_year: 100
  lifespan: 80
`;
        await fs.writeFile(path.join(charDir, 'char-test.yaml'), entityContent);

        const manager = createRegistryManager();
        const registry = await manager.loadRegistry(buildDir);

        expect(registry.entities.size).toBe(1);
        expect(registry.entities.has('char-test')).toBe(true);

        const entity = registry.entities.get('char-test')!;
        expect(entity.id).toBe('char-test');
        expect(entity.category).toBe('character');
        expect(entity.archivedAt).toBe('2024-01-15T10:30:00Z');
        expect(entity.data.template).toBe('character');
      });

      it('should load entities from multiple category directories', async () => {
        // 创建多个 category 目录
        const categories: Category[] = ['character', 'race', 'location'];
        
        for (const category of categories) {
          const dir = path.join(buildDir, category);
          await fs.mkdir(dir, { recursive: true });

          const entityContent = `
id: ${category}-test
category: ${category}
archivedAt: "2024-01-15T10:30:00Z"
data:
  template: ${category}
  id: ${category}-test
`;
          await fs.writeFile(path.join(dir, `${category}-test.yaml`), entityContent);
        }

        const manager = createRegistryManager();
        const registry = await manager.loadRegistry(buildDir);

        expect(registry.entities.size).toBe(3);
        expect(registry.entities.has('character-test')).toBe(true);
        expect(registry.entities.has('race-test')).toBe(true);
        expect(registry.entities.has('location-test')).toBe(true);
      });

      it('should load multiple entities from same category', async () => {
        const charDir = path.join(buildDir, 'character');
        await fs.mkdir(charDir, { recursive: true });

        for (let i = 1; i <= 3; i++) {
          const entityContent = `
id: char-test-${i}
category: character
archivedAt: "2024-01-15T10:30:00Z"
data:
  template: character
  id: char-test-${i}
`;
          await fs.writeFile(path.join(charDir, `char-test-${i}.yaml`), entityContent);
        }

        const manager = createRegistryManager();
        const registry = await manager.loadRegistry(buildDir);

        expect(registry.entities.size).toBe(3);
      });

      it('should skip non-yaml files', async () => {
        const charDir = path.join(buildDir, 'character');
        await fs.mkdir(charDir, { recursive: true });

        // 创建一个有效的 YAML 文件
        const entityContent = `
id: char-test
category: character
archivedAt: "2024-01-15T10:30:00Z"
data:
  template: character
  id: char-test
`;
        await fs.writeFile(path.join(charDir, 'char-test.yaml'), entityContent);
        
        // 创建一个非 YAML 文件
        await fs.writeFile(path.join(charDir, 'readme.txt'), 'This is not a YAML file');

        const manager = createRegistryManager();
        const registry = await manager.loadRegistry(buildDir);

        expect(registry.entities.size).toBe(1);
      });

      it('should throw error for entity with mismatched category', async () => {
        const charDir = path.join(buildDir, 'character');
        await fs.mkdir(charDir, { recursive: true });

        const entityContent = `
id: race-test
category: race
archivedAt: "2024-01-15T10:30:00Z"
data:
  template: race
  id: race-test
`;
        await fs.writeFile(path.join(charDir, 'race-test.yaml'), entityContent);

        const manager = createRegistryManager();
        await expect(manager.loadRegistry(buildDir)).rejects.toThrow(RegistryLoadError);
      });

      it('should throw error for entity missing id', async () => {
        const charDir = path.join(buildDir, 'character');
        await fs.mkdir(charDir, { recursive: true });

        const entityContent = `
category: character
archivedAt: "2024-01-15T10:30:00Z"
data:
  template: character
`;
        await fs.writeFile(path.join(charDir, 'invalid.yaml'), entityContent);

        const manager = createRegistryManager();
        await expect(manager.loadRegistry(buildDir)).rejects.toThrow(RegistryLoadError);
      });

      it('should throw error for entity missing data', async () => {
        const charDir = path.join(buildDir, 'character');
        await fs.mkdir(charDir, { recursive: true });

        const entityContent = `
id: char-test
category: character
archivedAt: "2024-01-15T10:30:00Z"
`;
        await fs.writeFile(path.join(charDir, 'char-test.yaml'), entityContent);

        const manager = createRegistryManager();
        await expect(manager.loadRegistry(buildDir)).rejects.toThrow(RegistryLoadError);
      });

      it('should support .yml extension', async () => {
        const charDir = path.join(buildDir, 'character');
        await fs.mkdir(charDir, { recursive: true });

        const entityContent = `
id: char-test
category: character
archivedAt: "2024-01-15T10:30:00Z"
data:
  template: character
  id: char-test
`;
        await fs.writeFile(path.join(charDir, 'char-test.yml'), entityContent);

        const manager = createRegistryManager();
        const registry = await manager.loadRegistry(buildDir);

        expect(registry.entities.size).toBe(1);
        expect(registry.entities.has('char-test')).toBe(true);
      });
    });

    describe('all 9 categories support', () => {
      const allCategories: Category[] = [
        'character', 'race', 'creature', 'flora', 
        'location', 'history', 'faction', 'artifact', 'concept'
      ];

      beforeEach(async () => {
        await fs.mkdir(buildDir, { recursive: true });
      });

      it('should load entities from all 9 category directories', async () => {
        for (const category of allCategories) {
          const dir = path.join(buildDir, category);
          await fs.mkdir(dir, { recursive: true });

          const entityContent = `
id: ${category}-test
category: ${category}
archivedAt: "2024-01-15T10:30:00Z"
data:
  template: ${category}
  id: ${category}-test
`;
          await fs.writeFile(path.join(dir, `${category}-test.yaml`), entityContent);
        }

        const manager = createRegistryManager();
        const registry = await manager.loadRegistry(buildDir);

        expect(registry.entities.size).toBe(9);
        
        for (const category of allCategories) {
          expect(registry.entities.has(`${category}-test`)).toBe(true);
          const entity = registry.entities.get(`${category}-test`)!;
          expect(entity.category).toBe(category);
        }
      });
    });
  });

  describe('createEmptyRegistry', () => {
    it('should create registry with empty entities map', () => {
      const registry = createEmptyRegistry();
      expect(registry.entities).toBeInstanceOf(Map);
      expect(registry.entities.size).toBe(0);
    });

    it('should create registry with empty index entries', () => {
      const registry = createEmptyRegistry();
      expect(registry.index.entries).toHaveLength(0);
    });

    it('should create registry with valid lastUpdated timestamp', () => {
      const registry = createEmptyRegistry();
      expect(registry.index.lastUpdated).toBeDefined();
      // 验证是有效的 ISO 日期字符串
      expect(() => new Date(registry.index.lastUpdated)).not.toThrow();
    });
  });

  describe('RegistryLoadError', () => {
    it('should format error message with file path', () => {
      const error = new RegistryLoadError('测试错误', '/path/to/file.yaml');
      const str = error.toString();

      expect(str).toContain('测试错误');
      expect(str).toContain('/path/to/file.yaml');
    });

    it('should format error message with location', () => {
      const error = new RegistryLoadError('测试错误', '/path/to/file.yaml', { line: 10, column: 5 });
      const str = error.toString();

      expect(str).toContain('测试错误');
      expect(str).toContain('行号: 10');
      expect(str).toContain('列号: 5');
    });

    it('should format error message with cause', () => {
      const cause = new Error('原始错误');
      const error = new RegistryLoadError('测试错误', '/path/to/file.yaml', undefined, cause);
      const str = error.toString();

      expect(str).toContain('测试错误');
      expect(str).toContain('原因: 原始错误');
    });
  });

  describe('getStatus', () => {
    beforeEach(async () => {
      await fs.mkdir(buildDir, { recursive: true });
    });

    it('should return zero counts when no registry loaded', () => {
      const manager = createRegistryManager();
      const status = manager.getStatus();

      expect(status.totalCount).toBe(0);
      expect(status.canonCount).toBe(0);
      expect(status.nonCanonCount).toBe(0);
    });

    it('should return correct counts after loading registry', async () => {
      // 创建测试实体
      const charDir = path.join(buildDir, 'character');
      const raceDir = path.join(buildDir, 'race');
      await fs.mkdir(charDir, { recursive: true });
      await fs.mkdir(raceDir, { recursive: true });

      // 创建 canon 人物
      await fs.writeFile(path.join(charDir, 'char-1.yaml'), `
id: char-1
category: character
archivedAt: "2024-01-15T10:30:00Z"
data:
  template: character
  id: char-1
  versioning:
    canon: true
    source: author-1
    priority: official
`);

      // 创建 non-canon 人物
      await fs.writeFile(path.join(charDir, 'char-2.yaml'), `
id: char-2
category: character
archivedAt: "2024-01-15T10:30:00Z"
data:
  template: character
  id: char-2
  versioning:
    canon: false
    source: author-2
    priority: secondary
`);

      // 创建种族
      await fs.writeFile(path.join(raceDir, 'race-1.yaml'), `
id: race-1
category: race
archivedAt: "2024-01-15T10:30:00Z"
data:
  template: race
  id: race-1
  versioning:
    canon: true
    source: author-1
    priority: official
`);

      const manager = createRegistryManager();
      await manager.loadRegistry(buildDir);
      const status = manager.getStatus();

      expect(status.totalCount).toBe(3);
      expect(status.byCategory.character).toBe(2);
      expect(status.byCategory.race).toBe(1);
      expect(status.canonCount).toBe(2);
      expect(status.nonCanonCount).toBe(1);
    });
  });

  describe('archive', () => {
    beforeEach(async () => {
      await fs.mkdir(buildDir, { recursive: true });
    });

    it('should archive submission to correct category directory', async () => {
      const submission = {
        template: 'character' as Category,
        id: 'char-test',
        name: { zh: '测试人物' },
        versioning: {
          canon: true,
          source: 'author-1',
          priority: 'official' as const,
        },
      };

      const manager = createRegistryManager();
      await manager.archive(submission, buildDir);

      // 验证文件已创建
      const filePath = path.join(buildDir, 'character', 'char-test.yaml');
      const fileExists = await fs.stat(filePath).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);
    });

    it('should create category directory if it does not exist', async () => {
      const submission = {
        template: 'race' as Category,
        id: 'race-test',
        name: { zh: '测试种族' },
      };

      const manager = createRegistryManager();
      await manager.archive(submission, buildDir);

      // 验证目录已创建
      const dirPath = path.join(buildDir, 'race');
      const dirExists = await fs.stat(dirPath).then(s => s.isDirectory()).catch(() => false);
      expect(dirExists).toBe(true);
    });

    it('should convert submission to RegisteredEntity format', async () => {
      const submission = {
        template: 'character' as Category,
        id: 'char-test',
        name: { zh: '测试人物' },
        versioning: {
          canon: true,
          source: 'author-1',
          priority: 'official' as const,
        },
      };

      const manager = createRegistryManager();
      await manager.archive(submission, buildDir);

      // 读取并验证文件内容
      const filePath = path.join(buildDir, 'character', 'char-test.yaml');
      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = yaml.load(content) as Record<string, unknown>;

      expect(parsed.id).toBe('char-test');
      expect(parsed.category).toBe('character');
      expect(parsed.archivedAt).toBeDefined();
      expect(typeof parsed.archivedAt).toBe('string');
      expect(parsed.data).toEqual(submission);
    });

    it('should preserve versioning information', async () => {
      const submission = {
        template: 'history' as Category,
        id: 'history-test',
        name: { zh: '测试历史事件' },
        versioning: {
          canon: false,
          source: 'author-2',
          priority: 'secondary' as const,
        },
      };

      const manager = createRegistryManager();
      await manager.archive(submission, buildDir);

      // 读取并验证文件内容
      const filePath = path.join(buildDir, 'history', 'history-test.yaml');
      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = yaml.load(content) as Record<string, unknown>;

      const data = parsed.data as Record<string, unknown>;
      expect(data.versioning).toEqual({
        canon: false,
        source: 'author-2',
        priority: 'secondary',
      });
    });

    it('should update internal registry state after archiving', async () => {
      const submission = {
        template: 'character' as Category,
        id: 'char-test',
        name: { zh: '测试人物' },
        versioning: {
          canon: true,
          source: 'author-1',
          priority: 'official' as const,
        },
      };

      const manager = createRegistryManager();
      await manager.archive(submission, buildDir);

      const status = manager.getStatus();
      expect(status.totalCount).toBe(1);
      expect(status.byCategory.character).toBe(1);
      expect(status.canonCount).toBe(1);
    });

    it('should update index entries after archiving', async () => {
      const submission = {
        template: 'character' as Category,
        id: 'char-test',
        name: { zh: '测试人物' },
        versioning: {
          canon: true,
          source: 'author-1',
          priority: 'official' as const,
        },
      };

      const manager = createRegistryManager();
      await manager.archive(submission, buildDir);

      // 加载注册表验证索引
      const registry = await manager.loadRegistry(buildDir);
      
      // 验证实体已被加载
      expect(registry.entities.has('char-test')).toBe(true);
    });

    it('should handle submission without versioning', async () => {
      const submission = {
        template: 'flora' as Category,
        id: 'flora-test',
        name: { zh: '测试植物' },
      };

      const manager = createRegistryManager();
      await manager.archive(submission, buildDir);

      // 验证文件已创建
      const filePath = path.join(buildDir, 'flora', 'flora-test.yaml');
      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = yaml.load(content) as Record<string, unknown>;

      expect(parsed.id).toBe('flora-test');
      expect(parsed.category).toBe('flora');
    });

    it('should archive multiple submissions to same category', async () => {
      const submissions = [
        {
          template: 'character' as Category,
          id: 'char-1',
          name: { zh: '人物1' },
        },
        {
          template: 'character' as Category,
          id: 'char-2',
          name: { zh: '人物2' },
        },
      ];

      const manager = createRegistryManager();
      for (const submission of submissions) {
        await manager.archive(submission, buildDir);
      }

      // 验证两个文件都已创建
      const file1Exists = await fs.stat(path.join(buildDir, 'character', 'char-1.yaml')).then(() => true).catch(() => false);
      const file2Exists = await fs.stat(path.join(buildDir, 'character', 'char-2.yaml')).then(() => true).catch(() => false);
      
      expect(file1Exists).toBe(true);
      expect(file2Exists).toBe(true);

      const status = manager.getStatus();
      expect(status.totalCount).toBe(2);
      expect(status.byCategory.character).toBe(2);
    });

    it('should archive submissions to different categories', async () => {
      const submissions = [
        {
          template: 'character' as Category,
          id: 'char-test',
          name: { zh: '测试人物' },
        },
        {
          template: 'race' as Category,
          id: 'race-test',
          name: { zh: '测试种族' },
        },
        {
          template: 'location' as Category,
          id: 'location-test',
          name: { zh: '测试地点' },
        },
      ];

      const manager = createRegistryManager();
      for (const submission of submissions) {
        await manager.archive(submission, buildDir);
      }

      const status = manager.getStatus();
      expect(status.totalCount).toBe(3);
      expect(status.byCategory.character).toBe(1);
      expect(status.byCategory.race).toBe(1);
      expect(status.byCategory.location).toBe(1);
    });

    it('should overwrite existing entity with same id', async () => {
      const submission1 = {
        template: 'character' as Category,
        id: 'char-test',
        name: { zh: '原始人物' },
        versioning: {
          canon: false,
          source: 'author-1',
          priority: 'secondary' as const,
        },
      };

      const submission2 = {
        template: 'character' as Category,
        id: 'char-test',
        name: { zh: '更新后人物' },
        versioning: {
          canon: true,
          source: 'author-2',
          priority: 'official' as const,
        },
      };

      const manager = createRegistryManager();
      await manager.archive(submission1, buildDir);
      await manager.archive(submission2, buildDir);

      // 验证文件内容已更新
      const filePath = path.join(buildDir, 'character', 'char-test.yaml');
      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = yaml.load(content) as Record<string, unknown>;
      const data = parsed.data as Record<string, unknown>;
      const name = data.name as Record<string, unknown>;

      expect(name.zh).toBe('更新后人物');

      // 验证内部状态只有一个实体
      const status = manager.getStatus();
      expect(status.totalCount).toBe(1);
      expect(status.canonCount).toBe(1);
    });

    it('should generate valid ISO timestamp for archivedAt', async () => {
      const submission = {
        template: 'character' as Category,
        id: 'char-test',
        name: { zh: '测试人物' },
      };

      const manager = createRegistryManager();
      await manager.archive(submission, buildDir);

      const filePath = path.join(buildDir, 'character', 'char-test.yaml');
      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = yaml.load(content) as Record<string, unknown>;

      // 验证 archivedAt 是有效的 ISO 日期字符串
      const archivedAt = parsed.archivedAt as string;
      expect(() => new Date(archivedAt)).not.toThrow();
      const date = new Date(archivedAt);
      expect(date.toISOString()).toBe(archivedAt);
    });
  });

  describe('updateIndex', () => {
    it('should create _build directory if it does not exist', async () => {
      const manager = createRegistryManager();
      await manager.updateIndex(buildDir);

      // 验证目录已创建
      const dirExists = await fs.stat(buildDir).then(s => s.isDirectory()).catch(() => false);
      expect(dirExists).toBe(true);
    });

    it('should create _index.yaml file', async () => {
      const manager = createRegistryManager();
      await manager.updateIndex(buildDir);

      // 验证索引文件已创建
      const indexPath = path.join(buildDir, '_index.yaml');
      const fileExists = await fs.stat(indexPath).then(s => s.isFile()).catch(() => false);
      expect(fileExists).toBe(true);
    });

    it('should write valid YAML format', async () => {
      const manager = createRegistryManager();
      await manager.updateIndex(buildDir);

      const indexPath = path.join(buildDir, '_index.yaml');
      const content = await fs.readFile(indexPath, 'utf-8');
      
      // 验证是有效的 YAML
      expect(() => yaml.load(content)).not.toThrow();
    });

    it('should include lastUpdated timestamp', async () => {
      const manager = createRegistryManager();
      await manager.updateIndex(buildDir);

      const indexPath = path.join(buildDir, '_index.yaml');
      const content = await fs.readFile(indexPath, 'utf-8');
      const parsed = yaml.load(content) as Record<string, unknown>;

      expect(parsed.lastUpdated).toBeDefined();
      expect(typeof parsed.lastUpdated).toBe('string');
      // 验证是有效的 ISO 日期字符串
      expect(() => new Date(parsed.lastUpdated as string)).not.toThrow();
    });

    it('should write empty entries array when no entities', async () => {
      const manager = createRegistryManager();
      await manager.updateIndex(buildDir);

      const indexPath = path.join(buildDir, '_index.yaml');
      const content = await fs.readFile(indexPath, 'utf-8');
      const parsed = yaml.load(content) as Record<string, unknown>;

      expect(parsed.entries).toEqual([]);
    });

    it('should write index entries after archiving entities', async () => {
      const submission = {
        template: 'character' as Category,
        id: 'char-test',
        name: { zh: '测试人物' },
        versioning: {
          canon: true,
          source: 'author-1',
          priority: 'official' as const,
        },
      };

      const manager = createRegistryManager();
      await manager.archive(submission, buildDir);
      await manager.updateIndex(buildDir);

      const indexPath = path.join(buildDir, '_index.yaml');
      const content = await fs.readFile(indexPath, 'utf-8');
      const parsed = yaml.load(content) as Record<string, unknown>;
      const entries = parsed.entries as Array<Record<string, unknown>>;

      expect(entries).toHaveLength(1);
      expect(entries[0].id).toBe('char-test');
      expect(entries[0].category).toBe('character');
      expect(entries[0].canon).toBe(true);
      expect(entries[0].priority).toBe('official');
      expect(entries[0].archivedAt).toBeDefined();
    });

    it('should write multiple index entries', async () => {
      const submissions = [
        {
          template: 'character' as Category,
          id: 'char-test',
          name: { zh: '测试人物' },
          versioning: {
            canon: true,
            source: 'author-1',
            priority: 'official' as const,
          },
        },
        {
          template: 'race' as Category,
          id: 'race-test',
          name: { zh: '测试种族' },
          versioning: {
            canon: false,
            source: 'author-2',
            priority: 'secondary' as const,
          },
        },
      ];

      const manager = createRegistryManager();
      for (const submission of submissions) {
        await manager.archive(submission, buildDir);
      }
      await manager.updateIndex(buildDir);

      const indexPath = path.join(buildDir, '_index.yaml');
      const content = await fs.readFile(indexPath, 'utf-8');
      const parsed = yaml.load(content) as Record<string, unknown>;
      const entries = parsed.entries as Array<Record<string, unknown>>;

      expect(entries).toHaveLength(2);
      
      // 查找各个条目
      const charEntry = entries.find(e => e.id === 'char-test');
      const raceEntry = entries.find(e => e.id === 'race-test');

      expect(charEntry).toBeDefined();
      expect(charEntry!.category).toBe('character');
      expect(charEntry!.canon).toBe(true);
      expect(charEntry!.priority).toBe('official');

      expect(raceEntry).toBeDefined();
      expect(raceEntry!.category).toBe('race');
      expect(raceEntry!.canon).toBe(false);
      expect(raceEntry!.priority).toBe('secondary');
    });

    it('should use default canon=true when versioning is missing', async () => {
      const submission = {
        template: 'flora' as Category,
        id: 'flora-test',
        name: { zh: '测试植物' },
        // 没有 versioning 字段
      };

      const manager = createRegistryManager();
      await manager.archive(submission, buildDir);
      await manager.updateIndex(buildDir);

      const indexPath = path.join(buildDir, '_index.yaml');
      const content = await fs.readFile(indexPath, 'utf-8');
      const parsed = yaml.load(content) as Record<string, unknown>;
      const entries = parsed.entries as Array<Record<string, unknown>>;

      expect(entries).toHaveLength(1);
      expect(entries[0].canon).toBe(true);
      expect(entries[0].priority).toBe('official');
    });

    it('should update index after loading existing registry', async () => {
      // 先创建一些实体文件
      const charDir = path.join(buildDir, 'character');
      await fs.mkdir(charDir, { recursive: true });

      await fs.writeFile(path.join(charDir, 'char-1.yaml'), `
id: char-1
category: character
archivedAt: "2024-01-15T10:30:00Z"
data:
  template: character
  id: char-1
  versioning:
    canon: true
    source: author-1
    priority: official
`);

      await fs.writeFile(path.join(charDir, 'char-2.yaml'), `
id: char-2
category: character
archivedAt: "2024-01-14T08:00:00Z"
data:
  template: character
  id: char-2
  versioning:
    canon: false
    source: author-2
    priority: secondary
`);

      const manager = createRegistryManager();
      await manager.loadRegistry(buildDir);
      await manager.updateIndex(buildDir);

      const indexPath = path.join(buildDir, '_index.yaml');
      const content = await fs.readFile(indexPath, 'utf-8');
      const parsed = yaml.load(content) as Record<string, unknown>;
      const entries = parsed.entries as Array<Record<string, unknown>>;

      expect(entries).toHaveLength(2);
      
      const char1Entry = entries.find(e => e.id === 'char-1');
      const char2Entry = entries.find(e => e.id === 'char-2');

      expect(char1Entry).toBeDefined();
      expect(char1Entry!.canon).toBe(true);
      expect(char1Entry!.priority).toBe('official');
      expect(char1Entry!.archivedAt).toBe('2024-01-15T10:30:00Z');

      expect(char2Entry).toBeDefined();
      expect(char2Entry!.canon).toBe(false);
      expect(char2Entry!.priority).toBe('secondary');
      expect(char2Entry!.archivedAt).toBe('2024-01-14T08:00:00Z');
    });

    it('should produce index file that can be loaded back', async () => {
      const submissions = [
        {
          template: 'character' as Category,
          id: 'char-test',
          name: { zh: '测试人物' },
          versioning: {
            canon: true,
            source: 'author-1',
            priority: 'official' as const,
          },
        },
        {
          template: 'race' as Category,
          id: 'race-test',
          name: { zh: '测试种族' },
          versioning: {
            canon: false,
            source: 'author-2',
            priority: 'secondary' as const,
          },
        },
      ];

      const manager = createRegistryManager();
      for (const submission of submissions) {
        await manager.archive(submission, buildDir);
      }
      await manager.updateIndex(buildDir);

      // 使用新的 manager 加载注册表
      const newManager = createRegistryManager();
      const registry = await newManager.loadRegistry(buildDir);

      expect(registry.index.entries).toHaveLength(2);
      
      const charEntry = registry.index.entries.find(e => e.id === 'char-test');
      const raceEntry = registry.index.entries.find(e => e.id === 'race-test');

      expect(charEntry).toBeDefined();
      expect(charEntry!.category).toBe('character');
      expect(charEntry!.canon).toBe(true);
      expect(charEntry!.priority).toBe('official');

      expect(raceEntry).toBeDefined();
      expect(raceEntry!.category).toBe('race');
      expect(raceEntry!.canon).toBe(false);
      expect(raceEntry!.priority).toBe('secondary');
    });

    it('should update internal registry index state', async () => {
      const submission = {
        template: 'character' as Category,
        id: 'char-test',
        name: { zh: '测试人物' },
        versioning: {
          canon: true,
          source: 'author-1',
          priority: 'official' as const,
        },
      };

      const manager = createRegistryManager();
      await manager.archive(submission, buildDir);
      
      // 在 updateIndex 之前，内部索引应该已经有条目（由 archive 添加）
      // updateIndex 应该更新 lastUpdated
      const beforeUpdate = new Date();
      await manager.updateIndex(buildDir);
      
      // 加载注册表验证索引已更新
      const registry = await manager.loadRegistry(buildDir);
      const lastUpdated = new Date(registry.index.lastUpdated);
      
      // lastUpdated 应该在 beforeUpdate 之后或相等
      expect(lastUpdated.getTime()).toBeGreaterThanOrEqual(beforeUpdate.getTime() - 1000);
    });
  });
});


describe('rebuild', () => {
  let tempDir: string;
  let submissionsDir: string;
  let buildDir: string;

  beforeEach(async () => {
    // 创建临时目录
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'registry-rebuild-test-'));
    submissionsDir = path.join(tempDir, 'submissions');
    buildDir = path.join(tempDir, '_build');
  });

  afterEach(async () => {
    // 清理临时目录
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('when submissions directory does not exist', () => {
    it('should create empty build directory with index', async () => {
      const manager = createRegistryManager();
      await manager.rebuild(submissionsDir, buildDir);

      // 验证 _build 目录已创建
      const buildDirExists = await fs.stat(buildDir).then(s => s.isDirectory()).catch(() => false);
      expect(buildDirExists).toBe(true);

      // 验证索引文件已创建
      const indexPath = path.join(buildDir, '_index.yaml');
      const indexExists = await fs.stat(indexPath).then(s => s.isFile()).catch(() => false);
      expect(indexExists).toBe(true);

      // 验证索引内容为空
      const content = await fs.readFile(indexPath, 'utf-8');
      const parsed = yaml.load(content) as Record<string, unknown>;
      expect(parsed.entries).toEqual([]);
    });
  });

  describe('when submissions directory exists but is empty', () => {
    beforeEach(async () => {
      await fs.mkdir(submissionsDir, { recursive: true });
    });

    it('should create empty build directory with index', async () => {
      const manager = createRegistryManager();
      await manager.rebuild(submissionsDir, buildDir);

      const indexPath = path.join(buildDir, '_index.yaml');
      const content = await fs.readFile(indexPath, 'utf-8');
      const parsed = yaml.load(content) as Record<string, unknown>;
      expect(parsed.entries).toEqual([]);
    });
  });

  describe('when submissions exist', () => {
    beforeEach(async () => {
      await fs.mkdir(submissionsDir, { recursive: true });
    });

    it('should archive single submission', async () => {
      // 创建 character 目录和提交文件
      const charDir = path.join(submissionsDir, 'character');
      await fs.mkdir(charDir, { recursive: true });

      const submissionContent = `
template: character
id: char-test
name:
  zh: 测试人物
versioning:
  canon: true
  source: author-1
  priority: official
`;
      await fs.writeFile(path.join(charDir, 'char-test.yaml'), submissionContent);

      const manager = createRegistryManager();
      await manager.rebuild(submissionsDir, buildDir);

      // 验证实体文件已创建
      const entityPath = path.join(buildDir, 'character', 'char-test.yaml');
      const entityExists = await fs.stat(entityPath).then(s => s.isFile()).catch(() => false);
      expect(entityExists).toBe(true);

      // 验证索引已更新
      const indexPath = path.join(buildDir, '_index.yaml');
      const content = await fs.readFile(indexPath, 'utf-8');
      const parsed = yaml.load(content) as Record<string, unknown>;
      const entries = parsed.entries as Array<Record<string, unknown>>;
      expect(entries).toHaveLength(1);
      expect(entries[0].id).toBe('char-test');
      expect(entries[0].category).toBe('character');
    });

    it('should archive submissions from multiple categories', async () => {
      // 创建多个 category 目录
      const categories: Category[] = ['character', 'race', 'location'];
      
      for (const category of categories) {
        const dir = path.join(submissionsDir, category);
        await fs.mkdir(dir, { recursive: true });

        const submissionContent = `
template: ${category}
id: ${category}-test
name:
  zh: 测试${category}
`;
        await fs.writeFile(path.join(dir, `${category}-test.yaml`), submissionContent);
      }

      const manager = createRegistryManager();
      await manager.rebuild(submissionsDir, buildDir);

      // 验证所有实体文件已创建
      for (const category of categories) {
        const entityPath = path.join(buildDir, category, `${category}-test.yaml`);
        const entityExists = await fs.stat(entityPath).then(s => s.isFile()).catch(() => false);
        expect(entityExists).toBe(true);
      }

      // 验证索引
      const indexPath = path.join(buildDir, '_index.yaml');
      const content = await fs.readFile(indexPath, 'utf-8');
      const parsed = yaml.load(content) as Record<string, unknown>;
      const entries = parsed.entries as Array<Record<string, unknown>>;
      expect(entries).toHaveLength(3);
    });

    it('should archive multiple submissions from same category', async () => {
      const charDir = path.join(submissionsDir, 'character');
      await fs.mkdir(charDir, { recursive: true });

      for (let i = 1; i <= 3; i++) {
        const submissionContent = `
template: character
id: char-test-${i}
name:
  zh: 测试人物${i}
`;
        await fs.writeFile(path.join(charDir, `char-test-${i}.yaml`), submissionContent);
      }

      const manager = createRegistryManager();
      await manager.rebuild(submissionsDir, buildDir);

      // 验证所有实体文件已创建
      for (let i = 1; i <= 3; i++) {
        const entityPath = path.join(buildDir, 'character', `char-test-${i}.yaml`);
        const entityExists = await fs.stat(entityPath).then(s => s.isFile()).catch(() => false);
        expect(entityExists).toBe(true);
      }

      const status = manager.getStatus();
      expect(status.totalCount).toBe(3);
      expect(status.byCategory.character).toBe(3);
    });

    it('should skip files starting with underscore', async () => {
      const charDir = path.join(submissionsDir, 'character');
      await fs.mkdir(charDir, { recursive: true });

      // 创建示例文件（应被跳过）
      const exampleContent = `
template: character
id: char-example
name:
  zh: 示例人物
`;
      await fs.writeFile(path.join(charDir, '_example.yaml'), exampleContent);

      // 创建正常提交文件
      const submissionContent = `
template: character
id: char-test
name:
  zh: 测试人物
`;
      await fs.writeFile(path.join(charDir, 'char-test.yaml'), submissionContent);

      const manager = createRegistryManager();
      await manager.rebuild(submissionsDir, buildDir);

      // 验证只有正常文件被归档
      const examplePath = path.join(buildDir, 'character', 'char-example.yaml');
      const exampleExists = await fs.stat(examplePath).then(s => s.isFile()).catch(() => false);
      expect(exampleExists).toBe(false);

      const entityPath = path.join(buildDir, 'character', 'char-test.yaml');
      const entityExists = await fs.stat(entityPath).then(s => s.isFile()).catch(() => false);
      expect(entityExists).toBe(true);

      const status = manager.getStatus();
      expect(status.totalCount).toBe(1);
    });

    it('should support .yml extension', async () => {
      const charDir = path.join(submissionsDir, 'character');
      await fs.mkdir(charDir, { recursive: true });

      const submissionContent = `
template: character
id: char-test
name:
  zh: 测试人物
`;
      await fs.writeFile(path.join(charDir, 'char-test.yml'), submissionContent);

      const manager = createRegistryManager();
      await manager.rebuild(submissionsDir, buildDir);

      const entityPath = path.join(buildDir, 'character', 'char-test.yaml');
      const entityExists = await fs.stat(entityPath).then(s => s.isFile()).catch(() => false);
      expect(entityExists).toBe(true);
    });

    it('should skip non-yaml files', async () => {
      const charDir = path.join(submissionsDir, 'character');
      await fs.mkdir(charDir, { recursive: true });

      // 创建非 YAML 文件
      await fs.writeFile(path.join(charDir, 'readme.txt'), 'This is not a YAML file');
      await fs.writeFile(path.join(charDir, 'notes.md'), '# Notes');

      // 创建正常提交文件
      const submissionContent = `
template: character
id: char-test
name:
  zh: 测试人物
`;
      await fs.writeFile(path.join(charDir, 'char-test.yaml'), submissionContent);

      const manager = createRegistryManager();
      await manager.rebuild(submissionsDir, buildDir);

      const status = manager.getStatus();
      expect(status.totalCount).toBe(1);
    });
  });

  describe('idempotency', () => {
    beforeEach(async () => {
      await fs.mkdir(submissionsDir, { recursive: true });
    });

    it('should produce identical results when run multiple times', async () => {
      // 创建提交文件
      const charDir = path.join(submissionsDir, 'character');
      const raceDir = path.join(submissionsDir, 'race');
      await fs.mkdir(charDir, { recursive: true });
      await fs.mkdir(raceDir, { recursive: true });

      await fs.writeFile(path.join(charDir, 'char-test.yaml'), `
template: character
id: char-test
name:
  zh: 测试人物
versioning:
  canon: true
  source: author-1
  priority: official
`);

      await fs.writeFile(path.join(raceDir, 'race-test.yaml'), `
template: race
id: race-test
name:
  zh: 测试种族
versioning:
  canon: false
  source: author-2
  priority: secondary
`);

      // 第一次重建
      const manager1 = createRegistryManager();
      await manager1.rebuild(submissionsDir, buildDir);

      // 读取第一次重建的结果
      const firstRegistry = await manager1.loadRegistry(buildDir);
      const firstEntities = Array.from(firstRegistry.entities.keys()).sort();

      // 第二次重建
      const manager2 = createRegistryManager();
      await manager2.rebuild(submissionsDir, buildDir);

      // 读取第二次重建的结果
      const secondRegistry = await manager2.loadRegistry(buildDir);
      const secondEntities = Array.from(secondRegistry.entities.keys()).sort();

      // 验证实体列表相同
      expect(secondEntities).toEqual(firstEntities);

      // 验证实体内容相同（除了 archivedAt 时间戳）
      for (const id of firstEntities) {
        const firstEntity = firstRegistry.entities.get(id)!;
        const secondEntity = secondRegistry.entities.get(id)!;
        
        expect(secondEntity.id).toBe(firstEntity.id);
        expect(secondEntity.category).toBe(firstEntity.category);
        expect(secondEntity.data).toEqual(firstEntity.data);
      }
    });

    it('should clear existing build directory before rebuilding', async () => {
      // 创建初始提交
      const charDir = path.join(submissionsDir, 'character');
      await fs.mkdir(charDir, { recursive: true });

      await fs.writeFile(path.join(charDir, 'char-1.yaml'), `
template: character
id: char-1
name:
  zh: 人物1
`);

      await fs.writeFile(path.join(charDir, 'char-2.yaml'), `
template: character
id: char-2
name:
  zh: 人物2
`);

      // 第一次重建
      const manager1 = createRegistryManager();
      await manager1.rebuild(submissionsDir, buildDir);

      let status1 = manager1.getStatus();
      expect(status1.totalCount).toBe(2);

      // 删除一个提交文件
      await fs.unlink(path.join(charDir, 'char-2.yaml'));

      // 第二次重建
      const manager2 = createRegistryManager();
      await manager2.rebuild(submissionsDir, buildDir);

      // 验证只有一个实体
      let status2 = manager2.getStatus();
      expect(status2.totalCount).toBe(1);

      // 验证 char-2 的文件已被删除
      const char2Path = path.join(buildDir, 'character', 'char-2.yaml');
      const char2Exists = await fs.stat(char2Path).then(s => s.isFile()).catch(() => false);
      expect(char2Exists).toBe(false);
    });
  });

  describe('all 9 categories support', () => {
    const allCategories: Category[] = [
      'character', 'race', 'creature', 'flora', 
      'location', 'history', 'faction', 'artifact', 'concept'
    ];

    beforeEach(async () => {
      await fs.mkdir(submissionsDir, { recursive: true });
    });

    it('should archive submissions from all 9 categories', async () => {
      for (const category of allCategories) {
        const dir = path.join(submissionsDir, category);
        await fs.mkdir(dir, { recursive: true });

        const submissionContent = `
template: ${category}
id: ${category}-test
name:
  zh: 测试${category}
`;
        await fs.writeFile(path.join(dir, `${category}-test.yaml`), submissionContent);
      }

      const manager = createRegistryManager();
      await manager.rebuild(submissionsDir, buildDir);

      const status = manager.getStatus();
      expect(status.totalCount).toBe(9);

      for (const category of allCategories) {
        expect(status.byCategory[category]).toBe(1);
        
        const entityPath = path.join(buildDir, category, `${category}-test.yaml`);
        const entityExists = await fs.stat(entityPath).then(s => s.isFile()).catch(() => false);
        expect(entityExists).toBe(true);
      }
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      await fs.mkdir(submissionsDir, { recursive: true });
    });

    it('should throw error for invalid YAML syntax', async () => {
      const charDir = path.join(submissionsDir, 'character');
      await fs.mkdir(charDir, { recursive: true });

      const invalidYaml = `
template: character
id: char-test
name:
  zh: [invalid yaml
`;
      await fs.writeFile(path.join(charDir, 'char-test.yaml'), invalidYaml);

      const manager = createRegistryManager();
      await expect(manager.rebuild(submissionsDir, buildDir)).rejects.toThrow(RegistryLoadError);
    });

    it('should throw error for submission missing template field', async () => {
      const charDir = path.join(submissionsDir, 'character');
      await fs.mkdir(charDir, { recursive: true });

      const submissionContent = `
id: char-test
name:
  zh: 测试人物
`;
      await fs.writeFile(path.join(charDir, 'char-test.yaml'), submissionContent);

      const manager = createRegistryManager();
      await expect(manager.rebuild(submissionsDir, buildDir)).rejects.toThrow(RegistryLoadError);
    });

    it('should throw error for submission missing id field', async () => {
      const charDir = path.join(submissionsDir, 'character');
      await fs.mkdir(charDir, { recursive: true });

      const submissionContent = `
template: character
name:
  zh: 测试人物
`;
      await fs.writeFile(path.join(charDir, 'char-test.yaml'), submissionContent);

      const manager = createRegistryManager();
      await expect(manager.rebuild(submissionsDir, buildDir)).rejects.toThrow(RegistryLoadError);
    });

    it('should throw error for template/directory mismatch', async () => {
      const charDir = path.join(submissionsDir, 'character');
      await fs.mkdir(charDir, { recursive: true });

      // 在 character 目录下放置 race 模板的文件
      const submissionContent = `
template: race
id: race-test
name:
  zh: 测试种族
`;
      await fs.writeFile(path.join(charDir, 'race-test.yaml'), submissionContent);

      const manager = createRegistryManager();
      await expect(manager.rebuild(submissionsDir, buildDir)).rejects.toThrow(RegistryLoadError);
    });
  });

  describe('versioning preservation', () => {
    beforeEach(async () => {
      await fs.mkdir(submissionsDir, { recursive: true });
    });

    it('should preserve versioning information in archived entities', async () => {
      const charDir = path.join(submissionsDir, 'character');
      await fs.mkdir(charDir, { recursive: true });

      const submissionContent = `
template: character
id: char-test
name:
  zh: 测试人物
versioning:
  canon: true
  source: author-1
  priority: official
`;
      await fs.writeFile(path.join(charDir, 'char-test.yaml'), submissionContent);

      const manager = createRegistryManager();
      await manager.rebuild(submissionsDir, buildDir);

      // 读取归档的实体文件
      const entityPath = path.join(buildDir, 'character', 'char-test.yaml');
      const content = await fs.readFile(entityPath, 'utf-8');
      const parsed = yaml.load(content) as Record<string, unknown>;
      const data = parsed.data as Record<string, unknown>;
      const versioning = data.versioning as Record<string, unknown>;

      expect(versioning.canon).toBe(true);
      expect(versioning.source).toBe('author-1');
      expect(versioning.priority).toBe('official');

      // 验证索引中的 versioning 信息
      const indexPath = path.join(buildDir, '_index.yaml');
      const indexContent = await fs.readFile(indexPath, 'utf-8');
      const indexParsed = yaml.load(indexContent) as Record<string, unknown>;
      const entries = indexParsed.entries as Array<Record<string, unknown>>;

      expect(entries[0].canon).toBe(true);
      expect(entries[0].priority).toBe('official');
    });

    it('should handle submissions without versioning', async () => {
      const charDir = path.join(submissionsDir, 'character');
      await fs.mkdir(charDir, { recursive: true });

      const submissionContent = `
template: character
id: char-test
name:
  zh: 测试人物
`;
      await fs.writeFile(path.join(charDir, 'char-test.yaml'), submissionContent);

      const manager = createRegistryManager();
      await manager.rebuild(submissionsDir, buildDir);

      const status = manager.getStatus();
      expect(status.totalCount).toBe(1);
      // 没有 versioning 时，默认为 non-canon
      expect(status.nonCanonCount).toBe(1);
    });
  });
});

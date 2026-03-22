/**
 * Registry Manager
 * 注册表管理器 - 负责已验证设定的归档和索引管理
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import type { 
  Submission, 
  Registry, 
  RegistryStatus,
  RegistryIndex,
  RegisteredEntity,
  IndexEntry,
  Category
} from '../types/index.js';
import { CATEGORIES, isCategory } from '../types/index.js';

/**
 * 注册表管理器接口
 */
export interface RegistryManager {
  /**
   * 加载现有注册表
   */
  loadRegistry(buildDir: string): Promise<Registry>;
  
  /**
   * 归档通过验证的 Submission
   */
  archive(submission: Submission, buildDir: string): Promise<void>;
  
  /**
   * 重建完整注册表
   */
  rebuild(submissionsDir: string, buildDir: string): Promise<void>;
  
  /**
   * 获取注册表状态统计
   */
  getStatus(): RegistryStatus;
  
  /**
   * 更新索引文件
   */
  updateIndex(buildDir: string): Promise<void>;
}

/**
 * 注册表加载错误
 */
export class RegistryLoadError extends Error {
  public readonly filePath: string;
  public readonly location?: { line?: number; column?: number };

  constructor(
    message: string,
    filePath: string,
    location?: { line?: number; column?: number },
    cause?: Error
  ) {
    super(message, { cause });
    this.name = 'RegistryLoadError';
    this.filePath = filePath;
    this.location = location;
  }

  /**
   * 格式化错误信息
   */
  override toString(): string {
    let msg = `[RegistryLoadError] ${this.message}`;
    msg += `\n  文件: ${this.filePath}`;
    if (this.location) {
      if (this.location.line !== undefined) {
        msg += `\n  行号: ${this.location.line}`;
      }
      if (this.location.column !== undefined) {
        msg += `\n  列号: ${this.location.column}`;
      }
    }
    if (this.cause) {
      const causeError = this.cause as Error;
      msg += `\n  原因: ${causeError.message}`;
    }
    return msg;
  }
}

/**
 * 原始索引文件结构
 */
interface RawRegistryIndex {
  lastUpdated?: unknown;
  entries?: unknown[];
}

/**
 * 原始索引条目结构
 */
interface RawIndexEntry {
  id?: unknown;
  category?: unknown;
  canon?: unknown;
  priority?: unknown;
  archivedAt?: unknown;
}

/**
 * 原始已注册实体文件结构
 */
interface RawRegisteredEntity {
  id?: unknown;
  category?: unknown;
  data?: unknown;
  archivedAt?: unknown;
}

/**
 * 创建注册表管理器实例
 */
export function createRegistryManager(): RegistryManager {
  return new RegistryManagerImpl();
}

/**
 * 创建空的注册表
 */
export function createEmptyRegistry(): Registry {
  return {
    entities: new Map<string, RegisteredEntity>(),
    index: {
      entries: [],
      lastUpdated: new Date().toISOString(),
    },
  };
}

/**
 * 注册表管理器实现
 */
class RegistryManagerImpl implements RegistryManager {
  private currentRegistry: Registry | null = null;

  /**
   * 加载现有注册表
   * 从 _build/ 目录加载已归档设定和 _index.yaml 索引文件
   */
  async loadRegistry(buildDir: string): Promise<Registry> {
    // 检查 build 目录是否存在
    const buildDirExists = await this.directoryExists(buildDir);
    if (!buildDirExists) {
      // 目录不存在，返回空注册表
      this.currentRegistry = createEmptyRegistry();
      return this.currentRegistry;
    }

    // 加载索引文件
    const index = await this.loadIndex(buildDir);

    // 加载所有实体
    const entities = await this.loadEntities(buildDir, index);

    this.currentRegistry = {
      entities,
      index,
    };

    return this.currentRegistry;
  }

  /**
   * 加载索引文件
   */
  private async loadIndex(buildDir: string): Promise<RegistryIndex> {
    const indexPath = path.join(buildDir, '_index.yaml');

    // 检查索引文件是否存在
    const indexExists = await this.fileExists(indexPath);
    if (!indexExists) {
      // 索引文件不存在，返回空索引
      return {
        entries: [],
        lastUpdated: new Date().toISOString(),
      };
    }

    // 读取索引文件
    let content: string;
    try {
      content = await fs.readFile(indexPath, 'utf-8');
    } catch (error) {
      throw new RegistryLoadError(
        `无法读取索引文件: ${indexPath}`,
        indexPath,
        undefined,
        error instanceof Error ? error : new Error(String(error))
      );
    }

    // 解析 YAML
    let rawData: unknown;
    try {
      rawData = yaml.load(content);
    } catch (error) {
      const yamlError = error as yaml.YAMLException;
      throw new RegistryLoadError(
        `索引文件 YAML 格式不合法: ${yamlError.message}`,
        indexPath,
        yamlError.mark ? { line: yamlError.mark.line + 1, column: yamlError.mark.column + 1 } : undefined,
        yamlError
      );
    }

    // 解析索引数据
    return this.parseRegistryIndex(rawData, indexPath);
  }

  /**
   * 解析注册表索引
   */
  private parseRegistryIndex(rawData: unknown, filePath: string): RegistryIndex {
    // 处理空文件或 null
    if (rawData === null || rawData === undefined) {
      return {
        entries: [],
        lastUpdated: new Date().toISOString(),
      };
    }

    if (typeof rawData !== 'object') {
      throw new RegistryLoadError('索引文件内容必须是一个对象', filePath);
    }

    const data = rawData as RawRegistryIndex;

    // 解析 lastUpdated
    let lastUpdated: string;
    if (typeof data.lastUpdated === 'string') {
      lastUpdated = data.lastUpdated;
    } else {
      lastUpdated = new Date().toISOString();
    }

    // 解析 entries
    const entries: IndexEntry[] = [];
    if (data.entries !== undefined && data.entries !== null) {
      if (!Array.isArray(data.entries)) {
        throw new RegistryLoadError('索引文件的 entries 字段必须是数组', filePath);
      }

      for (let i = 0; i < data.entries.length; i++) {
        const entry = this.parseIndexEntry(data.entries[i], `entries[${i}]`, filePath);
        entries.push(entry);
      }
    }

    return {
      entries,
      lastUpdated,
    };
  }

  /**
   * 解析索引条目
   */
  private parseIndexEntry(rawEntry: unknown, path: string, filePath: string): IndexEntry {
    if (typeof rawEntry !== 'object' || rawEntry === null) {
      throw new RegistryLoadError(`${path} 必须是一个对象`, filePath);
    }

    const entry = rawEntry as RawIndexEntry;

    // 验证 id
    if (typeof entry.id !== 'string' || entry.id.trim() === '') {
      throw new RegistryLoadError(`${path}.id 必须是非空字符串`, filePath);
    }

    // 验证 category
    if (!isCategory(entry.category)) {
      throw new RegistryLoadError(
        `${path}.category 必须是有效的 Category 值: ${CATEGORIES.join(', ')}`,
        filePath
      );
    }

    // 验证 canon
    if (typeof entry.canon !== 'boolean') {
      throw new RegistryLoadError(`${path}.canon 必须是布尔值`, filePath);
    }

    // 验证 priority
    if (entry.priority !== 'official' && entry.priority !== 'secondary') {
      throw new RegistryLoadError(`${path}.priority 必须是 'official' 或 'secondary'`, filePath);
    }

    // 验证 archivedAt
    if (typeof entry.archivedAt !== 'string') {
      throw new RegistryLoadError(`${path}.archivedAt 必须是字符串`, filePath);
    }

    return {
      id: entry.id,
      category: entry.category,
      canon: entry.canon,
      priority: entry.priority,
      archivedAt: entry.archivedAt,
    };
  }

  /**
   * 加载所有实体
   */
  private async loadEntities(
    buildDir: string,
    _index: RegistryIndex
  ): Promise<Map<string, RegisteredEntity>> {
    const entities = new Map<string, RegisteredEntity>();

    // 遍历所有 9 个 category 目录
    for (const category of CATEGORIES) {
      const categoryDir = path.join(buildDir, category);
      
      // 检查目录是否存在
      const dirExists = await this.directoryExists(categoryDir);
      if (!dirExists) {
        continue;
      }

      // 读取目录中的所有 YAML 文件
      const files = await this.listYamlFiles(categoryDir);
      
      for (const file of files) {
        const filePath = path.join(categoryDir, file);
        try {
          const entity = await this.loadEntity(filePath, category);
          entities.set(entity.id, entity);
        } catch (error) {
          // 如果单个文件加载失败，记录错误但继续加载其他文件
          if (error instanceof RegistryLoadError) {
            throw error;
          }
          throw new RegistryLoadError(
            `加载实体文件失败: ${file}`,
            filePath,
            undefined,
            error instanceof Error ? error : new Error(String(error))
          );
        }
      }
    }

    return entities;
  }

  /**
   * 加载单个实体文件
   */
  private async loadEntity(filePath: string, expectedCategory: Category): Promise<RegisteredEntity> {
    // 读取文件
    let content: string;
    try {
      content = await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      throw new RegistryLoadError(
        `无法读取实体文件: ${filePath}`,
        filePath,
        undefined,
        error instanceof Error ? error : new Error(String(error))
      );
    }

    // 解析 YAML
    let rawData: unknown;
    try {
      rawData = yaml.load(content);
    } catch (error) {
      const yamlError = error as yaml.YAMLException;
      throw new RegistryLoadError(
        `实体文件 YAML 格式不合法: ${yamlError.message}`,
        filePath,
        yamlError.mark ? { line: yamlError.mark.line + 1, column: yamlError.mark.column + 1 } : undefined,
        yamlError
      );
    }

    return this.parseRegisteredEntity(rawData, filePath, expectedCategory);
  }

  /**
   * 解析已注册实体
   */
  private parseRegisteredEntity(
    rawData: unknown,
    filePath: string,
    expectedCategory: Category
  ): RegisteredEntity {
    if (typeof rawData !== 'object' || rawData === null) {
      throw new RegistryLoadError('实体文件内容必须是一个对象', filePath);
    }

    const data = rawData as RawRegisteredEntity;

    // 验证 id
    if (typeof data.id !== 'string' || data.id.trim() === '') {
      throw new RegistryLoadError('实体文件缺少有效的 id 字段', filePath);
    }

    // 验证 category
    if (!isCategory(data.category)) {
      throw new RegistryLoadError(
        `实体文件的 category 必须是有效值: ${CATEGORIES.join(', ')}`,
        filePath
      );
    }
    if (data.category !== expectedCategory) {
      throw new RegistryLoadError(
        `实体 category (${data.category}) 与目录 (${expectedCategory}) 不匹配`,
        filePath
      );
    }

    // 验证 data
    if (typeof data.data !== 'object' || data.data === null) {
      throw new RegistryLoadError('实体文件缺少有效的 data 字段', filePath);
    }

    // 验证 archivedAt
    if (typeof data.archivedAt !== 'string') {
      throw new RegistryLoadError('实体文件缺少有效的 archivedAt 字段', filePath);
    }

    return {
      id: data.id,
      category: data.category,
      data: data.data as Submission,
      archivedAt: data.archivedAt,
    };
  }

  /**
   * 列出目录中的所有 YAML 文件
   */
  private async listYamlFiles(dir: string): Promise<string[]> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      return entries
        .filter(entry => entry.isFile() && (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml')))
        .map(entry => entry.name);
    } catch {
      return [];
    }
  }

  /**
   * 检查目录是否存在
   */
  private async directoryExists(dir: string): Promise<boolean> {
    try {
      const stat = await fs.stat(dir);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * 检查文件是否存在
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(filePath);
      return stat.isFile();
    } catch {
      return false;
    }
  }

  /**
   * 归档通过验证的 Submission
   * 将通过验证的 Submission 转换为标准化注册表格式并保存到 _build/<category>/ 目录
   */
  async archive(submission: Submission, buildDir: string): Promise<void> {
    // 获取 category（从 submission.template）
    const category = submission.template;
    
    // 创建 category 目录（如果不存在）
    const categoryDir = path.join(buildDir, category);
    await fs.mkdir(categoryDir, { recursive: true });
    
    // 生成归档时间戳
    const archivedAt = new Date().toISOString();
    
    // 转换为 RegisteredEntity 格式
    const registeredEntity: RegisteredEntity = {
      id: submission.id,
      category: category,
      archivedAt: archivedAt,
      data: submission,
    };
    
    // 生成 YAML 内容
    const yamlContent = yaml.dump(registeredEntity, {
      indent: 2,
      lineWidth: -1,  // 不自动换行
      quotingType: '"',
      forceQuotes: false,
    });
    
    // 保存到文件
    const filePath = path.join(categoryDir, `${submission.id}.yaml`);
    await fs.writeFile(filePath, yamlContent, 'utf-8');
    
    // 更新内部注册表状态
    if (!this.currentRegistry) {
      this.currentRegistry = createEmptyRegistry();
    }
    
    this.currentRegistry.entities.set(submission.id, registeredEntity);
    
    // 更新索引条目
    const versioning = submission.versioning;
    const indexEntry: IndexEntry = {
      id: submission.id,
      category: category,
      canon: versioning?.canon ?? false,
      priority: versioning?.priority ?? 'secondary',
      archivedAt: archivedAt,
    };
    
    // 检查是否已存在该 ID 的索引条目，如果存在则更新，否则添加
    const existingIndex = this.currentRegistry.index.entries.findIndex(e => e.id === submission.id);
    if (existingIndex >= 0) {
      this.currentRegistry.index.entries[existingIndex] = indexEntry;
    } else {
      this.currentRegistry.index.entries.push(indexEntry);
    }
    
    // 更新 lastUpdated
    this.currentRegistry.index.lastUpdated = archivedAt;
  }

  /**
   * 重建完整注册表
   * 从 submissions/ 目录重新构建完整的 _build/ 目录
   * 
   * 重建过程：
   * 1. 清除现有 _build/ 目录（如果存在）
   * 2. 扫描 submissions/ 下的所有 category 子目录
   * 3. 对于每个 category，读取所有 .yaml/.yml 文件（排除 _* 文件）
   * 4. 解析每个文件为 Submission
   * 5. 使用 archive() 方法归档每个 submission
   * 6. 使用 updateIndex() 更新索引文件
   */
  async rebuild(submissionsDir: string, buildDir: string): Promise<void> {
    // 1. 清除现有 _build/ 目录（确保幂等性）
    const buildDirExists = await this.directoryExists(buildDir);
    if (buildDirExists) {
      await fs.rm(buildDir, { recursive: true, force: true });
    }
    
    // 重置内部注册表状态
    this.currentRegistry = createEmptyRegistry();
    
    // 2. 检查 submissions 目录是否存在
    const submissionsDirExists = await this.directoryExists(submissionsDir);
    if (!submissionsDirExists) {
      // submissions 目录不存在，创建空的 _build 目录和索引
      await this.updateIndex(buildDir);
      return;
    }
    
    // 3. 扫描 submissions/ 下的所有 category 子目录
    for (const category of CATEGORIES) {
      const categoryDir = path.join(submissionsDir, category);
      
      // 检查 category 目录是否存在
      const categoryDirExists = await this.directoryExists(categoryDir);
      if (!categoryDirExists) {
        continue;
      }
      
      // 4. 读取所有 .yaml/.yml 文件（排除 _* 文件）
      const files = await this.listSubmissionYamlFiles(categoryDir);
      
      for (const file of files) {
        const filePath = path.join(categoryDir, file);
        
        try {
          // 5. 解析文件为 Submission
          const submission = await this.loadSubmissionFile(filePath);
          
          // 验证 submission 的 template 与目录 category 匹配
          if (submission.template !== category) {
            throw new RegistryLoadError(
              `Submission template (${submission.template}) 与目录 (${category}) 不匹配`,
              filePath
            );
          }
          
          // 6. 使用 archive() 方法归档
          await this.archive(submission, buildDir);
        } catch (error) {
          if (error instanceof RegistryLoadError) {
            throw error;
          }
          throw new RegistryLoadError(
            `加载 Submission 文件失败: ${file}`,
            filePath,
            undefined,
            error instanceof Error ? error : new Error(String(error))
          );
        }
      }
    }
    
    // 7. 更新索引文件
    await this.updateIndex(buildDir);
  }

  /**
   * 列出目录中的所有 Submission YAML 文件（排除 _* 文件）
   */
  private async listSubmissionYamlFiles(dir: string): Promise<string[]> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      return entries
        .filter(entry => {
          // 必须是文件
          if (!entry.isFile()) return false;
          // 必须是 .yaml 或 .yml 扩展名
          if (!entry.name.endsWith('.yaml') && !entry.name.endsWith('.yml')) return false;
          // 排除以 _ 开头的文件（如 _example.yaml）
          if (entry.name.startsWith('_')) return false;
          return true;
        })
        .map(entry => entry.name);
    } catch {
      return [];
    }
  }

  /**
   * 加载单个 Submission 文件
   */
  private async loadSubmissionFile(filePath: string): Promise<Submission> {
    // 读取文件
    let content: string;
    try {
      content = await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      throw new RegistryLoadError(
        `无法读取 Submission 文件: ${filePath}`,
        filePath,
        undefined,
        error instanceof Error ? error : new Error(String(error))
      );
    }

    // 解析 YAML
    let rawData: unknown;
    try {
      rawData = yaml.load(content);
    } catch (error) {
      const yamlError = error as yaml.YAMLException;
      throw new RegistryLoadError(
        `Submission 文件 YAML 格式不合法: ${yamlError.message}`,
        filePath,
        yamlError.mark ? { line: yamlError.mark.line + 1, column: yamlError.mark.column + 1 } : undefined,
        yamlError
      );
    }

    // 验证基本结构
    if (typeof rawData !== 'object' || rawData === null) {
      throw new RegistryLoadError('Submission 文件内容必须是一个对象', filePath);
    }

    const data = rawData as Record<string, unknown>;

    // 验证 template 字段
    if (!isCategory(data.template)) {
      throw new RegistryLoadError(
        `Submission 文件缺少有效的 template 字段，必须是: ${CATEGORIES.join(', ')}`,
        filePath
      );
    }

    // 验证 id 字段
    if (typeof data.id !== 'string' || data.id.trim() === '') {
      throw new RegistryLoadError('Submission 文件缺少有效的 id 字段', filePath);
    }

    return data as Submission;
  }

  /**
   * 获取注册表状态统计
   * 统计各 Category 的设定数量、正史/野史数量等
   */
  getStatus(): RegistryStatus {
    if (!this.currentRegistry) {
      return {
        totalCount: 0,
        byCategory: {
          character: 0,
          race: 0,
          creature: 0,
          flora: 0,
          location: 0,
          history: 0,
          faction: 0,
          artifact: 0,
          concept: 0,
        },
        canonCount: 0,
        nonCanonCount: 0,
        lastUpdated: new Date().toISOString(),
      };
    }

    const byCategory: Record<Category, number> = {
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

    let canonCount = 0;
    let nonCanonCount = 0;

    for (const entity of this.currentRegistry.entities.values()) {
      byCategory[entity.category]++;
      const versioning = entity.data.versioning;
      if (versioning?.canon) {
        canonCount++;
      } else {
        nonCanonCount++;
      }
    }

    return {
      totalCount: this.currentRegistry.entities.size,
      byCategory,
      canonCount,
      nonCanonCount,
      lastUpdated: this.currentRegistry.index.lastUpdated,
    };
  }

  /**
   * 更新索引文件
   * 将当前内部注册表状态写入 _build/_index.yaml
   */
  async updateIndex(buildDir: string): Promise<void> {
    // 创建 _build 目录（如果不存在）
    await fs.mkdir(buildDir, { recursive: true });
    
    // 获取当前时间戳
    const lastUpdated = new Date().toISOString();
    
    // 构建索引条目
    const entries: IndexEntry[] = [];
    
    if (this.currentRegistry) {
      for (const entity of this.currentRegistry.entities.values()) {
        const versioning = entity.data.versioning;
        entries.push({
          id: entity.id,
          category: entity.category,
          canon: versioning?.canon ?? true,  // 默认为 true（如果缺少 versioning）
          priority: versioning?.priority ?? 'official',  // 默认为 'official'（如果缺少 versioning）
          archivedAt: entity.archivedAt,
        });
      }
    }
    
    // 构建索引对象
    const indexData: RegistryIndex = {
      lastUpdated,
      entries,
    };
    
    // 生成 YAML 内容
    const yamlContent = yaml.dump(indexData, {
      indent: 2,
      lineWidth: -1,  // 不自动换行
      quotingType: '"',
      forceQuotes: false,
    });
    
    // 写入索引文件
    const indexPath = path.join(buildDir, '_index.yaml');
    await fs.writeFile(indexPath, yamlContent, 'utf-8');
    
    // 更新内部注册表的索引
    if (this.currentRegistry) {
      this.currentRegistry.index = indexData;
    }
  }
}

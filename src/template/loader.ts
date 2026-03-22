/**
 * Template Loader
 * 模板加载器 - 负责从 templates/ 目录加载模板定义
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import type {
  Category,
  TemplateDefinition,
  FieldDefinition,
  FieldType,
  FieldConstraint,
  Bilingual,
  ConstraintType,
  RangeValue,
} from '../types/index.js';
import { CATEGORIES, isCategory } from '../types/index.js';

/**
 * 模板加载器接口
 */
export interface TemplateLoader {
  /**
   * 加载所有模板定义
   * @param templatesDir 模板目录路径
   */
  loadTemplates(templatesDir: string): Promise<Map<Category, TemplateDefinition>>;

  /**
   * 加载单个模板定义
   * @param templatesDir 模板目录路径
   * @param category 模板类别
   */
  loadTemplate(templatesDir: string, category: Category): Promise<TemplateDefinition>;
}

/**
 * 模板加载错误
 */
export class TemplateLoadError extends Error {
  public readonly filePath: string;
  public readonly location?: { line?: number; column?: number };

  constructor(
    message: string,
    filePath: string,
    location?: { line?: number; column?: number },
    cause?: Error
  ) {
    super(message, { cause });
    this.name = 'TemplateLoadError';
    this.filePath = filePath;
    this.location = location;
  }

  /**
   * 格式化错误信息
   */
  override toString(): string {
    let msg = `[TemplateLoadError] ${this.message}`;
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
 * YAML 文件中的原始模板结构
 */
interface RawTemplateYaml {
  category?: unknown;
  description?: unknown;
  required?: unknown[];
  optional?: unknown[];
}

/**
 * YAML 文件中的原始字段定义
 */
interface RawFieldDefinition {
  name?: unknown;
  type?: unknown;
  description?: unknown;
  constraints?: unknown[];
  refCategory?: unknown;
}

/**
 * YAML 文件中的原始约束定义
 */
interface RawConstraint {
  type?: unknown;
  value?: unknown;
  errorCode?: unknown;
  errorMessage?: unknown;
}

/**
 * 创建模板加载器实例
 */
export function createTemplateLoader(): TemplateLoader {
  return new TemplateLoaderImpl();
}

/**
 * 模板加载器实现
 */
class TemplateLoaderImpl implements TemplateLoader {
  /**
   * 加载所有模板定义
   */
  async loadTemplates(templatesDir: string): Promise<Map<Category, TemplateDefinition>> {
    const templates = new Map<Category, TemplateDefinition>();

    for (const category of CATEGORIES) {
      try {
        const template = await this.loadTemplate(templatesDir, category);
        templates.set(category, template);
      } catch (error) {
        // 如果文件不存在，跳过该类别
        if (error instanceof TemplateLoadError) {
          const causeError = error.cause as Error | undefined;
          if (causeError?.message?.includes('ENOENT')) {
            continue;
          }
        }
        throw error;
      }
    }

    return templates;
  }

  /**
   * 加载单个模板定义
   */
  async loadTemplate(templatesDir: string, category: Category): Promise<TemplateDefinition> {
    const filePath = path.join(templatesDir, `${category}.yaml`);

    // 读取文件内容
    let content: string;
    try {
      content = await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      throw new TemplateLoadError(
        `无法读取模板文件: ${filePath}`,
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
      throw new TemplateLoadError(
        `YAML 格式不合法: ${yamlError.message}`,
        filePath,
        yamlError.mark ? { line: yamlError.mark.line + 1, column: yamlError.mark.column + 1 } : undefined,
        yamlError
      );
    }

    // 验证并转换为 TemplateDefinition
    return this.parseTemplateDefinition(rawData, filePath, category);
  }

  /**
   * 解析模板定义
   */
  private parseTemplateDefinition(
    rawData: unknown,
    filePath: string,
    expectedCategory: Category
  ): TemplateDefinition {
    if (typeof rawData !== 'object' || rawData === null) {
      throw new TemplateLoadError('模板文件内容必须是一个对象', filePath);
    }

    const data = rawData as RawTemplateYaml;

    // 验证 category
    if (data.category === undefined) {
      throw new TemplateLoadError('模板缺少 category 字段', filePath);
    }
    if (!isCategory(data.category)) {
      throw new TemplateLoadError(
        `无效的 category 值: ${String(data.category)}，有效值为: ${CATEGORIES.join(', ')}`,
        filePath
      );
    }
    if (data.category !== expectedCategory) {
      throw new TemplateLoadError(
        `模板 category (${data.category}) 与文件名 (${expectedCategory}) 不匹配`,
        filePath
      );
    }

    // 验证 description
    const description = this.parseBilingual(data.description, 'description', filePath);

    // 解析 required 字段
    const required = this.parseFieldDefinitions(data.required, 'required', filePath);

    // 解析 optional 字段
    const optional = this.parseFieldDefinitions(data.optional, 'optional', filePath);

    return {
      category: data.category,
      description,
      required,
      optional,
    };
  }

  /**
   * 解析双语字段
   */
  private parseBilingual(value: unknown, fieldName: string, filePath: string): Bilingual {
    if (typeof value !== 'object' || value === null) {
      throw new TemplateLoadError(`${fieldName} 字段必须是一个对象，包含 zh 和可选的 en 子字段`, filePath);
    }

    const obj = value as Record<string, unknown>;
    if (typeof obj['zh'] !== 'string') {
      throw new TemplateLoadError(`${fieldName}.zh 字段必须是字符串`, filePath);
    }
    if (obj['en'] !== undefined && typeof obj['en'] !== 'string') {
      throw new TemplateLoadError(`${fieldName}.en 字段必须是字符串`, filePath);
    }

    return {
      zh: obj['zh'],
      en: obj['en'] as string | undefined,
    };
  }

  /**
   * 解析字段定义数组
   */
  private parseFieldDefinitions(
    value: unknown,
    sectionName: string,
    filePath: string
  ): FieldDefinition[] {
    if (value === undefined || value === null) {
      return [];
    }

    if (!Array.isArray(value)) {
      throw new TemplateLoadError(`${sectionName} 字段必须是数组`, filePath);
    }

    return value.map((item, index) => this.parseFieldDefinition(item, `${sectionName}[${index}]`, filePath));
  }

  /**
   * 解析单个字段定义
   */
  private parseFieldDefinition(value: unknown, path: string, filePath: string): FieldDefinition {
    if (typeof value !== 'object' || value === null) {
      throw new TemplateLoadError(`${path} 必须是一个对象`, filePath);
    }

    const raw = value as RawFieldDefinition;

    // 验证 name
    if (typeof raw.name !== 'string' || raw.name.trim() === '') {
      throw new TemplateLoadError(`${path}.name 必须是非空字符串`, filePath);
    }

    // 验证 type
    if (typeof raw.type !== 'string') {
      throw new TemplateLoadError(`${path}.type 必须是字符串`, filePath);
    }
    const fieldType = this.parseFieldType(raw.type, `${path}.type`, filePath);

    // 验证 description
    const description = this.parseBilingual(raw.description, `${path}.description`, filePath);

    // 解析 constraints
    const constraints = this.parseConstraints(raw.constraints, `${path}.constraints`, filePath);

    // 解析 refCategory（可选）
    let refCategory: Category | undefined;
    if (raw.refCategory !== undefined) {
      if (!isCategory(raw.refCategory)) {
        throw new TemplateLoadError(
          `${path}.refCategory 必须是有效的 Category 值: ${CATEGORIES.join(', ')}`,
          filePath
        );
      }
      refCategory = raw.refCategory;
    }

    return {
      name: raw.name,
      type: fieldType,
      description,
      constraints: constraints.length > 0 ? constraints : undefined,
      refCategory,
    };
  }

  /**
   * 解析字段类型
   */
  private parseFieldType(value: string, path: string, filePath: string): FieldType {
    const validBaseTypes = ['string', 'integer', 'boolean', 'epoch_ref', 'entity_ref', 'bilingual', 'versioning'];

    if (validBaseTypes.includes(value)) {
      return value as FieldType;
    }

    // 检查数组类型 array<T>
    const arrayMatch = value.match(/^array<(.+)>$/);
    if (arrayMatch && arrayMatch[1]) {
      const innerType = arrayMatch[1];
      // 验证内部类型
      if (!validBaseTypes.includes(innerType) && !innerType.match(/^array<.+>$/)) {
        throw new TemplateLoadError(
          `${path} 的数组内部类型 "${innerType}" 无效，有效类型为: ${validBaseTypes.join(', ')}`,
          filePath
        );
      }
      return value as FieldType;
    }

    throw new TemplateLoadError(
      `${path} 的类型 "${value}" 无效，有效类型为: ${validBaseTypes.join(', ')}, array<T>`,
      filePath
    );
  }

  /**
   * 解析约束条件数组
   */
  private parseConstraints(value: unknown, path: string, filePath: string): FieldConstraint[] {
    if (value === undefined || value === null) {
      return [];
    }

    if (!Array.isArray(value)) {
      throw new TemplateLoadError(`${path} 必须是数组`, filePath);
    }

    return value.map((item, index) => this.parseConstraint(item, `${path}[${index}]`, filePath));
  }

  /**
   * 解析单个约束条件
   */
  private parseConstraint(value: unknown, path: string, filePath: string): FieldConstraint {
    if (typeof value !== 'object' || value === null) {
      throw new TemplateLoadError(`${path} 必须是一个对象`, filePath);
    }

    const raw = value as RawConstraint;

    // 验证 type
    const validConstraintTypes: ConstraintType[] = ['regex', 'enum', 'range', 'ref_exists'];
    if (typeof raw.type !== 'string' || !validConstraintTypes.includes(raw.type as ConstraintType)) {
      throw new TemplateLoadError(
        `${path}.type 必须是以下值之一: ${validConstraintTypes.join(', ')}`,
        filePath
      );
    }
    const constraintType = raw.type as ConstraintType;

    // 验证 value 根据 type
    const constraintValue = this.parseConstraintValue(raw.value, constraintType, `${path}.value`, filePath);

    // 验证 errorCode
    if (typeof raw.errorCode !== 'string' || raw.errorCode.trim() === '') {
      throw new TemplateLoadError(`${path}.errorCode 必须是非空字符串`, filePath);
    }

    // 验证 errorMessage
    const errorMessage = this.parseBilingual(raw.errorMessage, `${path}.errorMessage`, filePath);

    return {
      type: constraintType,
      value: constraintValue,
      errorCode: raw.errorCode,
      errorMessage,
    };
  }

  /**
   * 解析约束值
   */
  private parseConstraintValue(
    value: unknown,
    constraintType: ConstraintType,
    path: string,
    filePath: string
  ): string | string[] | RangeValue {
    switch (constraintType) {
      case 'regex':
      case 'ref_exists':
        if (typeof value !== 'string') {
          throw new TemplateLoadError(`${path} 对于 ${constraintType} 约束必须是字符串`, filePath);
        }
        return value;

      case 'enum':
        if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
          throw new TemplateLoadError(`${path} 对于 enum 约束必须是字符串数组`, filePath);
        }
        return value;

      case 'range':
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          throw new TemplateLoadError(`${path} 对于 range 约束必须是对象，包含 min 和/或 max 字段`, filePath);
        }
        const rangeObj = value as Record<string, unknown>;
        const rangeValue: RangeValue = {};
        if (rangeObj['min'] !== undefined) {
          if (typeof rangeObj['min'] !== 'number') {
            throw new TemplateLoadError(`${path}.min 必须是数字`, filePath);
          }
          rangeValue.min = rangeObj['min'];
        }
        if (rangeObj['max'] !== undefined) {
          if (typeof rangeObj['max'] !== 'number') {
            throw new TemplateLoadError(`${path}.max 必须是数字`, filePath);
          }
          rangeValue.max = rangeObj['max'];
        }
        return rangeValue;

      default:
        throw new TemplateLoadError(`未知的约束类型: ${constraintType}`, filePath);
    }
  }
}

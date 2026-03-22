/**
 * 核心类型定义
 * Core type definitions for WorldEngine template system
 */

// ============================================================================
// Category 设定类别
// ============================================================================

/**
 * 设定类别枚举
 * Category types for world settings
 */
export type Category =
  | 'character'  // 人物
  | 'race'       // 种族
  | 'creature'   // 动物
  | 'flora'      // 植物
  | 'location'   // 地理
  | 'history'    // 历史事件
  | 'faction'    // 势力（国家/组织/势力）
  | 'artifact'   // 神器
  | 'concept';   // 概念

/**
 * 所有有效的 Category 值列表
 */
export const CATEGORIES: readonly Category[] = [
  'character',
  'race',
  'creature',
  'flora',
  'location',
  'history',
  'faction',
  'artifact',
  'concept',
] as const;

// ============================================================================
// FieldType 字段类型
// ============================================================================

/**
 * 字段类型
 * Field types supported by the template system
 */
export type FieldType =
  | 'string'       // 字符串
  | 'integer'      // 整数
  | 'boolean'      // 布尔值
  | 'epoch_ref'    // 纪元引用
  | 'entity_ref'   // 实体引用（如 character, race）
  | 'bilingual'    // 双语字段 { zh, en? }
  | 'versioning'   // 版本信息字段组
  | `array<${string}>`; // 数组类型

// ============================================================================
// Bilingual 双语结构
// ============================================================================

/**
 * 双语字段结构
 * Bilingual field structure (zh required, en optional)
 */
export interface Bilingual {
  zh: string;
  en?: string;
}

// ============================================================================
// Versioning 版本信息
// ============================================================================

/**
 * 优先级枚举
 */
export type Priority = 'official' | 'secondary';

/**
 * 版本信息字段组
 * Versioning field group for canon/non-canon marking
 */
export interface Versioning {
  canon: boolean;       // true=正史, false=野史
  source: string;       // 来源作者 ID
  priority: Priority;   // official | secondary
}

// ============================================================================
// FieldConstraint 字段约束
// ============================================================================

/**
 * 约束类型
 */
export type ConstraintType = 'regex' | 'enum' | 'range' | 'ref_exists';

/**
 * 范围约束值
 */
export interface RangeValue {
  min?: number;
  max?: number;
}

/**
 * 字段约束定义
 * Field constraint definition
 */
export interface FieldConstraint {
  type: ConstraintType;
  value: string | string[] | RangeValue;
  errorCode: string;
  errorMessage: Bilingual;
}

// ============================================================================
// FieldDefinition 字段定义
// ============================================================================

/**
 * 字段定义
 * Field definition in a template
 */
export interface FieldDefinition {
  name: string;
  type: FieldType;
  description: Bilingual;
  constraints?: FieldConstraint[];
  /** 对于 entity_ref 类型，指定引用的实体类别 */
  refCategory?: Category;
}

// ============================================================================
// TemplateDefinition 模板定义
// ============================================================================

/**
 * 模板定义
 * Template definition for a category
 */
export interface TemplateDefinition {
  category: Category;
  description: Bilingual;
  required: FieldDefinition[];
  optional: FieldDefinition[];
}

// ============================================================================
// Submission 提交文件
// ============================================================================

/**
 * 提交文件基础结构
 * Base structure for submission files
 */
export interface Submission {
  template: Category;
  id: string;
  name?: Bilingual;
  versioning?: Versioning;
  [key: string]: unknown;
}

// ============================================================================
// ValidationResult 验证结果
// ============================================================================

/**
 * 验证错误位置
 */
export interface ValidationLocation {
  file: string;
  field: string;
  line?: number;
}

/**
 * 验证错误
 * Validation error (hard error that blocks CI)
 */
export interface ValidationError {
  code: string;
  message: Bilingual;
  location: ValidationLocation;
  relatedEntities?: string[];
}

/**
 * 验证警告
 * Validation warning (soft warning that doesn't block CI)
 */
export interface ValidationWarning {
  code: string;
  message: Bilingual;
  location: ValidationLocation;
}

/**
 * 验证结果
 * Validation result containing errors and warnings
 */
export interface ValidationResult {
  valid: boolean;
  hardErrors: ValidationError[];
  softWarnings: ValidationWarning[];
}

// ============================================================================
// TimePoint 时间点
// ============================================================================

/**
 * 时间点（纪元 + 年份）
 */
export interface TimePoint {
  epoch: string;  // 纪元 ID
  year: number;   // 纪元内年份
}

// ============================================================================
// Epoch 纪元
// ============================================================================

/**
 * 纪元定义
 */
export interface Epoch {
  id: string;
  name: Bilingual;
  order: number;
  duration: number;  // 纪元持续年数
}

/**
 * 纪元索引
 */
export interface EpochIndex {
  epochs: Epoch[];
}

// ============================================================================
// Registry 注册表
// ============================================================================

/**
 * 已注册实体
 */
export interface RegisteredEntity {
  id: string;
  category: Category;
  data: Submission;
  archivedAt: string;
}

/**
 * 索引条目
 */
export interface IndexEntry {
  id: string;
  category: Category;
  canon: boolean;
  priority: Priority;
  archivedAt: string;
}

/**
 * 注册表索引
 */
export interface RegistryIndex {
  entries: IndexEntry[];
  lastUpdated: string;
}

/**
 * 注册表
 */
export interface Registry {
  entities: Map<string, RegisteredEntity>;
  index: RegistryIndex;
}

/**
 * 注册表状态统计
 */
export interface RegistryStatus {
  totalCount: number;
  byCategory: Record<Category, number>;
  canonCount: number;
  nonCanonCount: number;
  lastUpdated: string;
}

// ============================================================================
// Error Codes 错误码
// ============================================================================

/**
 * 错误码常量
 */
export const ErrorCodes = {
  // YAML 和格式错误
  YAML_INVALID: 'ERR_YAML_INVALID',
  TEMPLATE_MISSING: 'ERR_TEMPLATE_MISSING',
  TEMPLATE_UNKNOWN: 'ERR_TEMPLATE_UNKNOWN',
  
  // 字段验证错误
  FIELD_REQUIRED: 'ERR_FIELD_REQUIRED',
  FIELD_TYPE: 'ERR_FIELD_TYPE',
  
  // 约束验证错误
  CONSTRAINT_REGEX: 'ERR_CONSTRAINT_REGEX',
  CONSTRAINT_ENUM: 'ERR_CONSTRAINT_ENUM',
  CONSTRAINT_RANGE: 'ERR_CONSTRAINT_RANGE',
  
  // 引用验证错误
  REF_MISSING: 'ERR_REF_MISSING',
  REF_EPOCH: 'ERR_REF_EPOCH',
  
  // 交叉验证错误
  LIFESPAN_EXCEED: 'ERR_LIFESPAN_EXCEED',
  TIME_ORDER: 'ERR_TIME_ORDER',
  LIFESPAN_MISMATCH: 'ERR_LIFESPAN_MISMATCH',
  EVENT_LIFETIME: 'ERR_EVENT_LIFETIME',
  CANON_DUPLICATE: 'ERR_CANON_DUPLICATE',
  FACTION_EPOCH_OVERLAP: 'ERR_FACTION_EPOCH_OVERLAP',
  
  // CI 保护错误
  OUTPUT_MODIFIED: 'ERR_OUTPUT_MODIFIED',
  ID_DUPLICATE: 'ERR_ID_DUPLICATE',
} as const;

/**
 * 警告码常量
 */
export const WarningCodes = {
  FIELD_UNKNOWN: 'WARN_FIELD_UNKNOWN',
  EN_MISSING: 'WARN_EN_MISSING',
  REF_MISSING: 'WARN_REF_MISSING',      // 野史模式下的引用警告
  EVENT_LIFETIME: 'WARN_EVENT_LIFETIME', // 野史模式下的事件生命周期警告
} as const;

// ============================================================================
// Type Guards 类型守卫
// ============================================================================

/**
 * 检查值是否为有效的 Category
 */
export function isCategory(value: unknown): value is Category {
  return typeof value === 'string' && CATEGORIES.includes(value as Category);
}

/**
 * 检查值是否为有效的双语结构
 */
export function isBilingual(value: unknown): value is Bilingual {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return typeof obj['zh'] === 'string' && (obj['en'] === undefined || typeof obj['en'] === 'string');
}

/**
 * 检查值是否为有效的版本信息
 */
export function isVersioning(value: unknown): value is Versioning {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj['canon'] === 'boolean' &&
    typeof obj['source'] === 'string' &&
    (obj['priority'] === 'official' || obj['priority'] === 'secondary')
  );
}

/**
 * 检查值是否为有效的范围约束值
 */
export function isRangeValue(value: unknown): value is RangeValue {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  const hasMin = obj['min'] === undefined || typeof obj['min'] === 'number';
  const hasMax = obj['max'] === undefined || typeof obj['max'] === 'number';
  return hasMin && hasMax;
}

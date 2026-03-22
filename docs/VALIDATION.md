# 验证规则 / Validation Rules

[English](#english) | [中文](#中文)

---

## 中文

本文档详细说明 WorldEngine 系统的验证规则和错误码含义。

### 验证流程

CI 管线按以下顺序执行验证：

1. **输出目录保护检查** - 确保 `_build/` 目录未被手动修改
2. **模板格式校验** - 验证 YAML 格式和模板声明
3. **必填项校验** - 检查所有必填字段是否存在
4. **字段类型校验** - 验证字段值类型是否正确
5. **约束条件校验** - 验证正则、枚举、范围等约束
6. **交叉引用验证** - 检查实体引用的完整性和一致性

### 错误码参考

#### 格式错误 (Format Errors)

| 错误码 | 说明 | 修复方法 |
|--------|------|----------|
| `ERR_YAML_INVALID` | YAML 格式无效 | 检查 YAML 语法，确保缩进正确 |
| `ERR_TEMPLATE_MISSING` | 缺少 template 字段 | 添加 `template: <category>` 字段 |
| `ERR_TEMPLATE_INVALID` | template 值无效 | 使用有效的 category 名称 |
| `ERR_ID_MISSING` | 缺少 id 字段 | 添加 `id: <unique-id>` 字段 |
| `ERR_ID_DUPLICATE` | ID 重复 | 使用唯一的 ID |

#### 必填项错误 (Required Field Errors)

| 错误码 | 说明 | 修复方法 |
|--------|------|----------|
| `ERR_REQUIRED_MISSING` | 缺少必填字段 | 添加缺失的必填字段 |

#### 类型错误 (Type Errors)

| 错误码 | 说明 | 修复方法 |
|--------|------|----------|
| `ERR_TYPE_STRING` | 字段应为字符串 | 使用字符串值 |
| `ERR_TYPE_INTEGER` | 字段应为整数 | 使用整数值 |
| `ERR_TYPE_BOOLEAN` | 字段应为布尔值 | 使用 `true` 或 `false` |
| `ERR_TYPE_BILINGUAL` | 字段应为双语对象 | 使用 `{ zh: "...", en: "..." }` 格式 |
| `ERR_TYPE_ARRAY` | 字段应为数组 | 使用数组格式 `[...]` |
| `ERR_TYPE_VERSIONING` | versioning 格式错误 | 使用正确的 versioning 结构 |

#### 约束错误 (Constraint Errors)

| 错误码 | 说明 | 修复方法 |
|--------|------|----------|
| `ERR_CONSTRAINT_REGEX` | 不符合正则表达式约束 | 按照指定格式填写 |
| `ERR_CONSTRAINT_ENUM` | 不在枚举值范围内 | 使用允许的枚举值 |
| `ERR_CONSTRAINT_RANGE` | 不在数值范围内 | 使用范围内的数值 |

#### 引用错误 (Reference Errors)

| 错误码 | 说明 | 修复方法 |
|--------|------|----------|
| `ERR_REF_MISSING` | 引用的实体不存在 | 确保被引用的实体已创建并通过验证 |
| `ERR_REF_EPOCH` | 引用的纪元不存在 | 确保纪元 ID 在 `world/epochs/_index.yaml` 中定义 |
| `ERR_REF_CATEGORY` | 引用的实体类别不匹配 | 使用正确类别的实体 ID |

#### 寿命错误 (Lifespan Errors)

| 错误码 | 说明 | 修复方法 |
|--------|------|----------|
| `ERR_LIFESPAN_EXCEED` | 人物寿命超过种族平均寿命的 150% | 调整人物寿命或种族平均寿命 |

#### 时间线错误 (Timeline Errors)

| 错误码 | 说明 | 修复方法 |
|--------|------|----------|
| `ERR_TIMELINE_INVALID` | 时间线不一致 | 检查时间顺序和生命周期 |
| `ERR_TIMELINE_DEATH_BEFORE_BIRTH` | 死亡时间早于出生时间 | 修正死亡时间 |
| `ERR_TIMELINE_EVENT_ORDER` | 事件结束时间早于起始时间 | 修正事件时间 |
| `ERR_TIMELINE_PARTICIPANT` | 事件时间不在参与人物生命周期内 | 调整事件时间或参与人物 |
| `ERR_LIFESPAN_MISMATCH` | 寿命计算与生死时间不一致 | 确保 lifespan = death_year - birth_year（±5年误差） |

#### 势力错误 (Faction Errors)

| 错误码 | 说明 | 修复方法 |
|--------|------|----------|
| `ERR_FACTION_OVERLAP` | 同名势力在多个纪元下的设定重叠 | 确保同名势力的纪元不重叠 |

#### 正史/野史错误 (Canon Errors)

| 错误码 | 说明 | 修复方法 |
|--------|------|----------|
| `ERR_CANON_DUPLICATE` | 同一事件 ID 有多个正史版本 | 只保留一个 `canon: true` 版本 |

#### 输出保护错误 (Output Protection Errors)

| 错误码 | 说明 | 修复方法 |
|--------|------|----------|
| `ERR_OUTPUT_MODIFIED` | `_build/` 目录被手动修改 | 撤销对 `_build/` 目录的修改 |

### 警告码参考

| 警告码 | 说明 | 建议 |
|--------|------|------|
| `WARN_FIELD_UNKNOWN` | 存在模板未定义的字段 | 检查字段名是否拼写正确 |
| `WARN_REF_NONCANON` | 野史设定引用了不存在的实体 | 可忽略，野史允许引用虚构实体 |

### 交叉验证规则详解

#### 实体引用验证

- 所有 `entity_ref` 类型字段必须引用已存在的实体
- 对于 `canon: true` 的设定，引用必须严格存在
- 对于 `canon: false` 的设定，引用验证放宽（仅警告）

#### 人物寿命验证

```
人物寿命 ≤ 种族平均寿命 × 150%
```

例如：人类平均寿命 80 年，则人物寿命不应超过 120 年。

#### 时间线验证

1. **人物生死顺序**：`death_year` > `birth_year`（考虑跨纪元）
2. **事件时间顺序**：`end_year` > `start_year`（考虑跨纪元）
3. **参与人物生命周期**：事件时间必须在所有参与人物的生命周期内
4. **寿命一致性**：`lifespan` ≈ `death_year - birth_year`（±5年误差）

#### 势力纪元验证

同一势力名称在不同纪元下的设定不能时间重叠。

#### 正史唯一性验证

同一事件 ID 最多只能有一个 `canon: true` 版本。

---

## English

This document details the validation rules and error codes in the WorldEngine system.

### Validation Flow

The CI pipeline executes validation in the following order:

1. **Output Directory Protection** - Ensures `_build/` directory hasn't been manually modified
2. **Template Format Validation** - Validates YAML format and template declaration
3. **Required Field Validation** - Checks all required fields are present
4. **Field Type Validation** - Validates field value types
5. **Constraint Validation** - Validates regex, enum, range constraints
6. **Cross-Reference Validation** - Checks entity reference integrity and consistency

### Error Code Reference

#### Format Errors

| Error Code | Description | Fix |
|------------|-------------|-----|
| `ERR_YAML_INVALID` | Invalid YAML format | Check YAML syntax, ensure proper indentation |
| `ERR_TEMPLATE_MISSING` | Missing template field | Add `template: <category>` field |
| `ERR_TEMPLATE_INVALID` | Invalid template value | Use a valid category name |
| `ERR_ID_MISSING` | Missing id field | Add `id: <unique-id>` field |
| `ERR_ID_DUPLICATE` | Duplicate ID | Use a unique ID |

#### Required Field Errors

| Error Code | Description | Fix |
|------------|-------------|-----|
| `ERR_REQUIRED_MISSING` | Missing required field | Add the missing required field |

#### Type Errors

| Error Code | Description | Fix |
|------------|-------------|-----|
| `ERR_TYPE_STRING` | Field should be string | Use a string value |
| `ERR_TYPE_INTEGER` | Field should be integer | Use an integer value |
| `ERR_TYPE_BOOLEAN` | Field should be boolean | Use `true` or `false` |
| `ERR_TYPE_BILINGUAL` | Field should be bilingual object | Use `{ zh: "...", en: "..." }` format |
| `ERR_TYPE_ARRAY` | Field should be array | Use array format `[...]` |
| `ERR_TYPE_VERSIONING` | Invalid versioning format | Use correct versioning structure |

#### Constraint Errors

| Error Code | Description | Fix |
|------------|-------------|-----|
| `ERR_CONSTRAINT_REGEX` | Doesn't match regex constraint | Follow the specified format |
| `ERR_CONSTRAINT_ENUM` | Not in enum values | Use an allowed enum value |
| `ERR_CONSTRAINT_RANGE` | Not in numeric range | Use a value within range |

#### Reference Errors

| Error Code | Description | Fix |
|------------|-------------|-----|
| `ERR_REF_MISSING` | Referenced entity doesn't exist | Ensure referenced entity is created and validated |
| `ERR_REF_EPOCH` | Referenced epoch doesn't exist | Ensure epoch ID is defined in `world/epochs/_index.yaml` |
| `ERR_REF_CATEGORY` | Referenced entity category mismatch | Use entity ID of correct category |

#### Lifespan Errors

| Error Code | Description | Fix |
|------------|-------------|-----|
| `ERR_LIFESPAN_EXCEED` | Character lifespan exceeds 150% of race average | Adjust character lifespan or race average |

#### Timeline Errors

| Error Code | Description | Fix |
|------------|-------------|-----|
| `ERR_TIMELINE_INVALID` | Timeline inconsistency | Check time order and lifecycles |
| `ERR_TIMELINE_DEATH_BEFORE_BIRTH` | Death time before birth time | Correct death time |
| `ERR_TIMELINE_EVENT_ORDER` | Event end time before start time | Correct event times |
| `ERR_TIMELINE_PARTICIPANT` | Event time outside participant's lifespan | Adjust event time or participants |
| `ERR_LIFESPAN_MISMATCH` | Lifespan calculation inconsistent with birth/death | Ensure lifespan ≈ death_year - birth_year (±5 years) |

#### Faction Errors

| Error Code | Description | Fix |
|------------|-------------|-----|
| `ERR_FACTION_OVERLAP` | Same-named faction settings overlap across epochs | Ensure same-named factions don't overlap in time |

#### Canon Errors

| Error Code | Description | Fix |
|------------|-------------|-----|
| `ERR_CANON_DUPLICATE` | Multiple canon versions of same event ID | Keep only one `canon: true` version |

#### Output Protection Errors

| Error Code | Description | Fix |
|------------|-------------|-----|
| `ERR_OUTPUT_MODIFIED` | `_build/` directory manually modified | Revert changes to `_build/` directory |

### Warning Code Reference

| Warning Code | Description | Suggestion |
|--------------|-------------|------------|
| `WARN_FIELD_UNKNOWN` | Field not defined in template | Check if field name is spelled correctly |
| `WARN_REF_NONCANON` | Non-canon setting references non-existent entity | Can be ignored, non-canon allows fictional references |

### Cross-Validation Rules Explained

#### Entity Reference Validation

- All `entity_ref` type fields must reference existing entities
- For `canon: true` settings, references must strictly exist
- For `canon: false` settings, reference validation is relaxed (warning only)

#### Character Lifespan Validation

```
Character lifespan ≤ Race average lifespan × 150%
```

Example: Human average lifespan is 80 years, so character lifespan shouldn't exceed 120 years.

#### Timeline Validation

1. **Character birth/death order**: `death_year` > `birth_year` (considering cross-epoch)
2. **Event time order**: `end_year` > `start_year` (considering cross-epoch)
3. **Participant lifecycle**: Event time must fall within all participants' lifespans
4. **Lifespan consistency**: `lifespan` ≈ `death_year - birth_year` (±5 years tolerance)

#### Faction Epoch Validation

Same-named faction settings across different epochs cannot overlap in time.

#### Canon Uniqueness Validation

Each event ID can have at most one `canon: true` version.

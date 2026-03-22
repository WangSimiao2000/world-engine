# 版本系统 / Versioning System

[English](#english) | [中文](#中文)

---

## 中文

本文档说明 WorldEngine 的正史/野史版本系统。

### 概述

WorldEngine 支持同一设定的多个版本，通过 `versioning` 字段区分正史（canon）和野史（non-canon）内容。这允许：

- 官方设定与同人创作共存
- 同一事件的不同叙述版本
- 实验性设定的安全测试

### versioning 字段结构

```yaml
versioning:
  canon: true          # true=正史, false=野史
  source: "author-id"  # 来源作者 ID
  priority: official   # official（官方）| secondary（二次创作）
```

#### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `canon` | boolean | 是 | `true` 表示正史，`false` 表示野史 |
| `source` | string | 是 | 来源作者或创作者的标识符 |
| `priority` | string | 是 | `official`（官方）或 `secondary`（二次创作） |

### 正史 (Canon)

正史是世界观的官方设定，具有以下特点：

#### 验证规则

1. **唯一性**：同一事件 ID 最多只能有一个正史版本
2. **严格引用**：所有实体引用必须存在
3. **时间线一致**：必须通过完整的时间线验证
4. **寿命检查**：人物寿命必须符合种族限制

#### 使用场景

- 官方世界观设定
- 核心故事线
- 基础设定（种族、地理等）

#### 示例

```yaml
template: character
id: char-hero-main

name:
  zh: "主角"
  en: "Protagonist"

race: race-human
birth_epoch: epoch-third-age
birth_year: 1250
lifespan: 75

versioning:
  canon: true
  source: "author-main"
  priority: official
```

### 野史 (Non-Canon)

野史是非官方或实验性设定，验证规则更宽松：

#### 验证规则

1. **允许重复**：同一事件 ID 可以有多个野史版本
2. **放宽引用**：引用不存在的实体只产生警告，不阻止提交
3. **简化时间线**：仅执行基本格式校验，不执行严格时间线检查
4. **寿命放宽**：寿命检查仅产生警告

#### 使用场景

- 同人创作
- "如果...会怎样"的假设情节
- 实验性设定
- 草稿版本

#### 示例

```yaml
template: history
id: event-what-if-war

name:
  zh: "假如战争没有发生"
  en: "What If the War Never Happened"

start_epoch: epoch-third-age
start_year: 1280

participants:
  - char-hero-main
  - char-fictional-ally  # 可以引用不存在的实体

versioning:
  canon: false
  source: "fan-author-001"
  priority: secondary

description:
  zh: "一个假设性的历史分支，探讨如果战争没有发生会怎样。"
  en: "A hypothetical historical branch exploring what would happen if the war never occurred."
```

### 优先级 (Priority)

`priority` 字段用于区分内容来源：

| 值 | 说明 | 典型用途 |
|----|------|----------|
| `official` | 官方内容 | 核心设定、官方故事 |
| `secondary` | 二次创作 | 同人作品、衍生内容 |

### 最佳实践

#### 1. 正史设定

- 确保所有引用的实体已存在
- 仔细检查时间线一致性
- 使用 `canon: true` 和 `priority: official`

#### 2. 野史设定

- 明确标记为 `canon: false`
- 使用 `priority: secondary` 表示二次创作
- 在描述中说明这是假设性内容

#### 3. 版本管理

- 同一事件的不同版本使用相同的 `id`
- 只有一个版本可以是 `canon: true`
- 野史版本可以有多个

### 验证差异对比

| 验证项 | 正史 (canon: true) | 野史 (canon: false) |
|--------|-------------------|---------------------|
| 实体引用 | 必须存在（错误） | 可以不存在（警告） |
| 时间线检查 | 严格验证 | 基本格式检查 |
| 寿命检查 | 必须符合（错误） | 可以超出（警告） |
| 唯一性 | 同 ID 只能有一个 | 同 ID 可以有多个 |

---

## English

This document explains the WorldEngine canon/non-canon versioning system.

### Overview

WorldEngine supports multiple versions of the same setting, distinguished by the `versioning` field for canon and non-canon content. This allows:

- Official settings and fan creations to coexist
- Different narrative versions of the same event
- Safe testing of experimental settings

### versioning Field Structure

```yaml
versioning:
  canon: true          # true=canon, false=non-canon
  source: "author-id"  # Source author ID
  priority: official   # official | secondary
```

#### Field Descriptions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `canon` | boolean | Yes | `true` for canon, `false` for non-canon |
| `source` | string | Yes | Source author or creator identifier |
| `priority` | string | Yes | `official` or `secondary` |

### Canon

Canon is the official world-building setting with the following characteristics:

#### Validation Rules

1. **Uniqueness**: Each event ID can have at most one canon version
2. **Strict References**: All entity references must exist
3. **Timeline Consistency**: Must pass complete timeline validation
4. **Lifespan Check**: Character lifespan must comply with race limits

#### Use Cases

- Official world-building settings
- Core storylines
- Base settings (races, geography, etc.)

#### Example

```yaml
template: character
id: char-hero-main

name:
  zh: "主角"
  en: "Protagonist"

race: race-human
birth_epoch: epoch-third-age
birth_year: 1250
lifespan: 75

versioning:
  canon: true
  source: "author-main"
  priority: official
```

### Non-Canon

Non-canon is unofficial or experimental settings with relaxed validation:

#### Validation Rules

1. **Duplicates Allowed**: Same event ID can have multiple non-canon versions
2. **Relaxed References**: References to non-existent entities only produce warnings
3. **Simplified Timeline**: Only basic format validation, no strict timeline checks
4. **Relaxed Lifespan**: Lifespan checks only produce warnings

#### Use Cases

- Fan creations
- "What if" hypothetical scenarios
- Experimental settings
- Draft versions

#### Example

```yaml
template: history
id: event-what-if-war

name:
  zh: "假如战争没有发生"
  en: "What If the War Never Happened"

start_epoch: epoch-third-age
start_year: 1280

participants:
  - char-hero-main
  - char-fictional-ally  # Can reference non-existent entities

versioning:
  canon: false
  source: "fan-author-001"
  priority: secondary

description:
  zh: "一个假设性的历史分支"
  en: "A hypothetical historical branch"
```

### Priority

The `priority` field distinguishes content sources:

| Value | Description | Typical Use |
|-------|-------------|-------------|
| `official` | Official content | Core settings, official stories |
| `secondary` | Fan creation | Fan works, derivative content |

### Best Practices

#### 1. Canon Settings

- Ensure all referenced entities exist
- Carefully check timeline consistency
- Use `canon: true` and `priority: official`

#### 2. Non-Canon Settings

- Clearly mark as `canon: false`
- Use `priority: secondary` for fan creations
- Explain in description that this is hypothetical content

#### 3. Version Management

- Different versions of the same event use the same `id`
- Only one version can be `canon: true`
- Multiple non-canon versions are allowed

### Validation Comparison

| Validation | Canon (canon: true) | Non-Canon (canon: false) |
|------------|---------------------|--------------------------|
| Entity References | Must exist (error) | Can be missing (warning) |
| Timeline Check | Strict validation | Basic format check |
| Lifespan Check | Must comply (error) | Can exceed (warning) |
| Uniqueness | Only one per ID | Multiple per ID allowed |

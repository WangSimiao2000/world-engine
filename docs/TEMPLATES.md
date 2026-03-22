# 模板参考 / Template Reference

[English](#english) | [中文](#中文)

---

## 中文

本文档详细说明 WorldEngine 系统支持的所有模板类型及其字段定义。

### 字段类型说明

| 类型 | 说明 | 示例 |
|------|------|------|
| `string` | 字符串 | `"char-hero"` |
| `integer` | 正整数 | `100` |
| `boolean` | 布尔值 | `true` / `false` |
| `bilingual` | 双语文本（zh 必填，en 选填） | `{ zh: "中文", en: "English" }` |
| `entity_ref` | 实体引用 ID | `"race-human"` |
| `epoch_ref` | 纪元引用 ID | `"epoch-first-age"` |
| `versioning` | 版本信息对象 | 见下方说明 |
| `array<T>` | T 类型的数组 | `["item1", "item2"]` |

#### versioning 字段结构

```yaml
versioning:
  canon: true          # true=正史, false=野史
  source: "author-id"  # 来源作者 ID
  priority: official   # official（官方）| secondary（二次创作）
```

---

### 1. 人物模板 (character)

用于定义世界观中的角色设定。

#### 必填项

| 字段 | 类型 | 说明 | 约束 |
|------|------|------|------|
| `id` | string | 唯一标识符 | 格式: `char-<name>` |
| `name` | bilingual | 角色名称 | zh 必填 |
| `race` | entity_ref | 所属种族 ID | 必须引用已存在的种族 |
| `birth_epoch` | epoch_ref | 出生纪元 ID | 必须引用已存在的纪元 |
| `birth_year` | integer | 出生年份（纪元内） | ≥ 1 |
| `lifespan` | integer | 寿命（年） | ≥ 1 |
| `versioning` | versioning | 版本信息 | - |

#### 选填项

| 字段 | 类型 | 说明 |
|------|------|------|
| `death_epoch` | epoch_ref | 死亡纪元 ID（未填写表示仍存活） |
| `death_year` | integer | 死亡年份（纪元内） |
| `description` | bilingual | 角色描述 |
| `prose` | bilingual | 叙事散文（Markdown 格式） |
| `faction` | entity_ref | 所属势力 ID |
| `artifacts` | array<entity_ref> | 持有的神器 ID 列表 |

---

### 2. 种族模板 (race)

用于定义世界观中的种族设定。

#### 必填项

| 字段 | 类型 | 说明 | 约束 |
|------|------|------|------|
| `id` | string | 唯一标识符 | 格式: `race-<name>` |
| `name` | bilingual | 种族名称 | zh 必填 |
| `average_lifespan` | integer | 平均寿命（年） | ≥ 1 |
| `habitat` | bilingual | 栖息地描述 | - |

#### 选填项

| 字段 | 类型 | 说明 |
|------|------|------|
| `description` | bilingual | 种族描述 |
| `prose` | bilingual | 叙事散文（Markdown 格式） |
| `traits` | array<string> | 种族特征列表 |
| `origin_epoch` | epoch_ref | 起源纪元 ID |
| `versioning` | versioning | 版本信息 |

---

### 3. 动物模板 (creature)

用于定义世界观中的动物和生物设定。

#### 必填项

| 字段 | 类型 | 说明 | 约束 |
|------|------|------|------|
| `id` | string | 唯一标识符 | 格式: `creature-<name>` |
| `name` | bilingual | 生物名称 | zh 必填 |

#### 选填项

| 字段 | 类型 | 说明 | 约束 |
|------|------|------|------|
| `description` | bilingual | 生物描述 | - |
| `prose` | bilingual | 叙事散文 | - |
| `habitat` | bilingual | 栖息地描述 | - |
| `average_lifespan` | integer | 平均寿命（年） | ≥ 1 |
| `danger_level` | string | 危险等级 | harmless/low/medium/high/extreme |
| `locations` | array<entity_ref> | 出没地点 ID 列表 | - |
| `versioning` | versioning | 版本信息 | - |

---

### 4. 植物模板 (flora)

用于定义世界观中的植物设定。

#### 必填项

| 字段 | 类型 | 说明 | 约束 |
|------|------|------|------|
| `id` | string | 唯一标识符 | 格式: `flora-<name>` |
| `name` | bilingual | 植物名称 | zh 必填 |

#### 选填项

| 字段 | 类型 | 说明 | 约束 |
|------|------|------|------|
| `description` | bilingual | 植物描述 | - |
| `prose` | bilingual | 叙事散文 | - |
| `habitat` | bilingual | 生长环境描述 | - |
| `properties` | array<string> | 植物特性列表 | - |
| `rarity` | string | 稀有度 | common/uncommon/rare/legendary/mythical |
| `locations` | array<entity_ref> | 生长地点 ID 列表 | - |
| `versioning` | versioning | 版本信息 | - |

---

### 5. 地理模板 (location)

用于定义世界观中的地理位置设定。

#### 必填项

| 字段 | 类型 | 说明 | 约束 |
|------|------|------|------|
| `id` | string | 唯一标识符 | 格式: `loc-<name>` |
| `name` | bilingual | 地点名称 | zh 必填 |
| `region` | bilingual | 所属区域 | - |
| `epoch` | epoch_ref | 所属纪元 ID | 必须引用已存在的纪元 |

#### 选填项

| 字段 | 类型 | 说明 | 约束 |
|------|------|------|------|
| `description` | bilingual | 地点描述 | - |
| `prose` | bilingual | 叙事散文 | - |
| `location_type` | string | 地点类型 | city/village/mountain/river/forest/desert/ocean/island/plain/ruins/sacred/other |
| `controlling_faction` | entity_ref | 控制势力 ID | - |
| `parent_location` | entity_ref | 上级地点 ID | - |
| `versioning` | versioning | 版本信息 | - |

---

### 6. 历史事件模板 (history)

用于定义世界观中的历史事件设定。

#### 必填项

| 字段 | 类型 | 说明 | 约束 |
|------|------|------|------|
| `id` | string | 唯一标识符 | 格式: `event-<name>` |
| `name` | bilingual | 事件名称 | zh 必填 |
| `start_epoch` | epoch_ref | 起始纪元 ID | 必须引用已存在的纪元 |
| `start_year` | integer | 起始年份（纪元内） | ≥ 1 |
| `participants` | array<entity_ref> | 参与人物 ID 列表 | 必须引用已存在的人物 |
| `versioning` | versioning | 版本信息 | - |

#### 选填项

| 字段 | 类型 | 说明 | 约束 |
|------|------|------|------|
| `end_epoch` | epoch_ref | 结束纪元 ID | - |
| `end_year` | integer | 结束年份（纪元内） | ≥ 1 |
| `description` | bilingual | 事件描述 | - |
| `prose` | bilingual | 叙事散文 | - |
| `locations` | array<entity_ref> | 发生地点 ID 列表 | - |
| `factions` | array<entity_ref> | 相关势力 ID 列表 | - |
| `artifacts` | array<entity_ref> | 相关神器 ID 列表 | - |
| `event_type` | string | 事件类型 | war/treaty/discovery/creation/destruction/migration/founding/death/birth/other |

---

### 7. 势力模板 (faction)

用于定义世界观中的国家、组织和势力设定。

#### 必填项

| 字段 | 类型 | 说明 | 约束 |
|------|------|------|------|
| `id` | string | 唯一标识符 | 格式: `faction-<name>` |
| `name` | bilingual | 势力名称 | zh 必填 |
| `epoch` | epoch_ref | 所属纪元 ID | 必须引用已存在的纪元 |
| `faction_type` | string | 势力类型 | nation/kingdom/empire/tribe/clan/guild/order/sect/alliance/other |
| `active_status` | boolean | 是否仍活跃 | true=活跃, false=已消亡 |

#### 选填项

| 字段 | 类型 | 说明 |
|------|------|------|
| `description` | bilingual | 势力描述 |
| `prose` | bilingual | 叙事散文 |
| `founding_year` | integer | 建立年份（纪元内） |
| `dissolution_year` | integer | 消亡年份（纪元内） |
| `leader` | entity_ref | 领袖人物 ID |
| `headquarters` | entity_ref | 总部地点 ID |
| `territories` | array<entity_ref> | 控制领土 ID 列表 |
| `allies` | array<entity_ref> | 盟友势力 ID 列表 |
| `enemies` | array<entity_ref> | 敌对势力 ID 列表 |
| `versioning` | versioning | 版本信息 |

---

### 8. 神器模板 (artifact)

用于定义世界观中的神器和宝物设定。

#### 必填项

| 字段 | 类型 | 说明 | 约束 |
|------|------|------|------|
| `id` | string | 唯一标识符 | 格式: `artifact-<name>` |
| `name` | bilingual | 神器名称 | zh 必填 |

#### 选填项

| 字段 | 类型 | 说明 | 约束 |
|------|------|------|------|
| `description` | bilingual | 神器描述 | - |
| `prose` | bilingual | 叙事散文 | - |
| `artifact_type` | string | 神器类型 | weapon/armor/accessory/tool/container/vehicle/structure/other |
| `rarity` | string | 稀有度 | common/uncommon/rare/legendary/mythical/divine |
| `powers` | array<string> | 神器能力列表 | - |
| `creator` | entity_ref | 创造者人物 ID | - |
| `creation_epoch` | epoch_ref | 创造纪元 ID | - |
| `creation_year` | integer | 创造年份（纪元内） | ≥ 1 |
| `current_owner` | entity_ref | 当前持有者人物 ID | - |
| `current_location` | entity_ref | 当前所在地点 ID | - |
| `previous_owners` | array<entity_ref> | 历任持有者人物 ID 列表 | - |
| `versioning` | versioning | 版本信息 | - |

---

### 9. 概念模板 (concept)

用于定义世界观中的抽象概念设定（如魔法体系、宗教信仰、社会制度等）。

#### 必填项

| 字段 | 类型 | 说明 | 约束 |
|------|------|------|------|
| `id` | string | 唯一标识符 | 格式: `concept-<name>` |
| `name` | bilingual | 概念名称 | zh 必填 |

#### 选填项

| 字段 | 类型 | 说明 | 约束 |
|------|------|------|------|
| `description` | bilingual | 概念描述 | - |
| `prose` | bilingual | 叙事散文 | - |
| `concept_type` | string | 概念类型 | magic/religion/philosophy/technology/social/political/economic/cultural/other |
| `related_factions` | array<entity_ref> | 相关势力 ID 列表 | - |
| `related_races` | array<entity_ref> | 相关种族 ID 列表 | - |
| `versioning` | versioning | 版本信息 | - |

---

## English

This document details all template types and their field definitions supported by the WorldEngine system.

### Field Type Reference

| Type | Description | Example |
|------|-------------|---------|
| `string` | String value | `"char-hero"` |
| `integer` | Positive integer | `100` |
| `boolean` | Boolean value | `true` / `false` |
| `bilingual` | Bilingual text (zh required, en optional) | `{ zh: "中文", en: "English" }` |
| `entity_ref` | Entity reference ID | `"race-human"` |
| `epoch_ref` | Epoch reference ID | `"epoch-first-age"` |
| `versioning` | Versioning info object | See below |
| `array<T>` | Array of type T | `["item1", "item2"]` |

#### versioning Field Structure

```yaml
versioning:
  canon: true          # true=canon, false=non-canon
  source: "author-id"  # Source author ID
  priority: official   # official | secondary
```

---

### 1. Character Template

For defining character settings in the world.

#### Required Fields

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| `id` | string | Unique identifier | Format: `char-<name>` |
| `name` | bilingual | Character name | zh required |
| `race` | entity_ref | Race ID | Must reference existing race |
| `birth_epoch` | epoch_ref | Birth epoch ID | Must reference existing epoch |
| `birth_year` | integer | Birth year (within epoch) | ≥ 1 |
| `lifespan` | integer | Lifespan (years) | ≥ 1 |
| `versioning` | versioning | Version info | - |

#### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `death_epoch` | epoch_ref | Death epoch ID (empty = still alive) |
| `death_year` | integer | Death year (within epoch) |
| `description` | bilingual | Character description |
| `prose` | bilingual | Narrative prose (Markdown) |
| `faction` | entity_ref | Faction ID |
| `artifacts` | array<entity_ref> | List of artifact IDs |

---

### 2. Race Template

For defining race settings in the world.

#### Required Fields

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| `id` | string | Unique identifier | Format: `race-<name>` |
| `name` | bilingual | Race name | zh required |
| `average_lifespan` | integer | Average lifespan (years) | ≥ 1 |
| `habitat` | bilingual | Habitat description | - |

#### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `description` | bilingual | Race description |
| `prose` | bilingual | Narrative prose (Markdown) |
| `traits` | array<string> | List of racial traits |
| `origin_epoch` | epoch_ref | Origin epoch ID |
| `versioning` | versioning | Version info |

---

### 3. Creature Template

For defining animal and creature settings.

#### Required Fields

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| `id` | string | Unique identifier | Format: `creature-<name>` |
| `name` | bilingual | Creature name | zh required |

#### Optional Fields

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| `description` | bilingual | Creature description | - |
| `prose` | bilingual | Narrative prose | - |
| `habitat` | bilingual | Habitat description | - |
| `average_lifespan` | integer | Average lifespan (years) | ≥ 1 |
| `danger_level` | string | Danger level | harmless/low/medium/high/extreme |
| `locations` | array<entity_ref> | Location IDs | - |
| `versioning` | versioning | Version info | - |

---

### 4. Flora Template

For defining plant settings.

#### Required Fields

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| `id` | string | Unique identifier | Format: `flora-<name>` |
| `name` | bilingual | Plant name | zh required |

#### Optional Fields

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| `description` | bilingual | Plant description | - |
| `prose` | bilingual | Narrative prose | - |
| `habitat` | bilingual | Growth environment | - |
| `properties` | array<string> | Plant properties | - |
| `rarity` | string | Rarity level | common/uncommon/rare/legendary/mythical |
| `locations` | array<entity_ref> | Location IDs | - |
| `versioning` | versioning | Version info | - |

---

### 5. Location Template

For defining geographical location settings.

#### Required Fields

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| `id` | string | Unique identifier | Format: `loc-<name>` |
| `name` | bilingual | Location name | zh required |
| `region` | bilingual | Region | - |
| `epoch` | epoch_ref | Epoch ID | Must reference existing epoch |

#### Optional Fields

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| `description` | bilingual | Location description | - |
| `prose` | bilingual | Narrative prose | - |
| `location_type` | string | Location type | city/village/mountain/river/forest/desert/ocean/island/plain/ruins/sacred/other |
| `controlling_faction` | entity_ref | Controlling faction ID | - |
| `parent_location` | entity_ref | Parent location ID | - |
| `versioning` | versioning | Version info | - |

---

### 6. History Template

For defining historical event settings.

#### Required Fields

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| `id` | string | Unique identifier | Format: `event-<name>` |
| `name` | bilingual | Event name | zh required |
| `start_epoch` | epoch_ref | Start epoch ID | Must reference existing epoch |
| `start_year` | integer | Start year (within epoch) | ≥ 1 |
| `participants` | array<entity_ref> | Participant character IDs | Must reference existing characters |
| `versioning` | versioning | Version info | - |

#### Optional Fields

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| `end_epoch` | epoch_ref | End epoch ID | - |
| `end_year` | integer | End year (within epoch) | ≥ 1 |
| `description` | bilingual | Event description | - |
| `prose` | bilingual | Narrative prose | - |
| `locations` | array<entity_ref> | Location IDs | - |
| `factions` | array<entity_ref> | Faction IDs | - |
| `artifacts` | array<entity_ref> | Artifact IDs | - |
| `event_type` | string | Event type | war/treaty/discovery/creation/destruction/migration/founding/death/birth/other |

---

### 7. Faction Template

For defining nation, organization, and faction settings.

#### Required Fields

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| `id` | string | Unique identifier | Format: `faction-<name>` |
| `name` | bilingual | Faction name | zh required |
| `epoch` | epoch_ref | Epoch ID | Must reference existing epoch |
| `faction_type` | string | Faction type | nation/kingdom/empire/tribe/clan/guild/order/sect/alliance/other |
| `active_status` | boolean | Whether still active | true=active, false=dissolved |

#### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `description` | bilingual | Faction description |
| `prose` | bilingual | Narrative prose |
| `founding_year` | integer | Founding year (within epoch) |
| `dissolution_year` | integer | Dissolution year (within epoch) |
| `leader` | entity_ref | Leader character ID |
| `headquarters` | entity_ref | Headquarters location ID |
| `territories` | array<entity_ref> | Controlled territory IDs |
| `allies` | array<entity_ref> | Allied faction IDs |
| `enemies` | array<entity_ref> | Enemy faction IDs |
| `versioning` | versioning | Version info |

---

### 8. Artifact Template

For defining artifact and treasure settings.

#### Required Fields

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| `id` | string | Unique identifier | Format: `artifact-<name>` |
| `name` | bilingual | Artifact name | zh required |

#### Optional Fields

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| `description` | bilingual | Artifact description | - |
| `prose` | bilingual | Narrative prose | - |
| `artifact_type` | string | Artifact type | weapon/armor/accessory/tool/container/vehicle/structure/other |
| `rarity` | string | Rarity level | common/uncommon/rare/legendary/mythical/divine |
| `powers` | array<string> | Artifact powers | - |
| `creator` | entity_ref | Creator character ID | - |
| `creation_epoch` | epoch_ref | Creation epoch ID | - |
| `creation_year` | integer | Creation year (within epoch) | ≥ 1 |
| `current_owner` | entity_ref | Current owner character ID | - |
| `current_location` | entity_ref | Current location ID | - |
| `previous_owners` | array<entity_ref> | Previous owner character IDs | - |
| `versioning` | versioning | Version info | - |

---

### 9. Concept Template

For defining abstract concept settings (e.g., magic systems, religions, social systems).

#### Required Fields

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| `id` | string | Unique identifier | Format: `concept-<name>` |
| `name` | bilingual | Concept name | zh required |

#### Optional Fields

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| `description` | bilingual | Concept description | - |
| `prose` | bilingual | Narrative prose | - |
| `concept_type` | string | Concept type | magic/religion/philosophy/technology/social/political/economic/cultural/other |
| `related_factions` | array<entity_ref> | Related faction IDs | - |
| `related_races` | array<entity_ref> | Related race IDs | - |
| `versioning` | versioning | Version info | - |

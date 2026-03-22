# 时间系统 / Time System

[English](#english) | [中文](#中文)

---

## 中文

本文档说明 WorldEngine 的纪元和时间线系统。

### 概述

WorldEngine 使用"纪元 + 年份"的时间表示方式，支持跨纪元的时间计算和验证。

### 纪元 (Epoch)

纪元是世界观中的大时间单位，每个纪元有独立的年份计数。

#### 纪元索引文件

纪元定义在 `world/epochs/_index.yaml` 文件中：

```yaml
epochs:
  - id: epoch-first-age
    name:
      zh: "第一纪元"
      en: "First Age"
    order: 1
    duration: 3000  # 纪元持续年数

  - id: epoch-second-age
    name:
      zh: "第二纪元"
      en: "Second Age"
    order: 2
    duration: 2000

  - id: epoch-third-age
    name:
      zh: "第三纪元"
      en: "Third Age"
    order: 3
    duration: 1500
```

#### 纪元字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 纪元唯一标识符，格式 `epoch-<name>` |
| `name` | bilingual | 纪元名称 |
| `order` | integer | 纪元顺序，用于时间比较 |
| `duration` | integer | 纪元持续年数（必填） |

### 时间表示

#### 基本格式

时间由纪元 ID 和年份组成：

```yaml
# 人物出生时间
birth_epoch: epoch-third-age
birth_year: 1250

# 人物死亡时间
death_epoch: epoch-third-age
death_year: 1325
```

#### 历史事件时间

```yaml
# 事件起止时间
start_epoch: epoch-second-age
start_year: 500

end_epoch: epoch-second-age
end_year: 550
```

### 时间计算

#### 同纪元计算

```
年份差 = year2 - year1
```

示例：第三纪元 1325 年 - 第三纪元 1250 年 = 75 年

#### 跨纪元计算

```
年份差 = (epoch1 剩余年数) + (中间纪元总年数) + (epoch2 已过年数)
```

示例：从第二纪元 1800 年到第三纪元 200 年
- 第二纪元剩余：2000 - 1800 = 200 年
- 第三纪元已过：200 年
- 总计：200 + 200 = 400 年

### 时间线验证规则

#### 1. 人物生死时间顺序

死亡时间必须晚于出生时间：

```
(death_epoch.order > birth_epoch.order) OR
(death_epoch.order == birth_epoch.order AND death_year > birth_year)
```

#### 2. 历史事件时间顺序

结束时间必须晚于起始时间：

```
(end_epoch.order > start_epoch.order) OR
(end_epoch.order == start_epoch.order AND end_year > start_year)
```

#### 3. 参与人物生命周期

历史事件的时间范围必须在所有参与人物的生命周期内：

```
event_start >= character_birth
event_end <= character_death (如果已死亡)
```

#### 4. 寿命一致性

人物的 `lifespan` 字段应与计算出的生死年份差一致（允许 ±5 年误差）：

```
|lifespan - (death_time - birth_time)| <= 5
```

### 生命周期字段

#### 人物模板

| 字段 | 说明 |
|------|------|
| `birth_epoch` | 出生纪元 ID（必填） |
| `birth_year` | 出生年份（必填） |
| `lifespan` | 寿命年数（必填） |
| `death_epoch` | 死亡纪元 ID（选填，未填表示存活） |
| `death_year` | 死亡年份（选填） |

#### 历史事件模板

| 字段 | 说明 |
|------|------|
| `start_epoch` | 起始纪元 ID（必填） |
| `start_year` | 起始年份（必填） |
| `end_epoch` | 结束纪元 ID（选填，未填表示瞬时事件） |
| `end_year` | 结束年份（选填） |

### 示例

#### 人物时间线

```yaml
template: character
id: char-long-lived-elf

name:
  zh: "长寿精灵"
  en: "Long-lived Elf"

race: race-elf

# 出生于第二纪元 1500 年
birth_epoch: epoch-second-age
birth_year: 1500

# 寿命 800 年
lifespan: 800

# 死亡于第三纪元 300 年
# 计算：(2000-1500) + 300 = 800 年 ✓
death_epoch: epoch-third-age
death_year: 300

versioning:
  canon: true
  source: "author-main"
  priority: official
```

#### 跨纪元历史事件

```yaml
template: history
id: event-age-transition

name:
  zh: "纪元更迭"
  en: "Age Transition"

# 从第二纪元末到第三纪元初
start_epoch: epoch-second-age
start_year: 1990

end_epoch: epoch-third-age
end_year: 10

participants:
  - char-long-lived-elf  # 此人物在事件期间存活

versioning:
  canon: true
  source: "author-main"
  priority: official
```

### 常见错误

#### ERR_TIMELINE_DEATH_BEFORE_BIRTH

死亡时间早于出生时间。检查纪元顺序和年份。

#### ERR_TIMELINE_EVENT_ORDER

事件结束时间早于起始时间。检查纪元顺序和年份。

#### ERR_TIMELINE_PARTICIPANT

事件时间不在参与人物的生命周期内。确保：
- 事件起始时间 ≥ 人物出生时间
- 事件结束时间 ≤ 人物死亡时间（如果已死亡）

#### ERR_LIFESPAN_MISMATCH

寿命字段与计算出的生死年份差不一致。确保 `lifespan` 值正确。

---

## English

This document explains the WorldEngine epoch and timeline system.

### Overview

WorldEngine uses an "Epoch + Year" time representation, supporting cross-epoch time calculations and validation.

### Epoch

An epoch is a major time unit in the world-building, with each epoch having independent year counting.

#### Epoch Index File

Epochs are defined in `world/epochs/_index.yaml`:

```yaml
epochs:
  - id: epoch-first-age
    name:
      zh: "第一纪元"
      en: "First Age"
    order: 1
    duration: 3000  # Epoch duration in years

  - id: epoch-second-age
    name:
      zh: "第二纪元"
      en: "Second Age"
    order: 2
    duration: 2000

  - id: epoch-third-age
    name:
      zh: "第三纪元"
      en: "Third Age"
    order: 3
    duration: 1500
```

#### Epoch Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique epoch identifier, format `epoch-<name>` |
| `name` | bilingual | Epoch name |
| `order` | integer | Epoch order, used for time comparison |
| `duration` | integer | Epoch duration in years (required) |

### Time Representation

#### Basic Format

Time consists of epoch ID and year:

```yaml
# Character birth time
birth_epoch: epoch-third-age
birth_year: 1250

# Character death time
death_epoch: epoch-third-age
death_year: 1325
```

#### Historical Event Time

```yaml
# Event start and end time
start_epoch: epoch-second-age
start_year: 500

end_epoch: epoch-second-age
end_year: 550
```

### Time Calculation

#### Same Epoch Calculation

```
Year difference = year2 - year1
```

Example: Third Age 1325 - Third Age 1250 = 75 years

#### Cross-Epoch Calculation

```
Year difference = (epoch1 remaining years) + (middle epochs total years) + (epoch2 elapsed years)
```

Example: From Second Age 1800 to Third Age 200
- Second Age remaining: 2000 - 1800 = 200 years
- Third Age elapsed: 200 years
- Total: 200 + 200 = 400 years

### Timeline Validation Rules

#### 1. Character Birth/Death Order

Death time must be after birth time:

```
(death_epoch.order > birth_epoch.order) OR
(death_epoch.order == birth_epoch.order AND death_year > birth_year)
```

#### 2. Historical Event Time Order

End time must be after start time:

```
(end_epoch.order > start_epoch.order) OR
(end_epoch.order == start_epoch.order AND end_year > start_year)
```

#### 3. Participant Lifecycle

Historical event time range must fall within all participants' lifecycles:

```
event_start >= character_birth
event_end <= character_death (if deceased)
```

#### 4. Lifespan Consistency

Character's `lifespan` field should match calculated birth-death year difference (±5 years tolerance):

```
|lifespan - (death_time - birth_time)| <= 5
```

### Lifecycle Fields

#### Character Template

| Field | Description |
|-------|-------------|
| `birth_epoch` | Birth epoch ID (required) |
| `birth_year` | Birth year (required) |
| `lifespan` | Lifespan in years (required) |
| `death_epoch` | Death epoch ID (optional, empty = alive) |
| `death_year` | Death year (optional) |

#### History Template

| Field | Description |
|-------|-------------|
| `start_epoch` | Start epoch ID (required) |
| `start_year` | Start year (required) |
| `end_epoch` | End epoch ID (optional, empty = instantaneous) |
| `end_year` | End year (optional) |

### Examples

#### Character Timeline

```yaml
template: character
id: char-long-lived-elf

name:
  zh: "长寿精灵"
  en: "Long-lived Elf"

race: race-elf

# Born in Second Age year 1500
birth_epoch: epoch-second-age
birth_year: 1500

# Lifespan 800 years
lifespan: 800

# Died in Third Age year 300
# Calculation: (2000-1500) + 300 = 800 years ✓
death_epoch: epoch-third-age
death_year: 300

versioning:
  canon: true
  source: "author-main"
  priority: official
```

#### Cross-Epoch Historical Event

```yaml
template: history
id: event-age-transition

name:
  zh: "纪元更迭"
  en: "Age Transition"

# From end of Second Age to beginning of Third Age
start_epoch: epoch-second-age
start_year: 1990

end_epoch: epoch-third-age
end_year: 10

participants:
  - char-long-lived-elf  # This character was alive during the event

versioning:
  canon: true
  source: "author-main"
  priority: official
```

### Common Errors

#### ERR_TIMELINE_DEATH_BEFORE_BIRTH

Death time is before birth time. Check epoch order and years.

#### ERR_TIMELINE_EVENT_ORDER

Event end time is before start time. Check epoch order and years.

#### ERR_TIMELINE_PARTICIPANT

Event time is outside participant's lifecycle. Ensure:
- Event start time ≥ character birth time
- Event end time ≤ character death time (if deceased)

#### ERR_LIFESPAN_MISMATCH

Lifespan field doesn't match calculated birth-death year difference. Ensure `lifespan` value is correct.

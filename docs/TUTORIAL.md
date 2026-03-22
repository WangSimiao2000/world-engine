# 教程 / Tutorial

[English](#english) | [中文](#中文)

---

## 中文

本教程将引导你完成一个完整的世界观设定提交流程：创建种族 → 创建人物 → 创建历史事件。

### 前置准备

确保已安装依赖并构建项目：

```bash
npm install
npm run build
```

### 第一步：创建种族

首先，我们需要创建一个种族，因为人物设定需要引用种族。

#### 1.1 生成种族模板

```bash
npx worldengine template init race race-human
```

这会在 `submissions/race/` 目录下生成 `race-human.yaml` 文件。

#### 1.2 编辑种族设定

打开 `submissions/race/race-human.yaml`，填写内容：

```yaml
template: race
id: race-human

name:
  zh: "人类"
  en: "Human"

average_lifespan: 80

habitat:
  zh: "大陆各地，从繁华的城市到偏远的村庄"
  en: "Across the continent, from bustling cities to remote villages"

description:
  zh: "人类是世界上分布最广泛的智慧种族，以其适应能力和创造力著称。"
  en: "Humans are the most widespread intelligent race, known for their adaptability and creativity."

versioning:
  canon: true
  source: "author-main"
  priority: official
```

#### 1.3 验证种族设定

```bash
npx worldengine validate --cross
```

如果没有错误，种族设定就完成了。

---

### 第二步：创建人物

现在我们可以创建一个引用人类种族的人物。

#### 2.1 生成人物模板

```bash
npx worldengine template init character char-hero-wang
```

#### 2.2 编辑人物设定

打开 `submissions/character/char-hero-wang.yaml`：

```yaml
template: character
id: char-hero-wang

name:
  zh: "王大勇"
  en: "Wang Dayong"

race: race-human

birth_epoch: epoch-third-age
birth_year: 1250

lifespan: 75

versioning:
  canon: true
  source: "author-main"
  priority: official

# 选填项
death_epoch: epoch-third-age
death_year: 1325

description:
  zh: "第三纪元著名的剑术大师，曾在北方战役中立下赫赫战功。"
  en: "A renowned sword master of the Third Age, famous for his heroic deeds in the Northern Campaign."

prose:
  zh: |
    ## 早年生涯
    
    王大勇出生于边境小镇，自幼展现出非凡的武术天赋。
    
    ## 成名之战
    
    在第三纪元1280年的**北方战役**中，他以一己之力守住了关隘。
  en: |
    ## Early Life
    
    Wang Dayong was born in a border town and showed extraordinary martial talent from childhood.
    
    ## Famous Battle
    
    In the **Northern Campaign** of year 1280, he single-handedly defended the pass.

faction: faction-northern-alliance
```

#### 2.3 验证人物设定

```bash
npx worldengine validate --cross
```

系统会检查：
- 种族 `race-human` 是否存在
- 纪元 `epoch-third-age` 是否存在
- 人物寿命是否合理（不超过种族平均寿命的 150%）
- 死亡时间是否晚于出生时间

---

### 第三步：创建历史事件

最后，我们创建一个人物参与的历史事件。

#### 3.1 生成历史事件模板

```bash
npx worldengine template init history event-northern-campaign
```

#### 3.2 编辑历史事件设定

打开 `submissions/history/event-northern-campaign.yaml`：

```yaml
template: history
id: event-northern-campaign

name:
  zh: "北方战役"
  en: "Northern Campaign"

start_epoch: epoch-third-age
start_year: 1278

end_epoch: epoch-third-age
end_year: 1282

participants:
  - char-hero-wang

versioning:
  canon: true
  source: "author-main"
  priority: official

description:
  zh: "第三纪元最重要的军事行动之一，北方联盟抵御南方帝国入侵的关键战役。"
  en: "One of the most important military operations of the Third Age, a crucial campaign where the Northern Alliance repelled the Southern Empire's invasion."

prose:
  zh: |
    ## 战役背景
    
    第三纪元1278年，南方帝国发动大规模北伐，意图统一大陆。
    
    ## 关键战役
    
    - **关隘之战**：王大勇以少胜多，守住北方门户
    - **平原决战**：联盟军主力与帝国军正面交锋
    
    ## 战役影响
    
    此役奠定了北方联盟的地位，确保了北方诸国的独立。
  en: |
    ## Campaign Background
    
    In year 1278 of the Third Age, the Southern Empire launched a massive northern expedition to unify the continent.
    
    ## Key Battles
    
    - **Battle of the Pass**: Wang Dayong defended the northern gateway against overwhelming odds
    - **Plains Showdown**: The alliance's main force clashed with the imperial army
    
    ## Campaign Impact
    
    This campaign established the Northern Alliance's position and secured the independence of the northern kingdoms.

event_type: war

locations:
  - loc-northern-pass
  - loc-central-plains

factions:
  - faction-northern-alliance
  - faction-southern-empire
```

#### 3.3 最终验证

```bash
npx worldengine validate --cross
```

系统会检查：
- 参与人物 `char-hero-wang` 是否存在
- 事件时间（1278-1282）是否在参与人物的生命周期内（1250-1325）
- 结束时间是否晚于起始时间

---

### 常见问题

#### Q: 验证报错 `ERR_REF_MISSING`

引用的实体不存在。请确保：
1. 被引用的设定文件已创建
2. ID 拼写正确
3. 被引用的设定已通过验证

#### Q: 验证报错 `ERR_LIFESPAN_EXCEED`

人物寿命超过种族平均寿命的 150%。请检查：
1. 人物的 `lifespan` 字段值
2. 种族的 `average_lifespan` 字段值

#### Q: 验证报错 `ERR_TIMELINE_INVALID`

时间线不一致。请检查：
1. 历史事件的时间范围是否在参与人物的生命周期内
2. 结束时间是否晚于起始时间

---

## English

This tutorial guides you through a complete world-building submission workflow: Create Race → Create Character → Create Historical Event.

### Prerequisites

Ensure dependencies are installed and the project is built:

```bash
npm install
npm run build
```

### Step 1: Create a Race

First, we need to create a race because character settings require a race reference.

#### 1.1 Generate Race Template

```bash
npx worldengine template init race race-human
```

This creates `race-human.yaml` in the `submissions/race/` directory.

#### 1.2 Edit Race Settings

Open `submissions/race/race-human.yaml` and fill in:

```yaml
template: race
id: race-human

name:
  zh: "人类"
  en: "Human"

average_lifespan: 80

habitat:
  zh: "大陆各地，从繁华的城市到偏远的村庄"
  en: "Across the continent, from bustling cities to remote villages"

description:
  zh: "人类是世界上分布最广泛的智慧种族，以其适应能力和创造力著称。"
  en: "Humans are the most widespread intelligent race, known for their adaptability and creativity."

versioning:
  canon: true
  source: "author-main"
  priority: official
```

#### 1.3 Validate Race Settings

```bash
npx worldengine validate --cross
```

If there are no errors, the race setting is complete.

---

### Step 2: Create a Character

Now we can create a character that references the human race.

#### 2.1 Generate Character Template

```bash
npx worldengine template init character char-hero-wang
```

#### 2.2 Edit Character Settings

Open `submissions/character/char-hero-wang.yaml`:

```yaml
template: character
id: char-hero-wang

name:
  zh: "王大勇"
  en: "Wang Dayong"

race: race-human

birth_epoch: epoch-third-age
birth_year: 1250

lifespan: 75

versioning:
  canon: true
  source: "author-main"
  priority: official

# Optional fields
death_epoch: epoch-third-age
death_year: 1325

description:
  zh: "第三纪元著名的剑术大师，曾在北方战役中立下赫赫战功。"
  en: "A renowned sword master of the Third Age, famous for his heroic deeds in the Northern Campaign."

faction: faction-northern-alliance
```

#### 2.3 Validate Character Settings

```bash
npx worldengine validate --cross
```

The system will check:
- Whether race `race-human` exists
- Whether epoch `epoch-third-age` exists
- Whether character lifespan is reasonable (not exceeding 150% of race average)
- Whether death time is after birth time

---

### Step 3: Create a Historical Event

Finally, we create a historical event involving the character.

#### 3.1 Generate History Template

```bash
npx worldengine template init history event-northern-campaign
```

#### 3.2 Edit History Settings

Open `submissions/history/event-northern-campaign.yaml`:

```yaml
template: history
id: event-northern-campaign

name:
  zh: "北方战役"
  en: "Northern Campaign"

start_epoch: epoch-third-age
start_year: 1278

end_epoch: epoch-third-age
end_year: 1282

participants:
  - char-hero-wang

versioning:
  canon: true
  source: "author-main"
  priority: official

description:
  zh: "第三纪元最重要的军事行动之一"
  en: "One of the most important military operations of the Third Age"

event_type: war
```

#### 3.3 Final Validation

```bash
npx worldengine validate --cross
```

The system will check:
- Whether participant `char-hero-wang` exists
- Whether event time (1278-1282) falls within participant's lifespan (1250-1325)
- Whether end time is after start time

---

### Common Issues

#### Q: Validation error `ERR_REF_MISSING`

Referenced entity doesn't exist. Ensure:
1. The referenced setting file has been created
2. The ID is spelled correctly
3. The referenced setting has passed validation

#### Q: Validation error `ERR_LIFESPAN_EXCEED`

Character lifespan exceeds 150% of race average. Check:
1. Character's `lifespan` field value
2. Race's `average_lifespan` field value

#### Q: Validation error `ERR_TIMELINE_INVALID`

Timeline inconsistency. Check:
1. Whether event time range falls within participants' lifespans
2. Whether end time is after start time

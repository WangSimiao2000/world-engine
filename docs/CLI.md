# 命令行参考 / CLI Reference

[English](#english) | [中文](#中文)

---

## 中文

本文档详细说明 WorldEngine 的所有命令行命令。

### 全局选项

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `--lang <zh\|en>` | 输出语言 | `zh` |
| `--help` | 显示帮助信息 | - |
| `--version` | 显示版本号 | - |

也可以通过环境变量设置语言：

```bash
export WORLDENGINE_LANG=en
```

优先级：`--lang` 参数 > `WORLDENGINE_LANG` 环境变量 > 默认值 `zh`

---

### template 命令组

#### template list

列出所有可用的模板类别及其必填项摘要。

```bash
npx worldengine template list [--lang <zh|en>]
```

**示例输出：**

```
可用模板 / Available Templates:
================================

character (人物)
  必填项: id, name, race, birth_epoch, birth_year, lifespan, versioning

race (种族)
  必填项: id, name, average_lifespan, habitat

creature (动物)
  必填项: id, name

flora (植物)
  必填项: id, name

location (地理)
  必填项: id, name, region, epoch

history (历史事件)
  必填项: id, name, start_epoch, start_year, participants, versioning

faction (势力)
  必填项: id, name, epoch, faction_type, active_status

artifact (神器)
  必填项: id, name

concept (概念)
  必填项: id, name
```

---

#### template init

在 `submissions/` 目录下生成预填充模板结构的 YAML 文件。

```bash
npx worldengine template init <category> <id> [--lang <zh|en>]
```

**参数：**

| 参数 | 说明 | 示例 |
|------|------|------|
| `category` | 模板类别 | `character`, `race`, `history` 等 |
| `id` | 设定唯一标识符 | `char-hero`, `race-elf` |

**示例：**

```bash
# 创建人物设定
npx worldengine template init character char-my-hero

# 创建种族设定（英文注释）
npx worldengine template init race race-my-race --lang en
```

**输出：**

```
✅ 已创建文件 / Created file: submissions/character/char-my-hero.yaml
```

生成的文件包含所有必填项和选填项的注释说明。

---

### validate 命令

#### validate --cross

对 `submissions/` 目录执行完整的交叉验证。

```bash
npx worldengine validate --cross [--lang <zh|en>]
```

**验证流程：**

1. 输出目录保护检查
2. 模板格式校验
3. 必填项校验
4. 字段类型校验
5. 约束条件校验
6. 交叉引用验证

**示例输出（成功）：**

```
🔍 WorldEngine Validation
==========================

📁 扫描 submissions/ 目录...
📄 发现 5 个文件

✅ 验证通过 / Validation Passed

📊 验证结果:
   总文件数: 5
   已验证: 5
   错误数: 0
   警告数: 0
```

**示例输出（失败）：**

```
🔍 WorldEngine Validation
==========================

📁 扫描 submissions/ 目录...
📄 发现 5 个文件

❌ 验证错误 / Validation Errors:

[ERR_REF_MISSING] 引用的种族 ID 不存在 / Referenced race ID does not exist
  文件 / File: submissions/character/char-hero.yaml
  字段 / Field: race

[ERR_LIFESPAN_EXCEED] 人物寿命超过种族平均寿命的 150%
  文件 / File: submissions/character/char-hero.yaml
  字段 / Field: lifespan

❌ 验证失败 / Validation Failed
```

---

### registry 命令组

#### registry build

从 `submissions/` 目录重新构建 `_build/` 注册表目录。

```bash
npx worldengine registry build [--lang <zh|en>]
```

**功能：**

1. 验证所有 submissions 文件
2. 将通过验证的设定归档到 `_build/<category>/`
3. 更新 `_build/_index.yaml` 索引文件

**示例输出：**

```
🔨 构建注册表 / Building Registry
==================================

📁 扫描 submissions/ 目录...
📄 发现 10 个文件

✅ 验证通过: 10 个文件
📦 归档完成: 10 个设定

📊 构建结果:
   character: 3
   race: 2
   creature: 1
   location: 2
   history: 2

✅ 注册表构建完成 / Registry Build Complete
```

---

#### registry status

显示注册表中各类别的设定数量统计。

```bash
npx worldengine registry status [--lang <zh|en>]
```

**示例输出：**

```
📊 注册表状态 / Registry Status
================================

类别 / Category    数量 / Count
---------------------------------
character          3
race               2
creature           1
flora              0
location           2
history            2
faction            1
artifact           0
concept            0
---------------------------------
总计 / Total       11

最后更新 / Last Updated: 2024-01-15T10:30:00Z
```

---

### 环境变量

| 变量 | 说明 | 可选值 |
|------|------|--------|
| `WORLDENGINE_LANG` | 默认输出语言 | `zh`, `en` |

---

### 退出码

| 退出码 | 说明 |
|--------|------|
| `0` | 成功 |
| `1` | 验证失败或发生错误 |

---

## English

This document details all WorldEngine CLI commands.

### Global Options

| Option | Description | Default |
|--------|-------------|---------|
| `--lang <zh\|en>` | Output language | `zh` |
| `--help` | Show help | - |
| `--version` | Show version | - |

Language can also be set via environment variable:

```bash
export WORLDENGINE_LANG=en
```

Priority: `--lang` flag > `WORLDENGINE_LANG` env var > default `zh`

---

### template Commands

#### template list

List all available template categories with required field summaries.

```bash
npx worldengine template list [--lang <zh|en>]
```

**Example Output:**

```
Available Templates:
====================

character
  Required: id, name, race, birth_epoch, birth_year, lifespan, versioning

race
  Required: id, name, average_lifespan, habitat

creature
  Required: id, name

flora
  Required: id, name

location
  Required: id, name, region, epoch

history
  Required: id, name, start_epoch, start_year, participants, versioning

faction
  Required: id, name, epoch, faction_type, active_status

artifact
  Required: id, name

concept
  Required: id, name
```

---

#### template init

Generate a pre-filled template YAML file in the `submissions/` directory.

```bash
npx worldengine template init <category> <id> [--lang <zh|en>]
```

**Parameters:**

| Parameter | Description | Example |
|-----------|-------------|---------|
| `category` | Template category | `character`, `race`, `history`, etc. |
| `id` | Unique setting identifier | `char-hero`, `race-elf` |

**Examples:**

```bash
# Create character setting
npx worldengine template init character char-my-hero

# Create race setting (English comments)
npx worldengine template init race race-my-race --lang en
```

**Output:**

```
✅ Created file: submissions/character/char-my-hero.yaml
```

The generated file includes comments for all required and optional fields.

---

### validate Command

#### validate --cross

Run full cross-validation on the `submissions/` directory.

```bash
npx worldengine validate --cross [--lang <zh|en>]
```

**Validation Flow:**

1. Output directory protection check
2. Template format validation
3. Required field validation
4. Field type validation
5. Constraint validation
6. Cross-reference validation

**Example Output (Success):**

```
🔍 WorldEngine Validation
==========================

📁 Scanning submissions/ directory...
📄 Found 5 files

✅ Validation Passed

📊 Validation Results:
   Total files: 5
   Validated: 5
   Errors: 0
   Warnings: 0
```

**Example Output (Failure):**

```
🔍 WorldEngine Validation
==========================

📁 Scanning submissions/ directory...
📄 Found 5 files

❌ Validation Errors:

[ERR_REF_MISSING] Referenced race ID does not exist
  File: submissions/character/char-hero.yaml
  Field: race

[ERR_LIFESPAN_EXCEED] Character lifespan exceeds 150% of race average
  File: submissions/character/char-hero.yaml
  Field: lifespan

❌ Validation Failed
```

---

### registry Commands

#### registry build

Rebuild the `_build/` registry directory from `submissions/`.

```bash
npx worldengine registry build [--lang <zh|en>]
```

**Functions:**

1. Validate all submissions files
2. Archive validated settings to `_build/<category>/`
3. Update `_build/_index.yaml` index file

**Example Output:**

```
🔨 Building Registry
====================

📁 Scanning submissions/ directory...
📄 Found 10 files

✅ Validated: 10 files
📦 Archived: 10 settings

📊 Build Results:
   character: 3
   race: 2
   creature: 1
   location: 2
   history: 2

✅ Registry Build Complete
```

---

#### registry status

Display setting count statistics for each category in the registry.

```bash
npx worldengine registry status [--lang <zh|en>]
```

**Example Output:**

```
📊 Registry Status
==================

Category           Count
-------------------------
character          3
race               2
creature           1
flora              0
location           2
history            2
faction            1
artifact           0
concept            0
-------------------------
Total              11

Last Updated: 2024-01-15T10:30:00Z
```

---

### Environment Variables

| Variable | Description | Values |
|----------|-------------|--------|
| `WORLDENGINE_LANG` | Default output language | `zh`, `en` |

---

### Exit Codes

| Exit Code | Description |
|-----------|-------------|
| `0` | Success |
| `1` | Validation failed or error occurred |

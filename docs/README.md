# WorldEngine 世界观设定模板系统

[English](#english) | [中文](#中文)

---

## 中文

### 项目简介

WorldEngine 是一套基于 YAML 模板的世界观设定提交系统，配套交叉验证 CI 管线。参考九州等成熟世界观设定集的分类方式，为人物、种族、动物、植物、地理、历史等不同类型的设定提供标准化模板（含必填项与选填项）。

贡献者通过填写模板提交设定，CI 管线自动执行交叉引用验证（如人物寿命与种族平均寿命的一致性检查），通过验证的设定自动归档到独立的输出目录，供后续验证引用。

### 核心概念

#### 模板 (Template)

模板定义了某一类型设定所需的必填项和选填项的 YAML 结构。每个模板包含：
- **必填项 (required)**：提交时必须填写的字段
- **选填项 (optional)**：可选填写的字段
- **字段约束**：类型检查、正则表达式、数值范围等

系统支持 9 种设定类别：
| 类别 | 英文标识 | 说明 |
|------|----------|------|
| 人物 | character | 世界观中的角色 |
| 种族 | race | 智慧种族或物种 |
| 动物 | creature | 动物、怪物等生物 |
| 植物 | flora | 植物、草药等 |
| 地理 | location | 地点、区域、国家 |
| 历史 | history | 历史事件 |
| 势力 | faction | 国家、组织、势力 |
| 神器 | artifact | 神器、法宝、装备 |
| 概念 | concept | 抽象概念、魔法体系 |

#### 提交 (Submission)

提交文件是贡献者根据模板填写的 YAML 设定文件。每个提交文件必须：
- 声明使用的模板类型 (`template` 字段)
- 包含唯一标识符 (`id` 字段)
- 填写所有必填项

#### 注册表 (Registry)

注册表是已通过验证的设定集合，存储在 `_build/` 输出目录中。注册表用于：
- 交叉验证时的引用基准
- 查询已有设定信息
- 确保设定之间的一致性

#### 交叉验证 (Cross Validation)

交叉验证器负责检查不同设定之间的引用完整性和数值一致性：
- **引用验证**：确保引用的实体（种族、势力等）存在
- **寿命验证**：人物寿命不超过种族平均寿命的 150%
- **时间线验证**：事件时间在参与人物的生命周期内
- **正史/野史验证**：同一事件最多只有一个正史版本

### 目录结构

```
worldengine/
├── templates/                    # 模板定义目录
│   ├── character.yaml           # 人物模板
│   ├── race.yaml                # 种族模板
│   ├── creature.yaml            # 动物模板
│   ├── flora.yaml               # 植物模板
│   ├── location.yaml            # 地理模板
│   ├── history.yaml             # 历史事件模板
│   ├── faction.yaml             # 势力模板
│   ├── artifact.yaml            # 神器模板
│   └── concept.yaml             # 概念模板
├── submissions/                  # 提交文件目录
│   ├── character/               # 人物提交
│   │   ├── _example.yaml        # 示例文件（不参与验证）
│   │   └── char-xxx.yaml        # 实际提交
│   ├── race/                    # 种族提交
│   └── ...                      # 其他类别
├── _build/                       # 输出目录（自动生成，勿手动修改）
│   ├── _index.yaml              # 注册表索引
│   └── <category>/              # 各类别归档
├── docs/                         # 文档目录
│   ├── README.md                # 项目总览（本文档）
│   ├── TEMPLATES.md             # 模板参考
│   ├── TUTORIAL.md              # 教程
│   ├── VALIDATION.md            # 验证规则
│   ├── VERSIONING.md            # 版本系统
│   ├── TIME_SYSTEM.md           # 时间系统
│   └── CLI.md                   # 命令行参考
└── src/                          # 源代码目录
```

### 快速开始

#### 1. 安装依赖

```bash
npm install
npm run build
```

#### 2. 查看可用模板

```bash
npx worldengine template list
```

#### 3. 创建新设定

```bash
# 创建一个新的种族设定
npx worldengine template init race race-my-race

# 创建一个新的人物设定
npx worldengine template init character char-my-hero
```

#### 4. 编辑设定文件

打开生成的 YAML 文件，根据模板要求填写内容。可参考 `submissions/<category>/_example.yaml` 示例文件。

#### 5. 本地验证

```bash
# 运行完整的交叉验证
npx worldengine validate --cross
```

#### 6. 提交 PR

将修改提交到 Git 仓库并创建 Pull Request，CI 管线会自动运行验证。

### 相关文档

- [模板参考 (TEMPLATES.md)](./TEMPLATES.md) - 所有模板的详细定义
- [教程 (TUTORIAL.md)](./TUTORIAL.md) - 完整的提交流程演示
- [验证规则 (VALIDATION.md)](./VALIDATION.md) - 交叉验证规则和错误码
- [版本系统 (VERSIONING.md)](./VERSIONING.md) - 正史/野史系统说明
- [时间系统 (TIME_SYSTEM.md)](./TIME_SYSTEM.md) - 纪元和时间线说明
- [命令行参考 (CLI.md)](./CLI.md) - CLI 命令详细用法

---

## English

### Project Introduction

WorldEngine is a YAML template-based world-building submission system with an integrated cross-validation CI pipeline. Inspired by established world-building systems like Jiuzhou, it provides standardized templates (with required and optional fields) for different types of settings including characters, races, creatures, flora, locations, history, and more.

Contributors submit settings by filling out templates. The CI pipeline automatically performs cross-reference validation (such as checking character lifespan against race average lifespan). Validated settings are automatically archived to a separate output directory for future reference.

### Core Concepts

#### Template

A template defines the YAML structure of required and optional fields for a specific type of setting. Each template contains:
- **Required fields**: Must be filled when submitting
- **Optional fields**: Can be optionally filled
- **Field constraints**: Type checking, regex patterns, numeric ranges, etc.

The system supports 9 setting categories:
| Category | Identifier | Description |
|----------|------------|-------------|
| Character | character | Characters in the world |
| Race | race | Intelligent races or species |
| Creature | creature | Animals, monsters, etc. |
| Flora | flora | Plants, herbs, etc. |
| Location | location | Places, regions, countries |
| History | history | Historical events |
| Faction | faction | Nations, organizations, factions |
| Artifact | artifact | Magical items, equipment |
| Concept | concept | Abstract concepts, magic systems |

#### Submission

A submission file is a YAML setting file filled out by contributors according to a template. Each submission must:
- Declare the template type (`template` field)
- Include a unique identifier (`id` field)
- Fill in all required fields

#### Registry

The registry is a collection of validated settings stored in the `_build/` output directory. The registry is used for:
- Reference baseline during cross-validation
- Querying existing setting information
- Ensuring consistency between settings

#### Cross Validation

The cross-validator checks reference integrity and numeric consistency between different settings:
- **Reference validation**: Ensures referenced entities (races, factions, etc.) exist
- **Lifespan validation**: Character lifespan doesn't exceed 150% of race average
- **Timeline validation**: Event time falls within participating characters' lifespans
- **Canon/non-canon validation**: At most one canon version per event

### Directory Structure

```
worldengine/
├── templates/                    # Template definitions
│   ├── character.yaml           # Character template
│   ├── race.yaml                # Race template
│   ├── creature.yaml            # Creature template
│   ├── flora.yaml               # Flora template
│   ├── location.yaml            # Location template
│   ├── history.yaml             # History event template
│   ├── faction.yaml             # Faction template
│   ├── artifact.yaml            # Artifact template
│   └── concept.yaml             # Concept template
├── submissions/                  # Submission files
│   ├── character/               # Character submissions
│   │   ├── _example.yaml        # Example file (excluded from validation)
│   │   └── char-xxx.yaml        # Actual submissions
│   ├── race/                    # Race submissions
│   └── ...                      # Other categories
├── _build/                       # Output directory (auto-generated, do not modify)
│   ├── _index.yaml              # Registry index
│   └── <category>/              # Category archives
├── docs/                         # Documentation
│   ├── README.md                # Project overview (this document)
│   ├── TEMPLATES.md             # Template reference
│   ├── TUTORIAL.md              # Tutorial
│   ├── VALIDATION.md            # Validation rules
│   ├── VERSIONING.md            # Versioning system
│   ├── TIME_SYSTEM.md           # Time system
│   └── CLI.md                   # CLI reference
└── src/                          # Source code
```

### Quick Start

#### 1. Install Dependencies

```bash
npm install
npm run build
```

#### 2. List Available Templates

```bash
npx worldengine template list
```

#### 3. Create a New Setting

```bash
# Create a new race setting
npx worldengine template init race race-my-race

# Create a new character setting
npx worldengine template init character char-my-hero
```

#### 4. Edit the Setting File

Open the generated YAML file and fill in the content according to template requirements. Refer to `submissions/<category>/_example.yaml` for examples.

#### 5. Local Validation

```bash
# Run full cross-validation
npx worldengine validate --cross
```

#### 6. Submit a PR

Commit your changes to the Git repository and create a Pull Request. The CI pipeline will automatically run validation.

### Related Documentation

- [Template Reference (TEMPLATES.md)](./TEMPLATES.md) - Detailed template definitions
- [Tutorial (TUTORIAL.md)](./TUTORIAL.md) - Complete submission workflow demo
- [Validation Rules (VALIDATION.md)](./VALIDATION.md) - Cross-validation rules and error codes
- [Versioning System (VERSIONING.md)](./VERSIONING.md) - Canon/non-canon system
- [Time System (TIME_SYSTEM.md)](./TIME_SYSTEM.md) - Epochs and timeline
- [CLI Reference (CLI.md)](./CLI.md) - Detailed CLI command usage

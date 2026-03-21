[English](CONTRIBUTING.md)

# 贡献指南

## 快速开始

```bash
# 1. Fork 并克隆仓库
git clone https://github.com/<your-username>/world-engine.git
cd world-engine
pip install -e ".[dev]"

# 2. 创建分支
git checkout -b lore/<类型>/<slug>
# 示例: git checkout -b lore/character/nü-wa

# 3. 创建设定文件
# YAML: world/entities/<类型>/<id>.yaml
# 散文: world/entities/<类型>/<id>.md

# 4. 本地验证
worldengine validate

# 5. 推送并提交 PR
git push origin lore/<类型>/<slug>
```

## 文件结构

每个设定条目由两个文件组成：
- `<id>.yaml` — 结构化数据（机器可读）
- `<id>.md` — 叙事散文（人类可读）

两个文件的文件名（不含扩展名）必须与实体的 `id` 字段一致。

## YAML 格式

```yaml
id: char-example
type: character
name:
  zh: 中文名
  en: English Name
epoch: "epoch:01"
tags: [标签1, 标签2]
status: draft
summary:
  zh: 中文摘要
  en: English summary
```

完整的字段定义请参考 `schemas/` 目录下的 Pydantic 模型。

## 关系

实体之间的关联关系存放在 `world/relations/` 目录下：

```yaml
id: rel-example
type: relation
source: char-example
target: evt-example
relation_type: caused
epoch: "epoch:01"
description:
  zh: 描述
  en: Description
```

有效的关系类型定义在 `world/relations/_schema.yaml` 中。

## 元注释

元层级观察（仅限 epoch:07）存放在 `world/meta/` 目录下：

```yaml
id: meta-ann-NNN
type: meta_annotation
target: <entity-id>
annotation_type: narrative_awareness
epoch: "epoch:07"
observer: civ-tian-ji-ge
content:
  zh: 中文内容
  en: English content
```

## 命名规范

详见 [docs/NAMING.zh.md](NAMING.zh.md)。

## 审核流程

1. 使用「新设定条目」模板创建 Issue（推荐但非必须）
2. 创建分支并编写文件
3. 本地运行 `worldengine validate` 验证
4. 提交 PR — CI 会自动运行 Schema 和规则验证
5. AI 审核会发布评论（仅供参考，不会阻塞合并）
6. 维护者审核后合并

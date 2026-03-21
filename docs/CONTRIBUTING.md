[中文版](CONTRIBUTING.zh.md)

# Contributing to World Engine 贡献指南

## Quick Start

```bash
# 1. Fork and clone
git clone https://github.com/<your-username>/world-engine.git
cd world-engine
pip install -e ".[dev]"

# 2. Create a branch
git checkout -b lore/<type>/<slug>
# Example: git checkout -b lore/character/nü-wa

# 3. Create your lore files
# YAML: world/entities/<type>/<id>.yaml
# Prose: world/entities/<type>/<id>.md

# 4. Validate locally
worldengine validate

# 5. Push and open a PR
git push origin lore/<type>/<slug>
```

## File Structure

Every lore entry consists of two files:
- `<id>.yaml` — Structured data (machine-readable)
- `<id>.md` — Narrative prose (human-readable)

Both files must have the same stem as the entity's `id` field.

## YAML Format

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

See `schemas/` for the full Pydantic models defining each entity type.

## Relations

Connections between entities go in `world/relations/`:

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

Valid relation types are defined in `world/relations/_schema.yaml`.

## Meta Annotations

Meta-layer observations (epoch:07 only) go in `world/meta/`:

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

## Naming Conventions

See [docs/NAMING.md](NAMING.md) for full conventions.

## Review Process

1. Open an issue using the "New Lore Entry" template (optional but recommended)
2. Create your branch and files
3. Run `worldengine validate` locally
4. Open a PR — CI will run schema + rule validation automatically
5. AI review will post comments (advisory only, does not block merge)
6. A maintainer will review and merge

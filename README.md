# World Engine 世界引擎

Epic worldbuilding as code — a CI-driven system for managing large-scale fictional worlds.

## Overview

World Engine treats worldbuilding like software engineering:
- Lore is stored as structured YAML data + Markdown prose
- Deterministic rules enforce consistency (schema, timeline, references)
- AI provides semantic review (tone, style, epoch compatibility)
- Contributors submit lore via Pull Requests

## World: 山海纪 (Chronicles of Mountains and Seas)

A multi-epoch world inspired by Chinese mythology (山海经 / Shan Hai Jing), spanning from primordial chaos to civilizational collapse.

| Epoch | Name | Theme |
|-------|------|-------|
| 01 | 混沌 (Hùn Dùn) | Primordial chaos, creation |
| 02 | 太初 (Tài Chū) | First dawn, elemental forces |
| 03 | 神荒 (Shén Huāng) | Age of spirits and wild gods |
| 04 | 万国 (Wàn Guó) | Rise of civilizations |
| 05 | 礼法 (Lǐ Fǎ) | Order, bureaucracy, codification |
| 06 | 金潮 (Jīn Cháo) | Hyper-commercialization, capitalism metaphor |
| 07 | 元寂 (Yuán Jì) | Meta-awareness, narrative collapse |

## Quick Start

```bash
pip install -e ".[dev]"
worldengine validate
worldengine validate --schema
worldengine validate --rules
worldengine ai-review <file>
worldengine export-schema
```

## Project Structure

- `world/` — All lore data (YAML + Markdown)
  - `epochs/` — Epoch definitions
  - `entities/` — Flat-by-type entity storage
  - `relations/` — Typed relationship graph
  - `meta/` — Externalized meta-layer annotations
- `schemas/` — Pydantic v2 models
- `engine/` — Validation engine + CLI
- `docs/` — Contributor documentation

## Documentation / 文档

See [docs/INDEX.md](docs/INDEX.md) for the full documentation index (English & 中文).

## Contributing

See [Contributing Guide](docs/CONTRIBUTING.md) | [贡献指南](docs/CONTRIBUTING.zh.md)

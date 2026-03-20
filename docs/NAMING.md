# Naming Conventions 命名规范

## IDs

All IDs are globally unique, lowercase, hyphen-separated pinyin.

| Type | Prefix | Pattern | Example |
|------|--------|---------|---------|
| Character | `char-` | `char-{pinyin}` | `char-pan-gu` |
| Civilization | `civ-` | `civ-{pinyin}` | `civ-yuan-ling` |
| Location | `loc-` | `loc-{pinyin}` | `loc-bu-zhou-shan` |
| Event | `evt-` | `evt-{pinyin}` | `evt-kai-tian-pi-di` |
| Artifact | `art-` | `art-{pinyin}` | `art-pan-gu-fu` |
| Concept | `con-` | `con-{pinyin}` | `con-hun-dun-zhi-li` |
| Creature | `cre-` | `cre-{pinyin}` | `cre-bi-fang` |
| Relation | `rel-` | `rel-{slug}` | `rel-pangu-kaitian` |
| Meta Annotation | `meta-ann-` | `meta-ann-{NNN}` | `meta-ann-001` |

## Epochs

| Directory | ID |
|-----------|-----|
| `e01-hun-dun` | `epoch:01` |
| `e02-tai-chu` | `epoch:02` |
| `e03-shen-huang` | `epoch:03` |
| `e04-wan-guo` | `epoch:04` |
| `e05-li-fa` | `epoch:05` |
| `e06-jin-chao` | `epoch:06` |
| `e07-yuan-ji` | `epoch:07` |

## Files

- YAML and Markdown files share the same stem: `char-pan-gu.yaml` + `char-pan-gu.md`
- The filename stem must match the `id` field in the YAML
- Entities are stored flat by type under `world/entities/<type>/`
- Optional epoch subdirectories allowed: `world/entities/characters/e04/char-li-ming.yaml`

## Pinyin Rules

- Use standard pinyin without tone marks
- Separate syllables with hyphens: `bu-zhou-shan` not `buzhoushan`
- Use lowercase only
- Avoid abbreviations

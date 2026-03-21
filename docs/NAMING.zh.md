[English](NAMING.md)

# 命名规范

## ID 规则

所有 ID 全局唯一，使用小写拼音，音节之间用连字符分隔。

| 类型 | 前缀 | 格式 | 示例 |
|------|------|------|------|
| 角色 | `char-` | `char-{拼音}` | `char-pan-gu` |
| 文明 | `civ-` | `civ-{拼音}` | `civ-yuan-ling` |
| 地点 | `loc-` | `loc-{拼音}` | `loc-bu-zhou-shan` |
| 事件 | `evt-` | `evt-{拼音}` | `evt-kai-tian-pi-di` |
| 神器 | `art-` | `art-{拼音}` | `art-pan-gu-fu` |
| 概念 | `con-` | `con-{拼音}` | `con-hun-dun-zhi-li` |
| 生物 | `cre-` | `cre-{拼音}` | `cre-bi-fang` |
| 关系 | `rel-` | `rel-{slug}` | `rel-pangu-kaitian` |
| 元注释 | `meta-ann-` | `meta-ann-{NNN}` | `meta-ann-001` |

## 纪元

| 目录名 | ID |
|--------|-----|
| `e01-hun-dun` | `epoch:01` |
| `e02-tai-chu` | `epoch:02` |
| `e03-shen-huang` | `epoch:03` |
| `e04-wan-guo` | `epoch:04` |
| `e05-li-fa` | `epoch:05` |
| `e06-jin-chao` | `epoch:06` |
| `e07-yuan-ji` | `epoch:07` |

## 文件

- YAML 和 Markdown 文件共享相同的文件名（不含扩展名）：`char-pan-gu.yaml` + `char-pan-gu.md`
- 文件名必须与 YAML 中的 `id` 字段一致
- 实体按类型平铺存放在 `world/entities/<类型>/` 下
- 可选的纪元子目录：`world/entities/characters/e04/char-li-ming.yaml`

## 拼音规则

- 使用标准拼音，不标声调
- 音节之间用连字符分隔：`bu-zhou-shan` 而非 `buzhoushan`
- 仅使用小写字母
- 避免使用缩写

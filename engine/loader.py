"""YAML loader and schema validation engine."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import yaml
from pydantic import ValidationError

from schemas import MODEL_MAP
from schemas.epoch import Epoch, EpochIndex
from schemas.relation import Relation, RelationTypeRegistry
from schemas.meta import MetaAnnotation


@dataclass
class SchemaError:
    file: str
    message: str

    def __str__(self) -> str:
        return f"{self.file}: {self.message}"


@dataclass
class WorldData:
    entities: dict[str, dict] = field(default_factory=dict)  # id -> parsed model dict
    entity_models: dict[str, object] = field(default_factory=dict)  # id -> pydantic model
    entity_files: dict[str, str] = field(default_factory=dict)  # id -> file path
    relations: list[Relation] = field(default_factory=list)
    meta_annotations: list[MetaAnnotation] = field(default_factory=list)
    epoch_index: EpochIndex | None = None
    epochs: dict[str, Epoch] = field(default_factory=dict)  # epoch:NN -> Epoch
    relation_registry: RelationTypeRegistry | None = None
    all_yaml_files: list[str] = field(default_factory=list)
    all_md_files: list[str] = field(default_factory=list)


def _load_yaml(path: Path) -> dict | None:
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def load_world(world_root: str) -> tuple[WorldData | None, list[SchemaError]]:
    """Load and validate all YAML files under world_root."""
    root = Path(world_root)
    errors: list[SchemaError] = []
    world = WorldData()

    if not root.exists():
        errors.append(SchemaError(world_root, "World root directory not found"))
        return None, errors

    # Collect all files
    for p in root.rglob("*.yaml"):
        world.all_yaml_files.append(str(p))
    for p in root.rglob("*.md"):
        world.all_md_files.append(str(p))

    # Load epoch index
    idx_path = root / "epochs" / "_index.yaml"
    if idx_path.exists():
        try:
            data = _load_yaml(idx_path)
            world.epoch_index = EpochIndex(**data)
        except (ValidationError, Exception) as e:
            errors.append(SchemaError(str(idx_path), str(e)))

    # Load relation type registry
    schema_path = root / "relations" / "_schema.yaml"
    if schema_path.exists():
        try:
            data = _load_yaml(schema_path)
            world.relation_registry = RelationTypeRegistry(**data)
        except (ValidationError, Exception) as e:
            errors.append(SchemaError(str(schema_path), str(e)))

    # Load epoch definitions
    for epoch_dir in sorted((root / "epochs").iterdir()):
        if not epoch_dir.is_dir():
            continue
        ep_file = epoch_dir / "epoch.yaml"
        if ep_file.exists():
            try:
                data = _load_yaml(ep_file)
                if data:
                    epoch = Epoch(**data)
                    world.epochs[epoch.id] = epoch
            except (ValidationError, Exception) as e:
                errors.append(SchemaError(str(ep_file), str(e)))

    # Load entities (recursive walk under entities/)
    entities_root = root / "entities"
    if entities_root.exists():
        for yaml_file in sorted(entities_root.rglob("*.yaml")):
            if yaml_file.name.startswith("_"):
                continue
            try:
                data = _load_yaml(yaml_file)
                if not data or "type" not in data:
                    errors.append(SchemaError(str(yaml_file), "Missing 'type' field"))
                    continue
                entity_type = data["type"]
                model_cls = MODEL_MAP.get(entity_type)
                if not model_cls:
                    errors.append(SchemaError(str(yaml_file), f"Unknown type: {entity_type}"))
                    continue
                model = model_cls(**data)
                world.entities[model.id] = data
                world.entity_models[model.id] = model
                world.entity_files[model.id] = str(yaml_file)
            except ValidationError as e:
                errors.append(SchemaError(str(yaml_file), str(e)))
            except Exception as e:
                errors.append(SchemaError(str(yaml_file), str(e)))

    # Load relations
    relations_root = root / "relations"
    if relations_root.exists():
        for yaml_file in sorted(relations_root.rglob("*.yaml")):
            if yaml_file.name.startswith("_"):
                continue
            try:
                data = _load_yaml(yaml_file)
                if not data:
                    continue
                rel = Relation(**data)
                world.relations.append(rel)
                world.entity_files[rel.id] = str(yaml_file)
            except ValidationError as e:
                errors.append(SchemaError(str(yaml_file), str(e)))
            except Exception as e:
                errors.append(SchemaError(str(yaml_file), str(e)))

    # Load meta annotations
    meta_root = root / "meta"
    if meta_root.exists():
        for yaml_file in sorted(meta_root.rglob("*.yaml")):
            if yaml_file.name.startswith("_"):
                continue
            try:
                data = _load_yaml(yaml_file)
                if not data:
                    continue
                ann = MetaAnnotation(**data)
                world.meta_annotations.append(ann)
                world.entity_files[ann.id] = str(yaml_file)
            except ValidationError as e:
                errors.append(SchemaError(str(yaml_file), str(e)))
            except Exception as e:
                errors.append(SchemaError(str(yaml_file), str(e)))

    return world, errors

"""Export Pydantic models as JSON Schema files."""

from __future__ import annotations

import json
from pathlib import Path

from schemas import MODEL_MAP
from schemas.epoch import EpochIndex
from schemas.relation import RelationTypeRegistry
from schemas.meta import MetaIndex


def export_schemas(output_dir: str) -> None:
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    all_models = {
        **MODEL_MAP,
        "epoch_index": EpochIndex,
        "relation_type_registry": RelationTypeRegistry,
        "meta_index": MetaIndex,
    }

    for name, model_cls in all_models.items():
        schema = model_cls.model_json_schema()
        path = out / f"{name}.schema.json"
        with open(path, "w", encoding="utf-8") as f:
            json.dump(schema, f, indent=2, ensure_ascii=False)
        print(f"  Exported {path}")

    print(f"\n✓ {len(all_models)} schemas exported to {output_dir}/")

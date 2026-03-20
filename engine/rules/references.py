"""Reference integrity rules: ID uniqueness, relation/meta target resolution."""

from __future__ import annotations

from engine.loader import WorldData
from engine.rules import RuleViolation


def check(world: WorldData) -> list[RuleViolation]:
    v: list[RuleViolation] = []

    # Collect all IDs and detect duplicates
    seen: dict[str, str] = {}  # id -> first file
    for eid, fpath in world.entity_files.items():
        if eid in seen:
            v.append(RuleViolation(
                rule="id-uniqueness",
                severity="hard",
                message=f"Duplicate ID '{eid}' (also in {seen[eid]})",
                file=fpath,
            ))
        else:
            seen[eid] = fpath

    entity_ids = set(world.entities.keys())

    # Valid epoch IDs
    valid_epochs: set[str] = set()
    if world.epoch_index:
        valid_epochs = {e.id for e in world.epoch_index.epochs}

    # Check epoch references in entities
    for eid, model in world.entity_models.items():
        epoch_val = getattr(model, "epoch", None)
        if epoch_val and valid_epochs and epoch_val not in valid_epochs:
            v.append(RuleViolation(
                rule="epoch-existence",
                severity="hard",
                message=f"Entity '{eid}' references non-existent epoch '{epoch_val}'",
                file=world.entity_files.get(eid, ""),
            ))

    # Check relation source/target exist
    for rel in world.relations:
        if rel.source not in entity_ids:
            v.append(RuleViolation(
                rule="relation-source-exists",
                severity="hard",
                message=f"Relation '{rel.id}' source '{rel.source}' not found",
                file=world.entity_files.get(rel.id, ""),
            ))
        if rel.target not in entity_ids:
            v.append(RuleViolation(
                rule="relation-target-exists",
                severity="hard",
                message=f"Relation '{rel.id}' target '{rel.target}' not found",
                file=world.entity_files.get(rel.id, ""),
            ))
        if valid_epochs and rel.epoch not in valid_epochs:
            v.append(RuleViolation(
                rule="epoch-existence",
                severity="hard",
                message=f"Relation '{rel.id}' references non-existent epoch '{rel.epoch}'",
                file=world.entity_files.get(rel.id, ""),
            ))

    # Check meta annotation targets
    for ann in world.meta_annotations:
        if ann.target not in entity_ids:
            v.append(RuleViolation(
                rule="meta-target-exists",
                severity="hard",
                message=f"Meta '{ann.id}' target '{ann.target}' not found",
                file=world.entity_files.get(ann.id, ""),
            ))
        if ann.observer not in entity_ids:
            v.append(RuleViolation(
                rule="meta-observer-exists",
                severity="hard",
                message=f"Meta '{ann.id}' observer '{ann.observer}' not found",
                file=world.entity_files.get(ann.id, ""),
            ))

    return v

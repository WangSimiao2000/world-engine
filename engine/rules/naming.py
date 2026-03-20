"""Naming convention rules: ID format, filename-ID match, orphan files."""

from __future__ import annotations

import re
from pathlib import Path

from engine.loader import WorldData
from engine.rules import RuleViolation

ID_PATTERNS: dict[str, re.Pattern] = {
    "character": re.compile(r"^char-[a-z0-9-]+$"),
    "civilization": re.compile(r"^civ-[a-z0-9-]+$"),
    "location": re.compile(r"^loc-[a-z0-9-]+$"),
    "event": re.compile(r"^evt-[a-z0-9-]+$"),
    "artifact": re.compile(r"^art-[a-z0-9-]+$"),
    "concept": re.compile(r"^con-[a-z0-9-]+$"),
    "creature": re.compile(r"^cre-[a-z0-9-]+$"),
    "relation": re.compile(r"^rel-[a-z0-9-]+$"),
    "meta_annotation": re.compile(r"^meta-ann-\d{3,}$"),
}


def check(world: WorldData) -> list[RuleViolation]:
    v: list[RuleViolation] = []

    # ID format check
    for eid, model in world.entity_models.items():
        entity_type = getattr(model, "type", "")
        pattern = ID_PATTERNS.get(entity_type)
        if pattern and not pattern.match(eid):
            v.append(RuleViolation(
                rule="id-format",
                severity="hard",
                message=f"ID '{eid}' doesn't match pattern for type '{entity_type}'",
                file=world.entity_files.get(eid, ""),
            ))

    for rel in world.relations:
        pattern = ID_PATTERNS.get("relation")
        if pattern and not pattern.match(rel.id):
            v.append(RuleViolation(
                rule="id-format",
                severity="hard",
                message=f"Relation ID '{rel.id}' doesn't match pattern",
                file=world.entity_files.get(rel.id, ""),
            ))

    for ann in world.meta_annotations:
        pattern = ID_PATTERNS.get("meta_annotation")
        if pattern and not pattern.match(ann.id):
            v.append(RuleViolation(
                rule="id-format",
                severity="hard",
                message=f"Meta ID '{ann.id}' doesn't match pattern",
                file=world.entity_files.get(ann.id, ""),
            ))

    # Filename-ID match
    for eid, fpath in world.entity_files.items():
        stem = Path(fpath).stem
        if stem != eid:
            v.append(RuleViolation(
                rule="filename-id-match",
                severity="hard",
                message=f"Filename '{stem}' doesn't match ID '{eid}'",
                file=fpath,
            ))

    # Orphan file detection: MD without YAML or vice versa
    yaml_stems: set[str] = set()
    md_stems: set[str] = set()
    for f in world.all_yaml_files:
        p = Path(f)
        if not p.name.startswith("_") and "epochs" not in p.parts[-2:]:
            yaml_stems.add(str(p.with_suffix("")))
    for f in world.all_md_files:
        md_stems.add(str(Path(f).with_suffix("")))

    for stem in yaml_stems - md_stems:
        # Only warn for entity files (under entities/)
        if "entities" in stem:
            v.append(RuleViolation(
                rule="orphan-file",
                severity="warn",
                message=f"YAML without matching Markdown",
                file=stem + ".yaml",
            ))
    for stem in md_stems - yaml_stems:
        if "entities" in stem:
            v.append(RuleViolation(
                rule="orphan-file",
                severity="warn",
                message=f"Markdown without matching YAML",
                file=stem + ".md",
            ))

    return v

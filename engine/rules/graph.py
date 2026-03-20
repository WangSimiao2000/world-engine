"""Graph rules: relation type validity, cycle detection, orphan entities."""

from __future__ import annotations

from collections import defaultdict

from engine.loader import WorldData
from engine.rules import RuleViolation


def check(world: WorldData) -> list[RuleViolation]:
    v: list[RuleViolation] = []

    # Relation type validity
    valid_types: set[str] = set()
    if world.relation_registry:
        valid_types = {rt.id for rt in world.relation_registry.relation_types}

    for rel in world.relations:
        if valid_types and rel.relation_type not in valid_types:
            v.append(RuleViolation(
                rule="relation-type-valid",
                severity="hard",
                message=f"Relation '{rel.id}' uses unknown type '{rel.relation_type}'",
                file=world.entity_files.get(rel.id, ""),
            ))

    # Build adjacency for cycle detection
    graph: dict[str, list[str]] = defaultdict(list)
    for rel in world.relations:
        graph[rel.source].append(rel.target)

    # Simple cycle detection via DFS
    WHITE, GRAY, BLACK = 0, 1, 2
    color: dict[str, int] = defaultdict(int)
    cycles_found: list[str] = []

    def dfs(node: str) -> bool:
        color[node] = GRAY
        for neighbor in graph.get(node, []):
            if color[neighbor] == GRAY:
                cycles_found.append(f"{node} -> {neighbor}")
                return True
            if color[neighbor] == WHITE and dfs(neighbor):
                return True
        color[node] = BLACK
        return False

    for node in graph:
        if color[node] == WHITE:
            dfs(node)

    for cycle in cycles_found:
        v.append(RuleViolation(
            rule="graph-cycle",
            severity="warn",
            message=f"Potential cycle detected: {cycle}",
        ))

    # Orphan entities (no relations)
    if world.relations:
        connected = set()
        for rel in world.relations:
            connected.add(rel.source)
            connected.add(rel.target)
        for eid in world.entities:
            if eid not in connected:
                v.append(RuleViolation(
                    rule="orphan-entity",
                    severity="warn",
                    message=f"Entity '{eid}' has no relations",
                    file=world.entity_files.get(eid, ""),
                ))

    return v

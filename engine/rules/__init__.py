"""Deterministic rule engine."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class RuleViolation:
    rule: str
    severity: str  # "hard" or "warn"
    message: str
    file: str = ""


def run_all_rules(world) -> list[RuleViolation]:
    from engine.rules.references import check as check_references
    from engine.rules.naming import check as check_naming
    from engine.rules.timeline import check as check_timeline
    from engine.rules.graph import check as check_graph

    violations: list[RuleViolation] = []
    violations.extend(check_references(world))
    violations.extend(check_naming(world))
    violations.extend(check_timeline(world))
    violations.extend(check_graph(world))
    return violations

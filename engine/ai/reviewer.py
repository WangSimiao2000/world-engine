"""AI review orchestrator."""

from __future__ import annotations

from pathlib import Path
from typing import Optional

import yaml
from pydantic import BaseModel

from engine.loader import WorldData


class AICheck(BaseModel):
    check: str
    severity: str  # "error", "warning", "info"
    passed: bool
    message: str
    suggestion: str = ""


class AIReviewResult(BaseModel):
    file: str
    checks: list[AICheck]
    overall: str  # "pass", "warning", "error"


def _get_related_yaml(world: WorldData, entity_id: str) -> str:
    """Gather YAML of entities related to the given entity via relations."""
    related_ids: set[str] = set()
    for rel in world.relations:
        if rel.source == entity_id:
            related_ids.add(rel.target)
        elif rel.target == entity_id:
            related_ids.add(rel.source)

    parts: list[str] = []
    for rid in related_ids:
        if rid in world.entities:
            parts.append(yaml.dump(world.entities[rid], allow_unicode=True, default_flow_style=False))
    return "\n---\n".join(parts) if parts else "(none)"


def _read_prose(yaml_path: str) -> str:
    """Read the matching .md file for a YAML entity."""
    md_path = Path(yaml_path).with_suffix(".md")
    if md_path.exists():
        return md_path.read_text(encoding="utf-8")
    return "(no prose file)"


def review_files(
    world: WorldData,
    files: list[str],
    changed_only: bool = False,
) -> list[AIReviewResult]:
    """Run AI review on specified files."""
    import os

    from engine.ai.provider import OpenAIProvider
    from engine.ai.prompts.consistency import PROMPT_TEMPLATE as CONSISTENCY_PROMPT
    from engine.ai.prompts.tone import PROMPT_TEMPLATE as TONE_PROMPT
    from engine.ai.prompts.epoch_compat import PROMPT_TEMPLATE as EPOCH_PROMPT

    model = os.environ.get("WORLDENGINE_AI_MODEL", "gpt-4o")
    provider = OpenAIProvider(model=model)

    # If no files specified, review all entities
    if not files:
        files = list(world.entity_files.values())

    results: list[AIReviewResult] = []

    for fpath in files:
        # Find entity by file path
        entity_id: Optional[str] = None
        for eid, ef in world.entity_files.items():
            if ef == fpath or Path(ef).resolve() == Path(fpath).resolve():
                entity_id = eid
                break

        if not entity_id or entity_id not in world.entities:
            continue

        entity_data = world.entities[entity_id]
        entity_yaml = yaml.dump(entity_data, allow_unicode=True, default_flow_style=False)
        epoch = entity_data.get("epoch", "")

        checks: list[AICheck] = []

        # 1. Consistency check
        try:
            related = _get_related_yaml(world, entity_id)
            prompt = CONSISTENCY_PROMPT.format(entity_yaml=entity_yaml, related_yaml=related)
            result = provider.review(prompt, AICheck)
            result.check = "consistency"
            checks.append(result)
        except Exception as e:
            checks.append(AICheck(check="consistency", severity="error", passed=False, message=f"AI error: {e}"))

        # 2. Tone check
        try:
            prose = _read_prose(fpath)
            prompt = TONE_PROMPT.format(epoch=epoch, entity_yaml=entity_yaml, prose_content=prose)
            result = provider.review(prompt, AICheck)
            result.check = "tone"
            checks.append(result)
        except Exception as e:
            checks.append(AICheck(check="tone", severity="error", passed=False, message=f"AI error: {e}"))

        # 3. Epoch compatibility
        try:
            epoch_info = ""
            for eid, ep in world.epochs.items():
                epoch_info += f"- {eid}: {ep.name.zh} / {ep.name.en} — {ep.theme.zh}\n"
            prompt = EPOCH_PROMPT.format(epoch_info=epoch_info, entity_yaml=entity_yaml)
            result = provider.review(prompt, AICheck)
            result.check = "epoch_compat"
            checks.append(result)
        except Exception as e:
            checks.append(AICheck(check="epoch_compat", severity="error", passed=False, message=f"AI error: {e}"))

        overall = "pass"
        if any(not c.passed and c.severity == "error" for c in checks):
            overall = "error"
        elif any(not c.passed for c in checks):
            overall = "warning"

        results.append(AIReviewResult(file=fpath, checks=checks, overall=overall))

    return results

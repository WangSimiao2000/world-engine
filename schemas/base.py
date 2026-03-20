from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


class EntityStatus(str, Enum):
    canonical = "canonical"
    draft = "draft"
    deprecated = "deprecated"


class BilingualText(BaseModel):
    zh: str
    en: str = ""


class EntityBase(BaseModel):
    id: str
    type: str
    name: BilingualText
    epoch: str = Field(pattern=r"^epoch:\d{2}$")
    tags: list[str] = []
    status: EntityStatus = EntityStatus.draft
    summary: BilingualText

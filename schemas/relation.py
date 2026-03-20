from pydantic import BaseModel, Field

from .base import BilingualText


class Relation(BaseModel):
    id: str
    type: str = "relation"
    source: str
    target: str
    relation_type: str
    epoch: str = Field(pattern=r"^epoch:\d{2}$")
    description: BilingualText


class RelationType(BaseModel):
    id: str
    zh: str
    inverse: str


class RelationTypeRegistry(BaseModel):
    relation_types: list[RelationType]

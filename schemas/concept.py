from .base import EntityBase


class Concept(EntityBase):
    type: str = "concept"
    domain: str = ""

from .base import EntityBase


class Creature(EntityBase):
    type: str = "creature"
    habitat: str = ""
    danger_level: int = 0

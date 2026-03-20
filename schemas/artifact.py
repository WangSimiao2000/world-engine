from .base import EntityBase


class Artifact(EntityBase):
    type: str = "artifact"
    origin: str = ""

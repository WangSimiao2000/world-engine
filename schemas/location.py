from .base import EntityBase


class Location(EntityBase):
    type: str = "location"
    region: str = ""

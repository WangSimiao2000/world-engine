from pydantic import Field

from .base import EntityBase


class Civilization(EntityBase):
    type: str = "civilization"
    rise_epoch: str = Field(default="", pattern=r"^(epoch:\d{2})?$")
    fall_epoch: str = Field(default="", pattern=r"^(epoch:\d{2})?$")

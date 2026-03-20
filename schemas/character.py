from typing import Optional

from pydantic import BaseModel, Field

from .base import EntityBase


class Lifespan(BaseModel):
    start: str = Field(pattern=r"^epoch:\d{2}$")
    end: str = Field(pattern=r"^epoch:\d{2}$")


class Character(EntityBase):
    type: str = "character"
    role: str = ""
    lifespan: Optional[Lifespan] = None

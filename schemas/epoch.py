from pydantic import BaseModel, Field

from .base import BilingualText


class Epoch(BaseModel):
    id: str = Field(pattern=r"^epoch:\d{2}$")
    type: str = "epoch"
    name: BilingualText
    order: int = Field(ge=1)
    theme: BilingualText
    status: str = "canonical"


class EpochEntry(BaseModel):
    id: str = Field(pattern=r"^epoch:\d{2}$")
    name: BilingualText
    order: int = Field(ge=1)


class EpochIndex(BaseModel):
    epochs: list[EpochEntry]

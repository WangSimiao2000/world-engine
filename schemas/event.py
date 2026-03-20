from typing import Optional

from .base import EntityBase


class Event(EntityBase):
    type: str = "event"
    order: Optional[int] = None

from enum import Enum

from pydantic import BaseModel, Field

from .base import BilingualText


class MetaAnnotationType(str, Enum):
    pattern = "pattern"
    anomaly = "anomaly"
    narrative_awareness = "narrative_awareness"
    echo = "echo"


class MetaAnnotation(BaseModel):
    id: str
    type: str = "meta_annotation"
    target: str
    annotation_type: MetaAnnotationType
    epoch: str = Field(pattern=r"^epoch:\d{2}$")
    observer: str
    content: BilingualText


class MetaIndex(BaseModel):
    annotations: list[str] = []

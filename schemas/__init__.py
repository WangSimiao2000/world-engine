from .base import BilingualText, EntityBase, EntityStatus
from .epoch import Epoch, EpochIndex
from .character import Character
from .civilization import Civilization
from .location import Location
from .event import Event
from .artifact import Artifact
from .concept import Concept
from .creature import Creature
from .relation import Relation, RelationType, RelationTypeRegistry
from .meta import MetaAnnotation, MetaAnnotationType

MODEL_MAP: dict[str, type] = {
    "character": Character,
    "civilization": Civilization,
    "location": Location,
    "event": Event,
    "artifact": Artifact,
    "concept": Concept,
    "creature": Creature,
    "relation": Relation,
    "meta_annotation": MetaAnnotation,
    "epoch": Epoch,
}

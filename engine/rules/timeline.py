"""Timeline rules: event ordering, lifespan consistency."""

from __future__ import annotations

from engine.loader import WorldData
from engine.rules import RuleViolation


def _epoch_num(epoch_id: str) -> int:
    """Extract numeric part from epoch:NN."""
    try:
        return int(epoch_id.split(":")[1])
    except (IndexError, ValueError):
        return -1


def check(world: WorldData) -> list[RuleViolation]:
    v: list[RuleViolation] = []

    # Lifespan consistency: start <= end
    for eid, model in world.entity_models.items():
        lifespan = getattr(model, "lifespan", None)
        if lifespan:
            start = _epoch_num(lifespan.start)
            end = _epoch_num(lifespan.end)
            if start > 0 and end > 0 and start > end:
                v.append(RuleViolation(
                    rule="lifespan-order",
                    severity="hard",
                    message=f"Entity '{eid}' lifespan start ({lifespan.start}) > end ({lifespan.end})",
                    file=world.entity_files.get(eid, ""),
                ))

    # Civilization rise/fall consistency
    for eid, model in world.entity_models.items():
        rise = getattr(model, "rise_epoch", "")
        fall = getattr(model, "fall_epoch", "")
        if rise and fall:
            r = _epoch_num(rise)
            f = _epoch_num(fall)
            if r > 0 and f > 0 and r > f:
                v.append(RuleViolation(
                    rule="civ-rise-fall-order",
                    severity="hard",
                    message=f"Civilization '{eid}' rise ({rise}) > fall ({fall})",
                    file=world.entity_files.get(eid, ""),
                ))

    # Event ordering within same epoch
    epoch_events: dict[str, list[tuple[int, str]]] = {}
    for eid, model in world.entity_models.items():
        if getattr(model, "type", "") == "event":
            order = getattr(model, "order", None)
            epoch = getattr(model, "epoch", "")
            if order is not None and epoch:
                epoch_events.setdefault(epoch, []).append((order, eid))

    for epoch, events in epoch_events.items():
        seen_orders: dict[int, str] = {}
        for order, eid in events:
            if order in seen_orders:
                v.append(RuleViolation(
                    rule="event-order-duplicate",
                    severity="hard",
                    message=f"Events '{seen_orders[order]}' and '{eid}' share order {order} in {epoch}",
                    file=world.entity_files.get(eid, ""),
                ))
            seen_orders[order] = eid

    return v

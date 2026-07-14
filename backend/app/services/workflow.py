"""Central mutation helper (SPEC §11). Every mutation → audit + notification + last-updated bump.

Phase 0 provides the primitives; the full cross-portal loop is wired in Phase 3.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from app import models as m


def bump_last_updated(db: Session) -> datetime:
    state = db.get(m.AppState, 1)
    if state is None:
        state = m.AppState(id=1, last_updated=datetime.utcnow(), trend_points=[])
        db.add(state)
    state.last_updated = datetime.utcnow()
    db.flush()
    return state.last_updated


def add_audit(db: Session, *, label: str, actor_name: str,
              entity_id: int | None = None, case_id: int | None = None) -> m.AuditEvent:
    ev = m.AuditEvent(label=label, actor_name=actor_name, entity_id=entity_id, case_id=case_id)
    db.add(ev)
    return ev


def notify(db: Session, *, audience: str, kind: str, title: str, body: str = "",
           entity_id: int | None = None) -> m.Notification:
    n = m.Notification(audience=audience, kind=kind, title=title, body=body, entity_id=entity_id)
    db.add(n)
    return n


def last_updated(db: Session) -> datetime:
    state = db.get(m.AppState, 1)
    return state.last_updated if state else datetime.utcnow()

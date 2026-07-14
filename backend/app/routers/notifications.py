from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app import models as m

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


def _serialize(n: m.Notification) -> dict:
    return {
        "id": n.id, "audience": n.audience, "entity_id": n.entity_id, "kind": n.kind,
        "title": n.title, "body": n.body,
        "created_at": n.created_at.isoformat() if n.created_at else None, "read": n.read,
    }


@router.get("")
def list_notifications(
    audience: str = Query("dghr"),
    entity_id: int | None = Query(None),
    db: Session = Depends(get_db),
) -> dict:
    q = db.query(m.Notification).filter(m.Notification.audience == audience)
    if entity_id is not None:
        q = q.filter(m.Notification.entity_id == entity_id)
    items = q.order_by(m.Notification.created_at.desc()).all()
    unread = sum(1 for n in items if not n.read)
    return {"items": [_serialize(n) for n in items], "unread": unread}


class MarkReadBody(BaseModel):
    audience: str = "dghr"
    entity_id: int | None = None
    ids: list[int] | None = None  # None → mark all for audience/entity


@router.post("/mark-read")
def mark_read(body: MarkReadBody, db: Session = Depends(get_db)) -> dict:
    q = db.query(m.Notification).filter(m.Notification.audience == body.audience)
    if body.entity_id is not None:
        q = q.filter(m.Notification.entity_id == body.entity_id)
    if body.ids:
        q = q.filter(m.Notification.id.in_(body.ids))
    updated = 0
    for n in q.all():
        if not n.read:
            n.read = True
            updated += 1
    db.commit()
    return {"marked_read": updated}


@router.get("/poll")
def poll(
    audience: str = Query("dghr"),
    entity_id: int | None = Query(None),
    since: str | None = Query(None),
    db: Session = Depends(get_db),
) -> dict:
    q = db.query(m.Notification).filter(m.Notification.audience == audience)
    if entity_id is not None:
        q = q.filter(m.Notification.entity_id == entity_id)
    if since:
        try:
            since_dt = datetime.fromisoformat(since)
            q = q.filter(m.Notification.created_at > since_dt)
        except ValueError:
            pass
    new_items = q.order_by(m.Notification.created_at.desc()).all()
    unread_total = db.query(m.Notification).filter(
        m.Notification.audience == audience, m.Notification.read.is_(False),
        *([m.Notification.entity_id == entity_id] if entity_id is not None else []),
    ).count()
    return {
        "new": [_serialize(n) for n in new_items],
        "unread": unread_total,
        "server_time": datetime.utcnow().isoformat(),
    }

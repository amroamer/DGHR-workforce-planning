from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app import models as m

router = APIRouter(prefix="/api/entity", tags=["entity"])


@router.get("/{entity_id}/badges")
def badges(entity_id: int, db: Session = Depends(get_db)) -> dict:
    """Sidebar badge counts (SPEC §4.2 — Clarifications badge = open cases)."""
    open_cases = db.query(m.Case).filter(
        m.Case.entity_id == entity_id, m.Case.status == "open"
    ).count()
    return {"open_cases": open_cases}

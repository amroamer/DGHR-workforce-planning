from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.services import kpi

router = APIRouter(prefix="/api/dghr", tags=["dghr"])


@router.get("/command-center")
def command_center(
    page: int = Query(1, ge=1),
    page_size: int = Query(5, ge=1, le=50),
    db: Session = Depends(get_db),
) -> dict:
    """SPEC §9.1 — single reconciled payload (kpis, status_donut, actions_queue,
    forecasting, missing_summary, alerts, trend)."""
    return kpi.command_center(db, page=page, page_size=page_size)

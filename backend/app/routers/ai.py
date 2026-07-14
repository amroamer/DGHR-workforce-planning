from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.services import ai_service

router = APIRouter(prefix="/api/ai", tags=["ai"])


@router.post("/driver-summary/{entity_id}")
def driver_summary(entity_id: int, db: Session = Depends(get_db)) -> dict:
    return ai_service.driver_summary(db, entity_id)


@router.post("/anomaly-narrative/{anomaly_id}")
def anomaly_narrative(anomaly_id: int, db: Session = Depends(get_db)) -> dict:
    return ai_service.anomaly_narrative(db, anomaly_id)


class MapTitles(BaseModel):
    titles: list[str]


@router.post("/map-titles")
def map_titles(body: MapTitles, db: Session = Depends(get_db)) -> dict:
    return ai_service.map_titles(db, body.titles)

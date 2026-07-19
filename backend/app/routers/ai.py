from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
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


class ReportNarrative(BaseModel):
    scope: str  # "entity" | "gov"
    entity_id: int | None = None
    scenario: str = "base"


@router.post("/report-narrative")
def report_narrative(body: ReportNarrative, db: Session = Depends(get_db)) -> dict:
    if body.scope not in ("entity", "gov"):
        raise HTTPException(422, "scope must be 'entity' or 'gov'.")
    if body.scope == "entity" and body.entity_id is None:
        raise HTTPException(422, "entity_id is required for the entity scope.")
    return ai_service.report_narrative(db, body.scope, body.entity_id, body.scenario)


@router.post("/review-brief/{sub_id}")
def review_brief(sub_id: int, db: Session = Depends(get_db)) -> dict:
    """The DGHR reviewer's copilot: summary, risks and first checks for one submission version.
    Generated on demand and never cached — review state moves under it as decisions land."""
    return ai_service.review_brief(db, sub_id)


class AskData(BaseModel):
    question: str
    scope: str = "gov"  # "gov" | "entity"
    entity_id: int | None = None
    scenario: str = "base"
    history: list[dict[str, str]] = []


@router.post("/ask")
def ask(body: AskData, db: Session = Depends(get_db)) -> dict:
    """Ask-the-data chat over the government-wide OR one entity's position. Answers are grounded in a
    snapshot of the same figures the page renders — the model never sees anything else, so it can't
    invent one. This is the non-streaming path; the UI uses /ask/stream."""
    return ai_service.ask_data(db, body.question, body.history, body.scope, body.entity_id, body.scenario)


@router.post("/ask/stream")
def ask_stream(body: AskData, db: Session = Depends(get_db)) -> StreamingResponse:
    """Streaming variant — NDJSON lines: {"delta": "..."} per chunk, then {"done": true, "source": ...}.
    The data pack is built here while the request's DB session is open, then handed to a pure generator
    so the token stream can outlive the session."""
    pack = ai_service._ask_pack(db, body.scope, body.entity_id, body.scenario)
    return StreamingResponse(
        ai_service.ask_data_stream(pack, body.question, body.history),
        media_type="application/x-ndjson",
    )


class DraftClarification(BaseModel):
    submission_id: int
    direction: str  # "question" (DGHR asks) | "reply" (entity answers)
    element_type: str = "submission"
    element_key: str = ""
    element_label: str = ""
    clarification_id: int | None = None


@router.post("/draft-clarification")
def draft_clarification(body: DraftClarification, db: Session = Depends(get_db)) -> dict:
    if body.direction not in ("question", "reply"):
        raise HTTPException(422, "direction must be 'question' or 'reply'.")
    return ai_service.draft_clarification(
        db, body.submission_id, body.direction, body.element_type,
        body.element_key, body.element_label, body.clarification_id)

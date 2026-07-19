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


# ─────────────────────────── Agent #1 — Submission Pre-Review ───────────────────────────
@router.post("/pre-review/{sub_id}")
def pre_review(sub_id: int, db: Session = Depends(get_db)) -> dict:
    """Per-element approve/query verdicts + drafted clarifications + the overall move, for one version.
    Suggestions only — the UI applies each on the audited maker-checker path. Never cached."""
    return ai_service.pre_review(db, sub_id)


# ─────────────────────────── Agent #2 — Clarification Chase & Escalation ───────────────────────────
@router.post("/clarification-triage")
def clarification_triage(db: Session = Depends(get_db)) -> dict:
    """The open-clarification queue with a proposed move per item (remind / escalate / wait)."""
    return ai_service.clarification_triage(db)


class ChaseApply(BaseModel):
    clarification_id: int
    action: str  # "remind" | "escalate"
    message: str = ""


@router.post("/clarification-chase")
def clarification_chase(body: ChaseApply, db: Session = Depends(get_db)) -> dict:
    if body.action not in ("remind", "escalate"):
        raise HTTPException(422, "action must be 'remind' or 'escalate'.")
    out = ai_service.apply_chase(db, body.clarification_id, body.action, body.message)
    if not out.get("ok"):
        raise HTTPException(409, out.get("error", "Could not apply."))
    return out


# ─────────────────────────── Agent #3 — Data-Quality Sweep ───────────────────────────
@router.post("/quality-sweep")
def quality_sweep(db: Session = Depends(get_db)) -> dict:
    """Cross-entity data-quality insights computed across every received submission."""
    return ai_service.quality_sweep(db)

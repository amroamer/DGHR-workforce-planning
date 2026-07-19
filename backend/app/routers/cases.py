from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.services import cases

router = APIRouter(prefix="/api/cases", tags=["cases"])


@router.get("")
def list_cases(
    side: str = "dghr",
    entity_id: int | None = None,
    tab: str = "all",
    search: str | None = None,
    page: int = Query(1, ge=1),
    db: Session = Depends(get_db),
) -> dict:
    return cases.list_cases(db, side=side, entity_id=entity_id, tab=tab, search=search, page=page)


@router.get("/kpis")
def kpis(entity_id: int | None = None, db: Session = Depends(get_db)) -> dict:
    return cases.clarifications_kpis(db, entity_id=entity_id)


@router.get("/{case_id}")
def get_case(case_id: int, db: Session = Depends(get_db)) -> dict:
    d = cases.case_detail(db, case_id)
    if d is None:
        raise HTTPException(404, "Case not found")
    return d


class CreateCase(BaseModel):
    entity_id: int
    package_label: str = "Workforce Plan Q2 2025"
    issue_summary: str
    corrections: list[str] = []
    priority: str = "Medium"
    category: str = "Data Quality"
    origin: str = "dghr"  # dghr | entity


@router.post("")
def create_case(body: CreateCase, db: Session = Depends(get_db)) -> dict:
    c = cases.open_clarification(
        db, entity_id=body.entity_id, package_label=body.package_label,
        issue_summary=body.issue_summary, corrections=body.corrections,
        priority=body.priority, category=body.category, origin=body.origin,
    )
    return {"ok": True, "ref": c.ref, "id": c.id}


class Message(BaseModel):
    side: str  # dghr | entity
    body: str


@router.post("/{case_id}/messages")
def add_message(case_id: int, body: Message, db: Session = Depends(get_db)) -> dict:
    return cases.post_message(db, case_id=case_id, side=body.side, body=body.body)


class Action(BaseModel):
    action: str  # resolve|escalate|assign|request_evidence|accept_resubmission|return_to_entity|acknowledge|resubmit
    reviewer_id: int | None = None


@router.post("/{case_id}/action")
def act(case_id: int, body: Action, db: Session = Depends(get_db)) -> dict:
    if body.action == "acknowledge":
        return cases.entity_acknowledge(db, case_id=case_id)
    if body.action == "resubmit":
        return cases.entity_resubmit(db, case_id=case_id)
    return cases.case_action(db, case_id=case_id, action=body.action, reviewer_id=body.reviewer_id)

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.services import cases as cases_svc
from app.services import dghr_views, kpi, workflow
from app import models as m

router = APIRouter(prefix="/api/dghr", tags=["dghr"])


@router.get("/command-center")
def command_center(
    page: int = Query(1, ge=1),
    page_size: int = Query(5, ge=1, le=50),
    db: Session = Depends(get_db),
) -> dict:
    """SPEC §9.1 — single reconciled payload."""
    return kpi.command_center(db, page=page, page_size=page_size)


# ─────────────────────────── tracker (§9.3) ───────────────────────────
@router.get("/tracker")
def tracker(
    wave: str | None = None,
    status: str | None = None,
    reviewer: str | None = None,
    package: str | None = None,
    due: str | None = None,
    search: str | None = None,
    sort: str = "default",
    direction: str = "asc",
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
) -> dict:
    return dghr_views.build_tracker(
        db, wave=wave, status=status, reviewer=reviewer, package=package, due=due,
        search=search, sort=sort, direction=direction, page=page, page_size=page_size,
    )


@router.get("/tracker/blocked-summary")
def tracker_blocked(db: Session = Depends(get_db)) -> dict:
    return dghr_views.tracker_blocked_summary(db)


@router.get("/tracker/followups")
def tracker_followups(db: Session = Depends(get_db)) -> dict:
    return dghr_views.tracker_followups(db)


@router.get("/tracker/export.csv", response_class=PlainTextResponse)
def tracker_export(db: Session = Depends(get_db)) -> PlainTextResponse:
    csv = dghr_views.tracker_csv(db)
    return PlainTextResponse(
        csv,
        headers={"Content-Disposition": "attachment; filename=dghr-tracker.csv"},
        media_type="text/csv",
    )


# ─────────────────────────── config (§9.2) ───────────────────────────
@router.get("/config")
def config(db: Session = Depends(get_db)) -> dict:
    return dghr_views.build_config(db)


class PackagePatch(BaseModel):
    mandatory_enabled: bool | None = None


@router.patch("/config/packages/{package_id}")
def patch_package(package_id: int, body: PackagePatch, db: Session = Depends(get_db)) -> dict:
    p = db.get(m.DataPackage, package_id)
    if not p:
        raise HTTPException(404, "Package not found")
    if body.mandatory_enabled is not None:
        p.mandatory_enabled = body.mandatory_enabled
    workflow.add_audit(db, label=f"Package '{p.name}' configuration updated", actor_name="DGHR Admin")
    workflow.bump_last_updated(db)
    db.commit()
    return {"ok": True, "id": p.id, "mandatory_enabled": p.mandatory_enabled}


@router.post("/config/publish")
def publish_config(db: Session = Depends(get_db)) -> dict:
    cycle = db.query(m.CollectionCycle).first()
    if cycle:
        cycle.status = "published"
    workflow.notify(db, audience="entity", kind="announcement",
                    title="DGHR Announcement",
                    body="Workforce Planning 2025 request package has been published. Please review your required submissions.")
    workflow.add_audit(db, label="Request package published to all entities", actor_name="DGHR Admin")
    workflow.bump_last_updated(db)
    db.commit()
    return {"ok": True, "message": "Request package published to all entities."}


# ─────────────────────────── quality (§9.4) ───────────────────────────
@router.get("/quality")
def quality(
    page: int = Query(1, ge=1),
    page_size: int = Query(8, ge=1, le=50),
    db: Session = Depends(get_db),
) -> dict:
    return dghr_views.build_quality(db, page=page, page_size=page_size)


class IssuePatch(BaseModel):
    status: str | None = None
    assigned_to: int | None = None


@router.patch("/issues/{issue_id}")
def patch_issue(issue_id: int, body: IssuePatch, db: Session = Depends(get_db)) -> dict:
    issue = db.get(m.ValidationIssue, issue_id)
    if not issue:
        raise HTTPException(404, "Issue not found")
    if body.status is not None:
        issue.status = body.status
    if body.assigned_to is not None:
        issue.assigned_to = body.assigned_to
    workflow.bump_last_updated(db)
    db.commit()
    return {"ok": True, "id": issue.id, "status": issue.status}


# ─────────────────────────── entity detail drawer (§9.7) ───────────────────────────
@router.get("/entities/{entity_id}")
def entity_detail(entity_id: int, db: Session = Depends(get_db)) -> dict:
    detail = dghr_views.build_entity_detail(db, entity_id)
    if detail is None:
        raise HTTPException(404, "Entity not found")
    return detail


# ─────────────────────────── workflow actions (§11) ───────────────────────────
class EntityIds(BaseModel):
    entity_ids: list[int] = []
    ready: bool = False


@router.post("/actions/remind")
def action_remind(body: EntityIds, db: Session = Depends(get_db)) -> dict:
    return cases_svc.remind(db, body.entity_ids)


@router.post("/actions/approve")
def action_approve(body: EntityIds, db: Session = Depends(get_db)) -> dict:
    return cases_svc.approve(db, entity_ids=body.entity_ids, ready=body.ready)


@router.post("/actions/bulk-review")
def action_bulk_review(body: EntityIds, db: Session = Depends(get_db)) -> dict:
    return cases_svc.bulk_review(db, body.entity_ids)


class ReturnBody(BaseModel):
    entity_id: int
    package_key: str = "current_workforce"
    reason: str = "Returned for correction."


@router.post("/actions/return")
def action_return(body: ReturnBody, db: Session = Depends(get_db)) -> dict:
    c = cases_svc.return_submission(db, entity_id=body.entity_id, package_key=body.package_key, reason=body.reason)
    return {"ok": True, "ref": c.ref}

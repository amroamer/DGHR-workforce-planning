from __future__ import annotations

import re
from datetime import date as _date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db import get_db
from app.services import cases as cases_svc
from app.services import cycles, dghr_views, kpi, readiness, workflow
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
    completeness: str | None = None,
    sort: str = "default",
    direction: str = "asc",
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
) -> dict:
    return dghr_views.build_tracker(
        db, wave=wave, status=status, reviewer=reviewer, package=package, due=due,
        search=search, completeness=completeness, sort=sort, direction=direction, page=page, page_size=page_size,
    )


@router.get("/tracker/blocked-summary")
def tracker_blocked(db: Session = Depends(get_db)) -> dict:
    return dghr_views.tracker_blocked_summary(db)


@router.get("/tracker/followups")
def tracker_followups(db: Session = Depends(get_db)) -> dict:
    return dghr_views.tracker_followups(db)


@router.get("/tracker/export.csv", response_class=PlainTextResponse)
def tracker_export(
    wave: str | None = None,
    status: str | None = None,
    reviewer: str | None = None,
    package: str | None = None,
    due: str | None = None,
    search: str | None = None,
    completeness: str | None = None,
    sort: str = "default",
    direction: str = "asc",
    db: Session = Depends(get_db),
) -> PlainTextResponse:
    csv = dghr_views.tracker_csv(
        db, wave=wave, status=status, reviewer=reviewer, package=package, due=due,
        search=search, completeness=completeness, sort=sort, direction=direction,
    )
    return PlainTextResponse(
        csv,
        headers={"Content-Disposition": "attachment; filename=dghr-tracker.csv"},
        media_type="text/csv",
    )


# ─────────────────────────── config (§9.2) ───────────────────────────
@router.get("/config")
def config(db: Session = Depends(get_db)) -> dict:
    return dghr_views.build_config(db)


def _slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")
    return s or "package"


def _set_section_types(db: Session, package_id: int, names: list[str]) -> None:
    """Replace a package's section-type applicability with the given names."""
    db.query(m.PackageSectionType).filter(m.PackageSectionType.package_id == package_id).delete()
    st_by_name = {s.name: s for s in db.query(m.SectionType).all()}
    for nm in names:
        st = st_by_name.get(nm)
        if st:
            db.add(m.PackageSectionType(package_id=package_id, section_type_id=st.id))


class PackagePatch(BaseModel):
    mandatory_enabled: bool | None = None
    name: str | None = None
    description: str | None = None
    total_fields: int | None = None
    mandatory_fields: int | None = None
    optional_fields: int | None = None
    evidence_required: str | None = None
    icon_key: str | None = None
    applicable: bool | None = None
    section_type_names: list[str] | None = None


@router.patch("/config/packages/{package_id}")
def patch_package(package_id: int, body: PackagePatch, db: Session = Depends(get_db)) -> dict:
    p = db.get(m.DataPackage, package_id)
    if not p:
        raise HTTPException(404, "Package not found")
    for attr in ("mandatory_enabled", "name", "description", "total_fields",
                 "mandatory_fields", "optional_fields", "evidence_required", "icon_key"):
        val = getattr(body, attr)
        if val is not None:
            setattr(p, attr, val)
    if body.section_type_names is not None:
        _set_section_types(db, package_id, body.section_type_names)
    if body.applicable is not None:
        # applicability is uniform across entities for a package
        db.query(m.EntityPackage).filter(m.EntityPackage.package_id == package_id).update(
            {m.EntityPackage.applicable: body.applicable}
        )
    workflow.add_audit(db, label=f"Package '{p.name}' configuration updated", actor_name="DGHR Admin")
    workflow.bump_last_updated(db)
    db.commit()
    return {"ok": True, "id": p.id, "mandatory_enabled": p.mandatory_enabled}


class PackageCreate(BaseModel):
    name: str
    description: str = ""
    total_fields: int = 0
    mandatory_fields: int = 0
    optional_fields: int = 0
    evidence_required: str = "optional"  # yes|optional
    icon_key: str = "file-text"
    applicable: bool = True
    section_type_names: list[str] = []


@router.post("/config/packages")
def create_package(body: PackageCreate, db: Session = Depends(get_db)) -> dict:
    cycle = cycles.current_cycle(db)
    if not cycle:
        raise HTTPException(400, "No collection cycle exists")
    base = _slugify(body.name)[:28]  # leave room for a "_NN" collision suffix within VARCHAR(32)
    existing = {p.key for p in db.query(m.DataPackage).all()}
    key, n = base, 2
    while key in existing:
        key, n = f"{base}_{n}", n + 1
    max_pos = db.query(func.max(m.DataPackage.position)).scalar() or 0
    p = m.DataPackage(
        cycle_id=cycle.id, position=max_pos + 1, key=key, name=body.name,
        description=body.description, total_fields=body.total_fields,
        mandatory_fields=body.mandatory_fields, optional_fields=body.optional_fields,
        mandatory_enabled=True, evidence_required=body.evidence_required,
        evidence_fields_label="", status="configured", icon_key=body.icon_key,
    )
    db.add(p)
    db.flush()
    if body.section_type_names:
        _set_section_types(db, p.id, body.section_type_names)
    # every entity gets a submission slot for the new package
    for e in db.query(m.Entity).all():
        db.add(m.EntityPackage(entity_id=e.id, package_id=p.id, applicable=body.applicable,
                               status="not_started", progress=0))
    workflow.add_audit(db, label=f"Data package '{p.name}' created", actor_name="DGHR Admin")
    workflow.bump_last_updated(db)
    db.commit()
    return {"ok": True, "id": p.id, "key": p.key}


@router.delete("/config/packages/{package_id}")
def delete_package(package_id: int, db: Session = Depends(get_db)) -> dict:
    p = db.get(m.DataPackage, package_id)
    if not p:
        raise HTTPException(404, "Package not found")
    name = p.name
    db.query(m.EntityPackage).filter(m.EntityPackage.package_id == package_id).delete()
    db.query(m.PackageFieldGroup).filter(m.PackageFieldGroup.package_id == package_id).delete()
    db.query(m.PackageSectionType).filter(m.PackageSectionType.package_id == package_id).delete()
    db.delete(p)
    workflow.add_audit(db, label=f"Data package '{name}' removed", actor_name="DGHR Admin")
    workflow.bump_last_updated(db)
    db.commit()
    return {"ok": True}


class FieldGroupBody(BaseModel):
    name: str
    field_count: int = 0


@router.post("/config/packages/{package_id}/field-groups")
def add_field_group(package_id: int, body: FieldGroupBody, db: Session = Depends(get_db)) -> dict:
    p = db.get(m.DataPackage, package_id)
    if not p:
        raise HTTPException(404, "Package not found")
    g = m.PackageFieldGroup(package_id=package_id, name=body.name, field_count=body.field_count)
    db.add(g)
    # keep the package field counts in step with its groups
    p.total_fields = (p.total_fields or 0) + body.field_count
    p.optional_fields = (p.optional_fields or 0) + body.field_count
    workflow.bump_last_updated(db)
    db.commit()
    return {"ok": True, "id": g.id}


@router.delete("/config/field-groups/{group_id}")
def delete_field_group(group_id: int, db: Session = Depends(get_db)) -> dict:
    g = db.get(m.PackageFieldGroup, group_id)
    if not g:
        raise HTTPException(404, "Field group not found")
    p = db.get(m.DataPackage, g.package_id)
    if p:
        p.total_fields = max(0, (p.total_fields or 0) - g.field_count)
        p.optional_fields = max(0, (p.optional_fields or 0) - g.field_count)
    db.delete(g)
    workflow.bump_last_updated(db)
    db.commit()
    return {"ok": True}


class CyclePatch(BaseModel):
    name: str | None = None
    starts_on: str | None = None
    ends_on: str | None = None
    deadline: str | None = None
    auto_close: bool | None = None
    late_policy: str | None = None
    reviewer_rule: str | None = None
    reminders_label: str | None = None
    approval_workflow_label: str | None = None


@router.patch("/config/cycle/{cycle_id}")
def patch_cycle(cycle_id: int, body: CyclePatch, db: Session = Depends(get_db)) -> dict:
    c = db.get(m.CollectionCycle, cycle_id)
    if not c:
        raise HTTPException(404, "Cycle not found")
    if body.name is not None:
        c.name = body.name
    for field in ("starts_on", "ends_on", "deadline"):
        val = getattr(body, field)
        if val:  # truthy guard: skip empty strings (cleared date fields) so we don't 500 on fromisoformat("")
            setattr(c, field, _date.fromisoformat(val))
    for field in ("late_policy", "reviewer_rule", "reminders_label", "approval_workflow_label"):
        val = getattr(body, field)
        if val is not None:
            setattr(c, field, val)
    if body.auto_close is not None:
        c.auto_close = body.auto_close
    workflow.add_audit(db, label="Collection cycle configuration updated", actor_name="DGHR Admin")
    workflow.bump_last_updated(db)
    db.commit()
    return {"ok": True, "id": c.id}


@router.post("/config/publish")
def publish_config(db: Session = Depends(get_db)) -> dict:
    cycle = cycles.current_cycle(db)
    already = bool(cycle and cycle.status == cycles.OPEN)
    if cycle and not already:
        cycle.status = cycles.OPEN
        if cycle.opened_at is None:
            cycle.opened_at, cycle.opened_by = datetime.utcnow(), "DGHR Admin"
    if already:
        # Idempotent (CFG-12 / G-07): re-publishing does not spam a second announcement.
        db.commit()
        return {"ok": True, "message": "Request package is already published.", "republished": True}
    workflow.notify(db, audience="entity", kind="announcement",
                    title="DGHR Announcement",
                    body="Workforce Planning 2025 request package has been published. Please review your required submissions.")
    workflow.add_audit(db, label="Request package published to all entities", actor_name="DGHR Admin")
    workflow.bump_last_updated(db)
    db.commit()
    return {"ok": True, "message": "Request package published to all entities."}


# ─────────────────────────── entity onboarding (§9 roadmap) ───────────────────────────
class EntityCreate(BaseModel):
    name: str
    code: str
    wave: str = "W1"
    reviewer_id: int | None = None
    due_date: str | None = None


@router.post("/entities")
def create_entity(body: EntityCreate, db: Session = Depends(get_db)) -> dict:
    code = body.code.strip().upper()
    if db.query(m.Entity).filter(m.Entity.code == code).first():
        raise HTTPException(409, f"Entity code '{code}' already exists")
    due = _date.fromisoformat(body.due_date) if body.due_date else None
    e = m.Entity(name=body.name, code=code, wave=body.wave, reviewer_id=body.reviewer_id,
                 due_date=due, status="not_started", overdue=False, completeness=0,
                 forecasting_ready=False)
    db.add(e)
    db.flush()
    # mirror the applicable set used for existing entities (uniform per package)
    applicable_ids = {
        r.package_id
        for r in db.query(m.EntityPackage).filter(m.EntityPackage.applicable.is_(True)).all()
    }
    for p in db.query(m.DataPackage).all():
        applicable = (p.id in applicable_ids) if applicable_ids else True
        db.add(m.EntityPackage(entity_id=e.id, package_id=p.id, applicable=applicable,
                               status="not_started", progress=0))
    workflow.add_audit(db, label=f"Entity '{e.name}' onboarded", actor_name="DGHR Admin", entity_id=e.id)
    workflow.notify(db, audience="entity", kind="announcement", entity_id=e.id,
                    title="Welcome to Workforce Planning",
                    body="Your entity has been added to the current collection cycle.")
    workflow.bump_last_updated(db)
    db.commit()
    return {"ok": True, "id": e.id, "code": e.code}


class EntityPatch(BaseModel):
    name: str | None = None
    wave: str | None = None
    reviewer_id: int | None = None
    due_date: str | None = None


@router.patch("/entities/{entity_id}")
def patch_entity(entity_id: int, body: EntityPatch, db: Session = Depends(get_db)) -> dict:
    e = db.get(m.Entity, entity_id)
    if not e:
        raise HTTPException(404, "Entity not found")
    if body.name is not None:
        e.name = body.name
    if body.wave is not None:
        e.wave = body.wave
    if body.reviewer_id is not None:
        e.reviewer_id = body.reviewer_id
    if body.due_date:  # truthy guard: an empty string means "leave unchanged", not a crash
        e.due_date = _date.fromisoformat(body.due_date)
    workflow.add_audit(db, label=f"Entity '{e.name}' updated", actor_name="DGHR Admin", entity_id=e.id)
    workflow.bump_last_updated(db)
    db.commit()
    return {"ok": True, "id": e.id}


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
    return {"ok": True, "id": issue.id, "status": issue.status, "assigned_to": issue.assigned_to}


@router.get("/issues/{issue_id}")
def issue_detail(issue_id: int, db: Session = Depends(get_db)) -> dict:
    d = dghr_views.build_issue_detail(db, issue_id)
    if d is None:
        raise HTTPException(404, "Issue not found")
    return d


@router.get("/reviewers")
def reviewers(db: Session = Depends(get_db)) -> list[dict]:
    return dghr_views.dghr_reviewers(db)


@router.post("/issues/{issue_id}/send-back")
def issue_send_back(issue_id: int, db: Session = Depends(get_db)) -> dict:
    """DQ-05: raise a clarification from an issue and mark it in-progress."""
    issue = db.get(m.ValidationIssue, issue_id)
    if not issue:
        raise HTTPException(404, "Issue not found")
    label = {"org_structure": "Organization Data", "current_workforce": "Workforce Data",
             "workload_service": "Workload Data", "future_drivers": "Future Drivers",
             "evidence_documents": "Evidence Data"}.get(issue.package_key, issue.package_key)
    c = cases_svc.open_clarification(
        db, entity_id=issue.entity_id, package_label=label,
        issue_summary=f"Validation issue, {issue.issue_type}: please review and correct the flagged {label} records.",
        priority=issue.severity, category="Data Quality")
    issue2 = db.get(m.ValidationIssue, issue_id)
    issue2.status = "in_progress"
    workflow.bump_last_updated(db)
    db.commit()
    return {"ok": True, "ref": c.ref, "issue_status": "in_progress"}


# ─────────────────────────── entity detail drawer (§9.7) ───────────────────────────
@router.get("/forecasting-readiness")
def forecasting_readiness(
    filter_state: str = "all",
    page: int = Query(1, ge=1),
    page_size: int = Query(8, ge=1, le=50),
    db: Session = Depends(get_db),
) -> dict:
    """SPEC §9.5 — Zone 1 real readiness + Zone 2 Illustrative Layer-B preview."""
    return readiness.build_readiness(db, filter_state=filter_state, page=page, page_size=page_size)


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
    status: str | None = None  # when set, target ALL entities currently in this status


def _resolve_ids(db: Session, body: "EntityIds") -> list[int]:
    if body.status:
        return [e.id for e in db.query(m.Entity).filter(m.Entity.status == body.status).all()]
    return body.entity_ids


@router.post("/actions/remind")
def action_remind(body: EntityIds, db: Session = Depends(get_db)) -> dict:
    return cases_svc.remind(db, _resolve_ids(db, body))


@router.post("/actions/escalate")
def action_escalate(body: EntityIds, db: Session = Depends(get_db)) -> dict:
    ids = _resolve_ids(db, body)
    if not ids:  # default: escalate all overdue entities
        ids = [e.id for e in db.query(m.Entity).filter(m.Entity.overdue.is_(True)).all()]
    return cases_svc.escalate(db, ids)


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

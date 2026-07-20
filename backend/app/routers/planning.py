"""Planning department + sizing API — entity submission flow and DGHR review/clarification."""
from __future__ import annotations

import csv
import io
import os
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app import models as m
from app.services import (ai_service, analytics, calc_config, cycles, entity_comparison, formula,
                          human_capital, review, revisions, sizing, supply, trace, versioning, workflow)

router = APIRouter(prefix="/api/planning", tags=["planning"])

UPLOAD_DIR = "/app/uploads"
DOC_KIND = "document"

# One definition, on the model. These used to be re-declared here AND in services/sizing.py, and
# EDITABLE used to include "approved" — which is how an approved record became rewritable.
RECEIVED = m.RECEIVED_STATUSES
EDITABLE = m.EDITABLE_STATUSES


# ═══════════════════════ helpers ═══════════════════════
def _require(obj, name: str):
    if obj is None:
        raise HTTPException(404, f"{name} not found")
    return obj


def _base_year(db: Session) -> int:
    return cycles.base_year(db)


def _require_open_window(db: Session, entity_id: int) -> None:
    """Guard every entity write behind the collection window: there must be an OPEN cycle that
    includes this entity. Closing a cycle (or leaving an entity out of scope) makes its side
    read-only — the same rule the UI shows, enforced where it actually matters."""
    ok, reason = cycles.can_submit(db, entity_id)
    if not ok:
        raise HTTPException(409, reason)


def _typeset_dict(t: m.Typeset) -> dict:
    return {"id": t.id, "key": t.key, "name": t.name, "primary_family": t.primary_family,
            "default_drivers": t.default_drivers or []}


def _bands_payload(db: Session, submission_id: int) -> list[dict]:
    """This submission's demographic bands, grouped by dimension in canonical order — the reload
    source for the stepper's 'Workforce demographics' capture. Missing dimensions come back with
    their buckets zeroed so the stepper always renders a complete, editable grid."""
    rows = (db.query(m.SubmissionWorkforceBand)
            .filter(m.SubmissionWorkforceBand.submission_id == submission_id).all())
    have = {(r.dimension, r.bucket): int(r.headcount or 0) for r in rows}
    out = []
    for dim in human_capital.BAND_DIMENSIONS:
        spec = human_capital.WORKFORCE_BANDS[dim]
        out.append({
            "dimension": dim, "label": spec["label"],
            "buckets": [{"bucket": k, "label": lbl, "headcount": have.get((dim, k), 0)}
                        for k, lbl in spec["buckets"]],
        })
    return out


def _submission_payload(db: Session, sub: m.DepartmentSubmission) -> dict:
    dept = db.get(m.Department, sub.department_id)
    ent = db.get(m.Entity, dept.entity_id) if dept else None
    ts = db.get(m.Typeset, dept.typeset_id) if dept and dept.typeset_id else None
    sz = sizing.submission_sizing(db, sub)
    workforce = human_capital.submission_human_capital(db, sub)
    workforce["rows"] = [{
        "id": r.id, "job_level": r.job_level, "label": human_capital.LEVEL_LABEL.get(r.job_level, r.job_level),
        "headcount": int(r.headcount or 0), "fte": float(r.fte or 0),
        "emirati_count": int(r.emirati_count or 0),
        "annual_cost_aed": float(r.annual_cost_aed or 0),
    } for r in human_capital._rows_for_submission(db, sub.id)]
    # Demographic distributions (gender/age/grade/region/nationality) behind the HC Overview donuts,
    # grouped by dimension so the stepper can reload and re-edit them. See services/analytics.py.
    workforce["bands"] = _bands_payload(db, sub.id)
    # S3: the scrollable per-position breakdown (role, grade band, headcount) under the total FTE.
    workforce["positions"] = human_capital.positions_detail(db, sub.id)
    projection = sizing.submission_projection(db, sub, base_year=_base_year(db))
    # Sibling departments, so a secondment can name the other end of the move.
    siblings = [{"id": d.id, "name": d.name} for d in db.query(m.Department)
                .filter(m.Department.entity_id == dept.entity_id, m.Department.id != dept.id)
                .order_by(m.Department.name).all()] if dept else []
    all_versions = versioning.versions(db, sub.department_id)
    later = versioning.superseded_by(db, sub)
    return {
        "id": sub.id, "status": sub.status, "notes": sub.notes,
        # ── the version chain ──
        "version": sub.version,
        "supersedes_id": sub.supersedes_id,
        "superseded_by_id": later.id if later else None,
        "is_latest": later is None,
        "editable": versioning.is_editable(db, sub),
        "frozen_reason": "" if versioning.is_editable(db, sub) else versioning.why_frozen(db, sub),
        "versions": [{"id": v.id, "version": v.version, "status": v.status,
                      "submitted_at": v.submitted_at.isoformat() if v.submitted_at else None,
                      "decided_at": v.decided_at.isoformat() if v.decided_at else None}
                     for v in all_versions],
        # ── who said what ──
        "submitted_at": sub.submitted_at.isoformat() if sub.submitted_at else None,
        "submitted_by": sub.submitted_by_name or "",
        "attested": bool(sub.attested),
        "attested_by": sub.attested_by or "",
        "attested_at": sub.attested_at.isoformat() if sub.attested_at else None,
        # S10-14/S18: the entity's HR champion verified the consolidated report before it was sent.
        "champion_verified_at": sub.champion_verified_at.isoformat() if sub.champion_verified_at else None,
        "champion_verified_by": sub.champion_verified_by or "",
        "attestation_text": ATTESTATION_TEXT,
        "recommendation": sub.recommendation or "",
        "recommendation_note": sub.recommendation_note or "",
        "recommended_at": sub.recommended_at.isoformat() if sub.recommended_at else None,
        "recommended_by": sub.recommended_by_name or "",
        "recommended_by_id": sub.recommended_by_id,
        "decided_at": sub.decided_at.isoformat() if sub.decided_at else None,
        "decided_by": sub.decided_by_name or "",
        "decided_by_id": sub.decided_by_id,
        "conditions": list(sub.conditions or []),
        "decision_note": sub.decision_note,
        # ── element-by-element review state ──
        "review": review.review_state(db, sub),
        # ── what changed since the version this one revised ──
        "diff": revisions.diff_with_previous(db, sub),
        # current_fte is the establishment FTE and is FRACTIONAL — rounding it here would re-merge it
        # with headcount, which is the exact confusion this split exists to end.
        "department": {"id": dept.id, "name": dept.name, "current_fte": float(dept.current_fte or 0),
                       "approved_positions": int(dept.approved_positions or 0),
                       "typeset_id": dept.typeset_id, "typeset": ts.name if ts else None} if dept else None,
        "entity": {"id": ent.id, "name": ent.name, "code": ent.code, "champion_name": ent.champion_name} if ent else None,
        # The collection window for this submission's entity — the stepper reads it to go read-only
        # (and say why) exactly when the server would refuse a save/submit.
        "window": cycles.submission_window(db, ent.id) if ent else None,
        "sizing": sz,
        "workforce": workforce,
        "supply": supply.submission_supply(db, sub),
        "sibling_departments": siblings,
        "adjustment_kinds": [{"key": k, "label": m.ADJUSTMENT_LABEL[k],
                              "sign": m.ADJUSTMENT_SIGN[k]} for k in m.ADJUSTMENT_KINDS],
        # Supporting documents for THIS department's submission (plus entity-wide ones).
        "documents": _department_documents(db, dept.id) if dept else [],
        "projection": projection,
        # Each thread carries its own age and escalation level — derived, never stored, because a
        # stored "overdue" is only true until the clock moves.
        "clarifications": review.clarification_rows(db, sub),
    }


def _get_or_create_submission(db: Session, department_id: int) -> m.DepartmentSubmission:
    """The version the entity is looking at — the NEWEST one, draft or not.

    Deliberately not active_submission(): that answers "what does the government position count",
    which prefers a received version over a newer draft. An entity revising v2 must see v2, not the
    v1 it just superseded.
    """
    sub = versioning.current_version(db, department_id)
    if sub:
        return sub
    dept = _require(db.get(m.Department, department_id), "Department")
    cycle = cycles.current_cycle(db)
    sub = m.DepartmentSubmission(department_id=department_id,
                                 cycle_id=cycle.id if cycle else None, status="draft", version=1)
    db.add(sub)
    db.flush()
    # prefill drivers from the typeset template
    ts = db.get(m.Typeset, dept.typeset_id) if dept.typeset_id else None
    for pos, d in enumerate(ts.default_drivers if ts and ts.default_drivers else []):
        name = d.get("name", "")
        db.add(m.SubmissionDriver(submission_id=sub.id, element_key=m.element_key(name), name=name,
                                  unit=d.get("unit", ""), family=d.get("family", "demand"),
                                  volume=0, forecast=0, params=d.get("params", {}), position=pos))
    db.commit()
    return sub


# ═══════════════════════ typesets ═══════════════════════
@router.get("/typesets")
def list_typesets(db: Session = Depends(get_db)) -> list[dict]:
    ts = db.query(m.Typeset).order_by(m.Typeset.position).all()
    return [_typeset_dict(t) for t in ts]


# ═══════════════════════ Smart Assist (AI extraction) ═══════════════════════
class SmartAssistBody(BaseModel):
    text: str


@router.post("/smart-assist")
def smart_assist(body: SmartAssistBody) -> dict:
    return ai_service.smart_assist(body.text)


# ═══════════════════════ cycle & admin (DGHR) ═══════════════════════
def _extension_rows(db: Session, cycle_id: int) -> list[dict]:
    ent = {e.id: e for e in db.query(m.Entity).all()}
    return [{"id": x.id, "entity_id": x.entity_id,
             "entity": ent[x.entity_id].name if x.entity_id in ent else "—",
             "code": ent[x.entity_id].code if x.entity_id in ent else "",
             "extended_deadline": x.extended_deadline.isoformat() if x.extended_deadline else None,
             "reason": x.reason, "granted_by": x.granted_by}
            for x in db.query(m.CycleExtension).filter(m.CycleExtension.cycle_id == cycle_id)
            .order_by(m.CycleExtension.extended_deadline.desc()).all()]


def _cycle_detail(db: Session, c: m.CollectionCycle) -> dict:
    # resolved_outcome reads the frozen snapshot for a closed cycle (its own outcome) and computes
    # live for the open one — so a historical cycle in the selector shows what actually happened.
    o = cycles.resolved_outcome(db, c)
    return {**cycles.cycle_dict(db, c),
            "departments_total": o["departments_total"], "received": o["received"], "approved": o["approved"],
            "extensions": _extension_rows(db, c.id)}


@router.get("/cycle")
def cycle_info(cycle_id: int | None = None, db: Session = Depends(get_db)) -> dict:
    # Lazily run the deadline jobs — they can only fire when something looks at the clock, and this
    # screen is a natural place: shut an overdue window, and send any due 7/3/1-day reminders.
    cycles.sweep_auto_close(db)
    cycles.sweep_reminders(db)
    c = db.get(m.CollectionCycle, cycle_id) if cycle_id else cycles.current_cycle(db)
    # `received` and `approved` MUST be counted on the same basis — one active submission per
    # department. Counting approved off raw DepartmentSubmission rows let it exceed received when a
    # department had more than one approved row, which is visible the moment both sit in one sentence.
    total = received = approved = 0
    for d in db.query(m.Department).all():
        total += 1
        s = sizing.active_submission(db, d.id)
        if not s:
            continue
        if s.status in RECEIVED:
            received += 1
        if s.status == "approved":
            approved += 1
    return {
        "cycle": cycles.cycle_dict(db, c),
        "departments_total": total, "departments_received": received, "approved": approved,
        "departments_outstanding": total - received,
        "entities": db.query(m.Entity).count(),
    }


@router.get("/cycles")
def list_cycles(db: Session = Depends(get_db)) -> dict:
    """Every cycle, newest first — the history the selector reads. `current_id` is the one the app
    defaults to (the open cycle, else the most recent)."""
    cycles.sweep_auto_close(db)
    rows = db.query(m.CollectionCycle).order_by(m.CollectionCycle.id.desc()).all()
    cur = cycles.current_cycle(db)
    return {"cycles": [_cycle_detail(db, c) for c in rows], "current_id": cur.id if cur else None}


@router.get("/cycles/history")
def cycles_history(db: Session = Depends(get_db)) -> dict:
    """Every cycle, chronological, with its outcome — plus the entities that finished late in more
    than one cycle. Closed cycles read their frozen snapshot; the open cycle computes live. This is
    what makes 'track all cycles' an analytics surface rather than just a list.

    Declared before /cycles/{cycle_id} so 'history' isn't parsed as a cycle id."""
    cycles.sweep_auto_close(db)
    ent_names = {e.code: e.name for e in db.query(m.Entity).all()}
    out, late_counter = [], {}
    for c in db.query(m.CollectionCycle).order_by(
            m.CollectionCycle.starts_on.asc(), m.CollectionCycle.id.asc()).all():
        o = cycles.resolved_outcome(db, c)
        total = o["departments_total"] or 0
        ran = c.status in (cycles.OPEN, cycles.CLOSED, cycles.ARCHIVED)
        if ran:
            for code in o["late_entity_codes"]:
                late_counter[code] = late_counter.get(code, 0) + 1
        out.append({
            **cycles.cycle_dict(db, c),
            "departments_total": total, "received": o["received"], "approved": o["approved"],
            "received_pct": round(o["received"] / total * 100) if total else 0,
            "approved_pct": round(o["approved"] / total * 100) if total else 0,
            "avg_turnaround_days": o["avg_turnaround_days"],
            "late_entity_codes": o["late_entity_codes"], "ran": ran,
        })
    chronically_late = sorted(
        ({"code": k, "name": ent_names.get(k, k), "cycles_late": v}
         for k, v in late_counter.items() if v >= 2),
        key=lambda x: (-x["cycles_late"], x["code"]))
    return {"cycles": out, "chronically_late": chronically_late,
            "cycles_run": sum(1 for r in out if r["ran"])}


@router.get("/cycles/{cycle_id}")
def get_cycle(cycle_id: int, db: Session = Depends(get_db)) -> dict:
    return _cycle_detail(db, _require(db.get(m.CollectionCycle, cycle_id), "Cycle"))


class CycleCreate(BaseModel):
    name: str
    starts_on: str
    ends_on: str
    deadline: str
    auto_close: bool = True
    scope_mode: str = "all"            # all | selected
    scope_entity_ids: list[int] = []
    actor_name: str = "DGHR Admin"


@router.post("/cycles")
def create_cycle(body: CycleCreate, db: Session = Depends(get_db)) -> dict:
    """Create the next cycle as a DRAFT — configured but invisible to entities until it is opened."""
    if not body.name.strip():
        raise HTTPException(422, "A cycle needs a name.")
    try:
        starts, ends, dl = (date.fromisoformat(body.starts_on), date.fromisoformat(body.ends_on),
                            date.fromisoformat(body.deadline))
    except ValueError:
        raise HTTPException(422, "Dates must be ISO (YYYY-MM-DD).")
    if ends < starts:
        raise HTTPException(422, "The close date cannot fall before the open date.")
    c = m.CollectionCycle(name=body.name.strip(), starts_on=starts, ends_on=ends, deadline=dl,
                          status=cycles.DRAFT, auto_close=body.auto_close)
    db.add(c)
    db.flush()
    cycles.set_scope(db, c, body.scope_mode, body.scope_entity_ids)
    workflow.add_audit(db, label=f"Cycle '{c.name}' created (draft)", actor_name=body.actor_name)
    workflow.bump_last_updated(db)
    db.commit()
    return _cycle_detail(db, c)


class CycleAction(BaseModel):
    actor_name: str = "DGHR Admin"


@router.post("/cycles/{cycle_id}/open")
def open_cycle_endpoint(cycle_id: int, body: CycleAction | None = None,
                        db: Session = Depends(get_db)) -> dict:
    """Make a cycle live. Enforces the one-open invariant, stamps who/when, and announces it to the
    entities in scope."""
    body = body or CycleAction()
    c = _require(db.get(m.CollectionCycle, cycle_id), "Cycle")
    if c.status == cycles.OPEN:
        return _cycle_detail(db, c)   # idempotent
    if c.status == cycles.ARCHIVED:
        raise HTTPException(409, "An archived cycle can't be reopened.")
    other = cycles.open_cycle(db)
    if other and other.id != c.id:
        raise HTTPException(409, f"'{other.name}' is already open. Close it before opening another — "
                                 "only one cycle can be open at a time.")
    c.status = cycles.OPEN
    c.opened_at = datetime.utcnow()
    c.opened_by = body.actor_name
    c.closed_at, c.closed_by = None, ""   # reopening a closed cycle clears its prior close
    cycles.clear_snapshot(db, c)          # ...and its frozen outcome — it's live again
    scope_ids = cycles.entities_in_scope(db, c)
    if scope_ids is None:
        workflow.notify(db, audience="entity", kind="announcement", title="Collection cycle open",
                        body=f"The {c.name} submission window is open — please submit your departments.")
    else:
        for eid in scope_ids:
            workflow.notify(db, audience="entity", kind="announcement", entity_id=eid,
                            title="Collection cycle open",
                            body=f"The {c.name} submission window is open — please submit your departments.")
    workflow.add_audit(db, label=f"Cycle '{c.name}' opened by {body.actor_name}", actor_name=body.actor_name)
    workflow.bump_last_updated(db)
    db.commit()
    return _cycle_detail(db, c)


@router.post("/cycles/{cycle_id}/close")
def close_cycle_endpoint(cycle_id: int, body: CycleAction | None = None,
                         db: Session = Depends(get_db)) -> dict:
    """Close a live cycle by hand (the manual half of manual-and-automatic closing)."""
    body = body or CycleAction()
    c = _require(db.get(m.CollectionCycle, cycle_id), "Cycle")
    if c.status == cycles.CLOSED:
        return _cycle_detail(db, c)   # idempotent
    if c.status != cycles.OPEN:
        raise HTTPException(409, f"Only an open cycle can be closed (this one is '{c.status}').")
    cycles._do_close(db, c, by=body.actor_name)
    workflow.bump_last_updated(db)
    db.commit()
    return _cycle_detail(db, c)


class CycleScope(BaseModel):
    scope_mode: str                    # all | selected
    scope_entity_ids: list[int] = []
    actor_name: str = "DGHR Admin"


@router.put("/cycles/{cycle_id}/scope")
def set_cycle_scope(cycle_id: int, body: CycleScope, db: Session = Depends(get_db)) -> dict:
    """Set which entities a cycle targets — every entity ('all') or a chosen subset ('selected').
    Editable on a draft or an open cycle, so a targeted re-collection can be narrowed or widened."""
    c = _require(db.get(m.CollectionCycle, cycle_id), "Cycle")
    if c.status == cycles.ARCHIVED:
        raise HTTPException(409, "An archived cycle's scope can't be changed.")
    if body.scope_mode not in ("all", "selected"):
        raise HTTPException(422, "scope_mode must be 'all' or 'selected'.")
    if body.scope_mode == "selected":
        valid = {e.id for e in db.query(m.Entity).all()}
        chosen = [eid for eid in body.scope_entity_ids if eid in valid]
        if not chosen:
            raise HTTPException(422, "Select at least one entity, or choose 'all'.")
        cycles.set_scope(db, c, "selected", chosen)
    else:
        cycles.set_scope(db, c, "all", None)
    workflow.add_audit(db, label=f"Cycle '{c.name}' scope set to "
                                 f"{'all entities' if c.scope_mode == 'all' else f'{len(body.scope_entity_ids)} selected'}",
                       actor_name=body.actor_name)
    workflow.bump_last_updated(db)
    db.commit()
    return _cycle_detail(db, c)


@router.post("/cycles/{cycle_id}/clone")
def clone_cycle_endpoint(cycle_id: int, body: CycleAction | None = None,
                         db: Session = Depends(get_db)) -> dict:
    """Duplicate a cycle as a fresh DRAFT — window shifted a year on, scope + policies copied."""
    body = body or CycleAction()
    src = _require(db.get(m.CollectionCycle, cycle_id), "Cycle")
    c = cycles.clone_cycle(db, src, body.actor_name)
    workflow.bump_last_updated(db)
    db.commit()
    return _cycle_detail(db, c)


class ExtensionIn(BaseModel):
    entity_id: int
    extended_deadline: str
    reason: str = ""
    granted_by: str = "DGHR Admin"


@router.get("/cycles/{cycle_id}/extensions")
def list_extensions(cycle_id: int, db: Session = Depends(get_db)) -> dict:
    _require(db.get(m.CollectionCycle, cycle_id), "Cycle")
    return {"extensions": _extension_rows(db, cycle_id)}


@router.post("/cycles/{cycle_id}/extensions")
def grant_extension(cycle_id: int, body: ExtensionIn, db: Session = Depends(get_db)) -> dict:
    """Give one entity a later deadline within this cycle (and defer auto-close until it expires)."""
    c = _require(db.get(m.CollectionCycle, cycle_id), "Cycle")
    ent = _require(db.get(m.Entity, body.entity_id), "Entity")
    try:
        dl = date.fromisoformat(body.extended_deadline)
    except ValueError:
        raise HTTPException(422, "extended_deadline must be ISO (YYYY-MM-DD).")
    if c.deadline and dl <= c.deadline:
        raise HTTPException(422, "An extension must be later than the cycle deadline.")
    ext = db.query(m.CycleExtension).filter(
        m.CycleExtension.cycle_id == cycle_id, m.CycleExtension.entity_id == body.entity_id).first()
    if ext is None:
        ext = m.CycleExtension(cycle_id=cycle_id, entity_id=body.entity_id)
        db.add(ext)
    ext.extended_deadline = dl
    ext.reason = body.reason.strip()
    ext.granted_by = body.granted_by
    workflow.add_audit(db, actor_name=body.granted_by, entity_id=ent.id,
                       label=f"{ent.name} granted a deadline extension to {dl.isoformat()} for '{c.name}'")
    workflow.notify(db, audience="entity", kind="announcement", entity_id=ent.id,
                    title="Deadline extended",
                    body=f"Your deadline for {c.name} has been extended to {dl.isoformat()}.")
    workflow.bump_last_updated(db)
    db.commit()
    return _cycle_detail(db, c)


@router.delete("/cycles/{cycle_id}/extensions/{ext_id}")
def revoke_extension(cycle_id: int, ext_id: int, db: Session = Depends(get_db)) -> dict:
    ext = _require(db.get(m.CycleExtension, ext_id), "Extension")
    if ext.cycle_id != cycle_id:
        raise HTTPException(422, "That extension belongs to a different cycle.")
    c = db.get(m.CollectionCycle, cycle_id)
    ent = db.get(m.Entity, ext.entity_id)
    db.delete(ext)
    workflow.add_audit(db, actor_name="DGHR Admin", entity_id=ext.entity_id,
                       label=f"Deadline extension revoked for {ent.name if ent else 'entity'}"
                             f"{f' — {c.name}' if c else ''}")
    workflow.bump_last_updated(db)
    db.commit()
    return _cycle_detail(db, c)


@router.post("/dghr/remind")
def remind(db: Session = Depends(get_db)) -> dict:
    """Notify every entity that still has departments not yet submitted."""
    reminded = 0
    for e in db.query(m.Entity).all():
        pending = [d for d in db.query(m.Department).filter(m.Department.entity_id == e.id).all()
                   if not (s := sizing.active_submission(db, d.id)) or s.status not in RECEIVED]
        if pending:
            workflow.notify(db, audience="entity", kind="reminder", entity_id=e.id,
                            title="Reminder — submissions due",
                            body=f"{len(pending)} department(s) still to submit for the {'; '.join([p.name for p in pending[:3]])}{'…' if len(pending) > 3 else ''}.")
            reminded += 1
    workflow.bump_last_updated(db)
    db.commit()
    return {"ok": True, "reminded": reminded}


# ═══════════════════════ entity: departments ═══════════════════════
@router.get("/entities/{entity_id}/departments")
def list_departments(entity_id: int, db: Session = Depends(get_db)) -> dict:
    ent = _require(db.get(m.Entity, entity_id), "Entity")
    es = sizing.entity_sizing(db, entity_id, received_only=False)
    ts_names = {t.id: t.name for t in db.query(m.Typeset).all()}
    for row in es["departments"]:
        row["typeset"] = ts_names.get(row["typeset_id"])
    # The collection window travels with the entity's own department list so its UI can lock itself
    # (and say why) in lockstep with the server. The DGHR entity-detail view deliberately omits it.
    return {"entity": {"id": ent.id, "name": ent.name, "code": ent.code},
            "window": cycles.submission_window(db, entity_id), **es}


class DeptCreate(BaseModel):
    name: str
    typeset_id: int | None = None
    current_fte: float = 0
    head_name: str = ""


@router.post("/entities/{entity_id}/departments")
def create_department(entity_id: int, body: DeptCreate, db: Session = Depends(get_db)) -> dict:
    _require(db.get(m.Entity, entity_id), "Entity")
    _require_open_window(db, entity_id)
    d = m.Department(entity_id=entity_id, name=body.name, typeset_id=body.typeset_id,
                     current_fte=body.current_fte, head_name=body.head_name)
    db.add(d)
    workflow.bump_last_updated(db)
    db.commit()
    return {"ok": True, "id": d.id}


class DeptPatch(BaseModel):
    name: str | None = None
    typeset_id: int | None = None
    current_fte: float | None = None
    head_name: str | None = None


@router.patch("/departments/{dept_id}")
def patch_department(dept_id: int, body: DeptPatch, db: Session = Depends(get_db)) -> dict:
    d = _require(db.get(m.Department, dept_id), "Department")
    for f in ("name", "typeset_id", "current_fte", "head_name"):
        v = getattr(body, f)
        if v is not None:
            setattr(d, f, v)
    workflow.bump_last_updated(db)
    db.commit()
    return {"ok": True}


@router.delete("/departments/{dept_id}")
def delete_department(dept_id: int, db: Session = Depends(get_db)) -> dict:
    d = _require(db.get(m.Department, dept_id), "Department")
    subs = db.query(m.DepartmentSubmission).filter(m.DepartmentSubmission.department_id == dept_id).all()
    for s in subs:
        db.query(m.SubmissionDriver).filter(m.SubmissionDriver.submission_id == s.id).delete()
        db.query(m.MandateFloor).filter(m.MandateFloor.submission_id == s.id).delete()
        db.query(m.SubmissionClarification).filter(m.SubmissionClarification.submission_id == s.id).delete()
        db.delete(s)
    db.delete(d)
    workflow.bump_last_updated(db)
    db.commit()
    return {"ok": True}


# ═══════════════════════ entity: submission stepper ═══════════════════════
@router.get("/departments/{dept_id}/submission")
def get_submission(dept_id: int, db: Session = Depends(get_db)) -> dict:
    sub = _get_or_create_submission(db, dept_id)
    return _submission_payload(db, sub)


class DriverIn(BaseModel):
    name: str
    unit: str = ""
    family: str = "demand"
    volume: float = 0
    forecast: float = 0
    params: dict = {}
    # Where the number came from — "FY2026 case-system extract", "HR establishment register". A
    # figure whose provenance is stated is one a reviewer can challenge; a bare number is not.
    source: str = ""


class MandateIn(BaseModel):
    role: str
    legal_basis: str = ""
    positions: int = 0


class WorkforceRowIn(BaseModel):
    job_level: str                       # managers|professionals|associate_professionals|clerical_support
    headcount: int = 0
    fte: float | None = None              # time; defaults to headcount (everyone full-time) if omitted
    emirati_count: int = 0
    annual_cost_aed: float | None = None  # imputed from a standard cost/level when omitted


class BandBucketIn(BaseModel):
    bucket: str
    headcount: int = 0


class BandIn(BaseModel):
    dimension: str                        # see models.WORKFORCE_BAND_DIMENSIONS
    buckets: list[BandBucketIn] = []


class AdjustmentIn(BaseModel):
    kind: str                             # see models.ADJUSTMENT_KINDS
    label: str = ""
    fte: float = 0                        # always positive — the kind carries the sign
    headcount: int = 0
    starts_on: date | None = None
    ends_on: date | None = None
    source_department_id: int | None = None
    receiving_department_id: int | None = None
    counts_in_supply: bool = True
    note: str = ""


class SubmissionSave(BaseModel):
    # The department's establishment FTE. Derived from the workforce rows when they're supplied —
    # a department's FTE IS its people's time, so accepting them separately would let the two drift.
    current_fte: float | None = None
    approved_positions: int | None = None
    notes: str | None = None
    drivers: list[DriverIn] | None = None
    mandates: list[MandateIn] | None = None
    workforce: list[WorkforceRowIn] | None = None
    # Demographic distributions behind the HC Overview donuts — child of the submission, versioned
    # and reviewed exactly like the workforce rows.
    bands: list[BandIn] | None = None
    adjustments: list[AdjustmentIn] | None = None


@router.put("/submissions/{sub_id}")
def save_submission(sub_id: int, body: SubmissionSave, db: Session = Depends(get_db)) -> dict:
    sub = _require(db.get(m.DepartmentSubmission, sub_id), "Submission")
    _win_dept = db.get(m.Department, sub.department_id)
    if _win_dept:
        _require_open_window(db, _win_dept.entity_id)
    # A submitted record is a record. This guard used to block only status 'submitted', so an
    # APPROVED submission could be rewritten in place — staying approved, keeping its sign-off note,
    # and still feeding the Official government position with numbers nobody had approved.
    # Only a draft is editable now; anything else must be revised into a new version.
    if not versioning.is_editable(db, sub):
        raise HTTPException(409, versioning.why_frozen(db, sub))
    if body.notes is not None:
        sub.notes = body.notes
    dept = db.get(m.Department, sub.department_id)
    if body.current_fte is not None:
        dept.current_fte = body.current_fte
    if body.approved_positions is not None:
        dept.approved_positions = max(0, int(body.approved_positions))
    if body.drivers is not None:
        db.query(m.SubmissionDriver).filter(m.SubmissionDriver.submission_id == sub_id).delete()
        for pos, d in enumerate(body.drivers):
            # element_key, not the row id, is how a clarification or a review decision finds this
            # driver again — these rows are destroyed and rebuilt on every single save.
            db.add(m.SubmissionDriver(submission_id=sub_id, element_key=m.element_key(d.name),
                                      name=d.name, unit=d.unit,
                                      family=d.family, volume=d.volume, forecast=d.forecast,
                                      params=d.params, position=pos,
                                      source=(d.source or "").strip() or "Entity submission — planning stepper"))
    if body.mandates is not None:
        db.query(m.MandateFloor).filter(m.MandateFloor.submission_id == sub_id).delete()
        for md in body.mandates:
            db.add(m.MandateFloor(submission_id=sub_id, element_key=m.element_key(md.role),
                                  role=md.role,
                                  legal_basis=md.legal_basis, positions=md.positions))
    if body.workforce is not None:
        db.query(m.SubmissionWorkforceRow).filter(
            m.SubmissionWorkforceRow.submission_id == sub_id).delete()
        for pos, wr in enumerate(body.workforce):
            hc = max(0, int(wr.headcount or 0))
            # Time can never exceed the people supplying it: 3 people are at most 3.0 FTE. Omitted
            # means "everyone full-time", which is the only reading that adds no claim of its own.
            fte = hc if wr.fte is None else max(0.0, min(float(wr.fte), float(hc)))
            cost = wr.annual_cost_aed
            if cost is None or cost <= 0:
                cost = round(fte * human_capital.COST_PER_FTE.get(wr.job_level, 0), 2)
            db.add(m.SubmissionWorkforceRow(
                submission_id=sub_id, job_level=wr.job_level, headcount=hc, fte=fte,
                emirati_count=min(max(0, int(wr.emirati_count or 0)), hc),
                annual_cost_aed=cost, position=pos))
        # The department's establishment FTE IS the sum of its people's time. Deriving it here rather
        # than trusting a separately-typed box is what stops FTE and headcount drifting apart again.
        dept.current_fte = round(sum(
            (r.headcount if r.fte is None else max(0.0, min(float(r.fte), float(r.headcount))))
            for r in body.workforce), 2)

    if body.bands is not None:
        # Delete/recreate like the other submission children; only known dimensions/buckets are kept,
        # so a distribution can never reference an axis the model doesn't define.
        db.query(m.SubmissionWorkforceBand).filter(
            m.SubmissionWorkforceBand.submission_id == sub_id).delete()
        for b in body.bands:
            if b.dimension not in m.WORKFORCE_BAND_DIMENSIONS:
                continue
            valid = {k: lbl for k, lbl in human_capital.WORKFORCE_BANDS[b.dimension]["buckets"]}
            for pos, bk in enumerate(b.buckets):
                if bk.bucket not in valid:
                    continue
                db.add(m.SubmissionWorkforceBand(
                    submission_id=sub_id, dimension=b.dimension, bucket=bk.bucket,
                    label=valid[bk.bucket], headcount=max(0, int(bk.headcount or 0)), position=pos))

    if body.adjustments is not None:
        db.query(m.WorkforceAdjustment).filter(
            m.WorkforceAdjustment.submission_id == sub_id).delete()
        for pos, a in enumerate(body.adjustments):
            if a.kind not in m.ADJUSTMENT_KINDS:
                raise HTTPException(422, f"Unknown adjustment kind '{a.kind}'")
            db.add(m.WorkforceAdjustment(
                submission_id=sub_id, kind=a.kind, label=a.label,
                fte=abs(float(a.fte or 0)),      # sign belongs to the kind, never to the number
                headcount=max(0, int(a.headcount or 0)),
                starts_on=a.starts_on, ends_on=a.ends_on,
                source_department_id=a.source_department_id,
                receiving_department_id=a.receiving_department_id,
                counts_in_supply=bool(a.counts_in_supply), note=a.note, position=pos))
    workflow.bump_last_updated(db)
    db.commit()
    return _submission_payload(db, sub)


# The exact wording the entity signs. Held on the server so the record shows what was attested to,
# not just that a box was ticked — and so the text can't drift between the UI and the audit.
ATTESTATION_TEXT = ("I confirm that the submitted figures are complete, supported by the stated "
                    "sources and approved by the relevant entity owner.")


class SubmitBody(BaseModel):
    attested: bool = False
    attested_by: str = ""


@router.post("/submissions/{sub_id}/submit")
def submit_submission(sub_id: int, body: SubmitBody | None = None,
                      db: Session = Depends(get_db)) -> dict:
    sub = _require(db.get(m.DepartmentSubmission, sub_id), "Submission")
    _win_dept = db.get(m.Department, sub.department_id)
    if _win_dept:
        _require_open_window(db, _win_dept.entity_id)
    if sub.status not in EDITABLE:
        raise HTTPException(409, f"Cannot submit from status '{sub.status}'.")
    body = body or SubmitBody()
    # A submission cannot be sent unattested. The signer is named and captured, so DGHR reviews a
    # record someone put their name to — and, because the version is frozen at submit, the
    # attestation is bound to exactly these figures rather than to a box ticked before they changed.
    if not body.attested:
        raise HTTPException(422, "You must confirm the attestation before submitting.")
    if not body.attested_by.strip():
        raise HTTPException(422, "The attestation must be signed by a named person.")

    dept = db.get(m.Department, sub.department_id)
    # answering any open clarifications closes them
    db.query(m.SubmissionClarification).filter(
        m.SubmissionClarification.submission_id == sub_id,
        m.SubmissionClarification.status == "open").update({m.SubmissionClarification.status: "answered"})
    now = datetime.utcnow()
    sub.status = "submitted"
    sub.submitted_at = now
    sub.submitted_by_name = body.attested_by.strip()
    sub.attested = True
    sub.attested_by = body.attested_by.strip()
    sub.attested_at = now
    sz = sizing.submission_sizing(db, sub)
    workflow.add_audit(db, label=f"{dept.name} v{sub.version} submitted & attested by {body.attested_by.strip()} "
                                 f"(required {sz['required_fte']} FTE)",
                       actor_name=body.attested_by.strip(), entity_id=dept.entity_id,
                       submission_id=sub.id, verb="submitted")
    workflow.notify(db, audience="dghr", kind="status",
                    title=f"{dept.name} submitted",
                    body=f"Required {sz['required_fte']} FTE · gap {sz['gap']}", entity_id=dept.entity_id)
    workflow.bump_last_updated(db)
    db.commit()
    return _submission_payload(db, sub)


@router.get("/entities/{entity_id}/submissions")
def list_submissions(entity_id: int, status: str | None = None, db: Session = Depends(get_db)) -> dict:
    _require(db.get(m.Entity, entity_id), "Entity")
    depts = {d.id: d for d in db.query(m.Department).filter(m.Department.entity_id == entity_id).all()}
    q = db.query(m.DepartmentSubmission).filter(
        m.DepartmentSubmission.department_id.in_(list(depts.keys()) or [0]))
    if status:
        q = q.filter(m.DepartmentSubmission.status == status)
    rows = []
    for s in q.order_by(m.DepartmentSubmission.id.desc()).all():
        dept = depts[s.department_id]
        sz = sizing.submission_sizing(db, s)
        rows.append({
            "id": s.id, "department_id": dept.id, "department": dept.name,
            "typeset_id": dept.typeset_id, "status": s.status,
            "required_fte": sz["required_fte"], "current_fte": sz["current_fte"], "gap": sz["gap"],
            "open_clarifications": db.query(m.SubmissionClarification).filter(
                m.SubmissionClarification.submission_id == s.id,
                m.SubmissionClarification.status == "open").count(),
            "updated_at": s.updated_at.isoformat() if s.updated_at else None,
            # S15: when it was sent, and how long it has been waiting on DGHR (None once decided).
            "submitted_at": s.submitted_at.isoformat() if s.submitted_at else None,
            "days_waiting": (
                max(0, (datetime.now(timezone.utc) - s.submitted_at).days)
                if s.submitted_at and s.status in ("submitted", "in_clarification", "recommended") and not s.decided_at
                else None),
        })
    return {"rows": rows}


@router.post("/submissions/{sub_id}/champion-verify")
def champion_verify(sub_id: int, db: Session = Depends(get_db)) -> dict:
    """S10-14: the entity's HR champion verifies the consolidated report before it goes to DGHR.
    Only a still-editable draft can be verified; a later edit is expected to be re-verified."""
    sub = _require(db.get(m.DepartmentSubmission, sub_id), "Submission")
    if not versioning.is_editable(db, sub):
        raise HTTPException(409, "Only a draft submission can be verified by the champion.")
    dept = db.get(m.Department, sub.department_id)
    ent = db.get(m.Entity, dept.entity_id) if dept else None
    sub.champion_verified_at = datetime.utcnow()
    sub.champion_verified_by = ent.champion_name if ent and ent.champion_name else "Entity champion"
    db.commit()
    return _submission_payload(db, sub)


@router.get("/entities/{entity_id}/reminders")
def entity_reminders(entity_id: int, db: Session = Depends(get_db)) -> dict:
    """S19: reminder receipts for this entity in the open cycle — who was reminded (champion and
    form-filling contributors) and whether the reminder has been read."""
    _require(db.get(m.Entity, entity_id), "Entity")
    cyc = cycles.current_cycle(db)
    rows = []
    if cyc:
        recs = (db.query(m.ReminderReceipt)
                .filter(m.ReminderReceipt.cycle_id == cyc.id,
                        m.ReminderReceipt.entity_id == entity_id)
                .order_by(m.ReminderReceipt.recipient_role, m.ReminderReceipt.id).all())
        for r in recs:
            rows.append({
                "recipient_name": r.recipient_name, "recipient_role": r.recipient_role,
                "milestone": r.milestone,
                "sent_at": r.sent_at.isoformat() if r.sent_at else None,
                "read_at": r.read_at.isoformat() if r.read_at else None,
                "read": r.read_at is not None,
            })
    return {"reminders": rows, "total": len(rows), "read": sum(1 for r in rows if r["read"])}


@router.get("/entities/{entity_id}/sizing")
def entity_sizing_view(entity_id: int, db: Session = Depends(get_db)) -> dict:
    _require(db.get(m.Entity, entity_id), "Entity")
    return sizing.entity_sizing(db, entity_id, received_only=True)


# Entity-scoped views count ALL of the entity's departments (drafts included), matching the
# entity Departments / DGHR entity-detail pages (both use entity_sizing received_only=False), so the
# Current-FTE tile and the Human-Capital headcount reconcile on the same screen. The government-wide
# roll-ups stay received-only (formally submitted) — see /dghr/human-capital and /dghr/projection.
@router.get("/entities/{entity_id}/human-capital")
def entity_human_capital_view(entity_id: int, db: Session = Depends(get_db)) -> dict:
    ent = _require(db.get(m.Entity, entity_id), "Entity")
    out = human_capital.entity_human_capital(db, entity_id, received_only=False)
    out["entity"] = {"id": ent.id, "name": ent.name, "code": ent.code}
    return out


@router.get("/entities/{entity_id}/projection")
def entity_projection_view(entity_id: int, scenario: str = "base", db: Session = Depends(get_db)) -> dict:
    ent = _require(db.get(m.Entity, entity_id), "Entity")
    scn = calc_config.valid_scenario(db, scenario)
    out = sizing.entity_projection(db, entity_id, received_only=False, base_year=_base_year(db), scenario=scn)
    out["entity"] = {"id": ent.id, "name": ent.name, "code": ent.code}
    return out


# ═══════════════════════ DGHR: visibility + review ═══════════════════════
@router.get("/dghr/government")
def gov_position(scenario: str = "base", basis: str = "received", db: Session = Depends(get_db)) -> dict:
    scn = calc_config.valid_scenario(db, scenario)
    bss = basis if basis in sizing.BASIS_KEYS else "received"
    out = sizing.government_sizing(db, basis=bss, scenario=scn)
    out["scenario"] = scn
    # Scenario list comes from calc_scenarios so the picker can never offer a scenario the
    # engine cannot price, nor label one differently from what it applied.
    out["scenarios"] = calc_config.scenario_options(db)
    out["bases"] = list(sizing.BASES)
    return out


# ═══════════════════════ calculation traceability ═══════════════════════
# Every FTE on screen resolves here. The trace is built on demand from the same engine that produced
# the number, so the two cannot disagree — and nothing is cached, because a stored trace is one that
# can go stale and quietly start lying about a figure someone is about to make a decision on.
TRACE_KINDS = ("driver", "submission", "entity", "government")


class OverrideBody(BaseModel):
    value: float
    reason: str
    actor_name: str = ""
    actor_role: str = ""


@router.get("/trace/{kind}/{ref_id}")
def get_trace(kind: str, ref_id: int, scenario: str = "base", basis: str = "received",
              db: Session = Depends(get_db)) -> dict:
    if kind not in TRACE_KINDS:
        raise HTTPException(404, f"Unknown trace kind '{kind}'")
    out = trace.build(db, kind, ref_id, scenario=calc_config.valid_scenario(db, scenario), basis=basis)
    return _require(out, "Calculation")


@router.get("/method/registry")
def method_registry(db: Session = Depends(get_db)) -> dict:
    """The published calculation method — every formula, parameter and scenario the engine will
    apply, straight from the rows it reads. This is what makes the method inspectable rather than
    merely described."""
    cfg = calc_config.config(db)
    return {
        "methods": [{
            "family": mt.family, "label": mt.label, "version": mt.version, "ref": mt.ref,
            "expression": formula.render(mt.expression), "expression_raw": mt.expression,
            "description": mt.description, "source": mt.source,
            "rounding": mt.rounding, "rounding_note": mt.rounding_note,
            "effective_from": str(mt.effective_from) if mt.effective_from else None,
            "owner": mt.owner_name, "param_specs": mt.param_specs,
        } for mt in sorted(cfg.methods.values(), key=lambda x: x.id)],
        "parameters": [{
            "key": p.key, "label": p.label, "value": p.value, "unit": p.unit,
            "description": p.description, "source": p.source, "owner": p.owner_name,
            "effective_from": str(p.effective_from) if p.effective_from else None,
        } for p in sorted(cfg.params.values(), key=lambda x: x.key)],
        "scenarios": calc_config.scenario_options(db),
        # The periods a Required FTE can state. The stepper reads these to size each period live,
        # so the client can never offer a period the engine doesn't compute.
        "measures": [{
            "key": x.key, "label": x.label, "short_label": x.short_label,
            "volume_field": x.volume_field, "expression": x.expression,
            "description": x.description, "period_note": x.period_note, "source": x.source,
            "derived": x.derived,
        } for x in cfg.measures],
    }


@router.post("/trace/driver/{driver_id}/override")
def override_driver(driver_id: int, body: OverrideBody, db: Session = Depends(get_db)) -> dict:
    """Overrule the engine for one driver.

    A reason and a name are mandatory, not politeness: an unexplained, unattributed override of a
    figure that will influence a government workforce decision is exactly what traceability exists
    to prevent. The calculated value is stored beside the override so the trace shows both.
    """
    d = _require(db.get(m.SubmissionDriver, driver_id), "Driver")
    if not body.reason.strip():
        raise HTTPException(422, "A reason is required to override a calculated value.")
    if not body.actor_name.strip():
        raise HTTPException(422, "An override must be attributed to a named person.")
    if body.value < 0:
        raise HTTPException(422, "An override cannot be negative.")

    cfg = calc_config.config(db)
    calculated = sizing._effective(cfg, d.family,
                                   sizing.driver_fte_raw(cfg, d.family, float(d.volume or 0), d.params))

    # Supersede any override already in force — history is kept, never rewritten.
    for prev in db.query(m.CalcOverride).filter(
            m.CalcOverride.scope == "driver", m.CalcOverride.ref_id == driver_id,
            m.CalcOverride.active.is_(True)).all():
        prev.active = False

    user = db.query(m.User).filter(m.User.name == body.actor_name.strip()).first()
    db.add(m.CalcOverride(
        scope="driver", ref_id=driver_id, field="fte",
        calculated_value=calculated, override_value=body.value,
        reason=body.reason.strip(), actor_id=user.id if user else None,
        actor_name=body.actor_name.strip(), actor_role=body.actor_role.strip(), active=True,
    ))

    sub = db.get(m.DepartmentSubmission, d.submission_id)
    dept = db.get(m.Department, sub.department_id) if sub else None
    workflow.add_audit(
        db,
        label=f"'{d.name}' FTE overridden {calculated:g} → {body.value:g} — {body.reason.strip()}",
        actor_name=body.actor_name.strip(),
        entity_id=dept.entity_id if dept else None,
    )
    db.commit()
    return _require(trace.driver_trace(db, driver_id), "Calculation")


@router.delete("/trace/override/{override_id}")
def revoke_override(override_id: int, db: Session = Depends(get_db)) -> dict:
    """Revoke an override — the value reverts to the engine's. The row stays, deactivated, so the
    trace can still show that a human once intervened and that it was withdrawn."""
    ov = _require(db.get(m.CalcOverride, override_id), "Override")
    ov.active = False
    workflow.add_audit(db, label=f"Override withdrawn — value reverted to the calculated figure",
                       actor_name=ov.actor_name or "DGHR Admin")
    db.commit()
    return _require(trace.build(db, ov.scope, ov.ref_id), "Calculation")


# ═══════════════════════ documents (real files on the uploads volume) ═══════════════════════
def _doc_row(u: m.Upload) -> dict:
    size = 0
    try:
        size = os.path.getsize(u.path) if u.path and os.path.exists(u.path) else 0
    except OSError:
        size = 0
    return {
        "id": u.id, "filename": u.filename, "category": (u.meta or {}).get("category", "General"),
        "department_id": u.department_id,
        "uploaded_by": u.uploaded_by, "uploaded_at": u.uploaded_at.isoformat() if u.uploaded_at else None,
        "size_bytes": size, "missing": not (u.path and os.path.exists(u.path)),
    }


@router.get("/entities/{entity_id}/documents")
def list_documents(entity_id: int, db: Session = Depends(get_db)) -> dict:
    _require(db.get(m.Entity, entity_id), "Entity")
    rows = (
        db.query(m.Upload)
        .filter(m.Upload.entity_id == entity_id, m.Upload.kind == DOC_KIND)
        .order_by(m.Upload.uploaded_at.desc(), m.Upload.id.desc())
        .all()
    )
    docs = [_doc_row(u) for u in rows]
    return {"documents": docs, "total": len(docs),
            "total_bytes": sum(d["size_bytes"] for d in docs)}


def _department_documents(db: Session, department_id: int) -> list[dict]:
    """Documents supporting a specific department's submission — those attached to the department,
    plus the entity-wide ones that back every submission (methodology, org chart)."""
    dept = db.get(m.Department, department_id)
    if not dept:
        return []
    rows = (
        db.query(m.Upload)
        .filter(m.Upload.kind == DOC_KIND,
                (m.Upload.department_id == department_id)
                | ((m.Upload.entity_id == dept.entity_id) & (m.Upload.department_id.is_(None))))
        .order_by(m.Upload.department_id.isnot(None).desc(),  # department-specific first
                  m.Upload.uploaded_at.desc(), m.Upload.id.desc())
        .all()
    )
    return [{**_doc_row(u), "scope": "department" if u.department_id else "entity"} for u in rows]


@router.get("/departments/{department_id}/documents")
def list_department_documents(department_id: int, db: Session = Depends(get_db)) -> dict:
    _require(db.get(m.Department, department_id), "Department")
    docs = _department_documents(db, department_id)
    return {"documents": docs, "total": len(docs),
            "total_bytes": sum(d["size_bytes"] for d in docs)}


@router.post("/entities/{entity_id}/documents")
async def upload_document(
    entity_id: int,
    file: UploadFile = File(...),
    category: str = Form("General"),
    uploaded_by: str = Form("Entity User"),
    department_id: int | None = Form(None),
    db: Session = Depends(get_db),
) -> dict:
    _require(db.get(m.Entity, entity_id), "Entity")
    if department_id is not None:
        dept = _require(db.get(m.Department, department_id), "Department")
        if dept.entity_id != entity_id:
            raise HTTPException(422, "That department belongs to a different entity.")
    data = await file.read()
    if not data:
        raise HTTPException(422, "The file is empty.")
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    original = os.path.basename(file.filename or "upload.bin")
    safe = f"{entity_id}_{int(datetime.utcnow().timestamp())}_{original}"
    path = os.path.join(UPLOAD_DIR, safe)
    with open(path, "wb") as f:
        f.write(data)
    u = m.Upload(entity_id=entity_id, department_id=department_id, kind=DOC_KIND,
                 filename=original, path=path, uploaded_by=uploaded_by, meta={"category": category})
    db.add(u)
    workflow.bump_last_updated(db)
    db.commit()
    db.refresh(u)
    return {"ok": True, "document": _doc_row(u)}


@router.get("/documents/{doc_id}/download")
def download_document(doc_id: int, db: Session = Depends(get_db)):
    u = _require(db.get(m.Upload, doc_id), "Document")
    if not u.path or not os.path.exists(u.path):
        raise HTTPException(404, "The stored file is no longer available.")
    return FileResponse(u.path, filename=u.filename, media_type="application/octet-stream")


@router.delete("/documents/{doc_id}")
def delete_document(doc_id: int, db: Session = Depends(get_db)) -> dict:
    u = _require(db.get(m.Upload, doc_id), "Document")
    try:
        if u.path and os.path.exists(u.path):
            os.remove(u.path)
    except OSError:
        pass
    db.delete(u)
    workflow.bump_last_updated(db)
    db.commit()
    return {"ok": True}


# ═══════════════════════ calendar (real cycle + submission milestones) ═══════════════════════
@router.get("/entities/{entity_id}/calendar")
def entity_calendar(entity_id: int, db: Session = Depends(get_db)) -> dict:
    _require(db.get(m.Entity, entity_id), "Entity")
    cycle = cycles.current_cycle(db)
    events: list[dict] = []
    if cycle:
        if cycle.starts_on:
            events.append({"date": cycle.starts_on.isoformat(), "kind": "cycle_open",
                           "title": "Collection cycle opens", "detail": cycle.name})
        if cycle.deadline:
            events.append({"date": cycle.deadline.isoformat(), "kind": "deadline",
                           "title": "Submission deadline", "detail": cycle.name})
        if cycle.ends_on and cycle.ends_on != cycle.deadline:
            events.append({"date": cycle.ends_on.isoformat(), "kind": "cycle_close",
                           "title": "Collection cycle closes", "detail": cycle.name})

    depts = {d.id: d for d in db.query(m.Department).filter(m.Department.entity_id == entity_id).all()}
    subs = (
        db.query(m.DepartmentSubmission)
        .filter(m.DepartmentSubmission.department_id.in_(list(depts.keys()) or [0]))
        .all()
    )
    for s in subs:
        name = depts[s.department_id].name if s.department_id in depts else "Department"
        if s.submitted_at:
            events.append({"date": s.submitted_at.date().isoformat(), "kind": "submitted",
                           "title": f"{name} submitted", "detail": "Sent to DGHR for review",
                           "department_id": s.department_id})
        if s.decided_at:
            decided = "approved" if s.status == "approved" else "rejected" if s.status == "rejected" else "decided"
            events.append({"date": s.decided_at.date().isoformat(), "kind": decided,
                           "title": f"{name} {decided}", "detail": s.decision_note or "",
                           "department_id": s.department_id})
    for c in (
        db.query(m.SubmissionClarification)
        .filter(m.SubmissionClarification.submission_id.in_([s.id for s in subs] or [0]))
        .all()
    ):
        if c.side == "dghr" and c.created_at:
            events.append({"date": c.created_at.date().isoformat(), "kind": "clarification",
                           "title": "Clarification raised by DGHR",
                           "detail": c.element_label or c.message[:80]})

    events.sort(key=lambda e: e["date"])
    outstanding = sum(1 for d in depts.values() if not any(
        s.department_id == d.id and s.status in RECEIVED for s in subs))
    return {
        "cycle": {"name": cycle.name, "starts_on": cycle.starts_on.isoformat(),
                  "ends_on": cycle.ends_on.isoformat(), "deadline": cycle.deadline.isoformat(),
                  "status": cycle.status} if cycle else None,
        "events": events,
        "departments_total": len(depts),
        "departments_outstanding": outstanding,
    }


# ═══════════════════════ report export (CSV of what the app computed) ═══════════════════════
@router.get("/entities/{entity_id}/report/export.csv")
def export_entity_report(entity_id: int, db: Session = Depends(get_db)):
    ent = _require(db.get(m.Entity, entity_id), "Entity")
    es = sizing.entity_sizing(db, entity_id, received_only=False)
    hc = human_capital.entity_human_capital(db, entity_id, received_only=False)
    hc_by_dept = {d["department_id"]: d for d in hc["departments"]}

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Entity", ent.name, ent.code])
    w.writerow([])
    w.writerow(["Department", "Status", "Current FTE", "Required FTE", "Gap",
                "Headcount", "Emiratization %", "Annual cost (AED)"])
    for d in es["departments"]:
        h = hc_by_dept.get(d["department_id"], {})
        w.writerow([d["name"], d["status"], d["current_fte"], d["required_fte"] if d["required_fte"] is not None else "",
                    d["gap"] if d["gap"] is not None else "", h.get("headcount", 0),
                    h.get("emiratization_pct", 0), h.get("annual_cost_aed", 0)])
    t = es["totals"]
    w.writerow(["TOTAL", "", t["current_fte"], t["required_fte"], t["gap"],
                hc["headcount"], hc["emiratization_pct"], hc["annual_cost_aed"]])
    w.writerow([])
    w.writerow(["Job level", "Headcount", "% of workforce", "Emirati", "Emiratization %", "Annual cost (AED)"])
    for b in hc["by_level"]:
        w.writerow([b["label"], b["headcount"], b["pct"], b["emirati_count"], b["emiratization_pct"], b["cost"]])

    fname = f"{ent.code or 'entity'}_workforce_report.csv"
    return Response(
        content=buf.getvalue(), media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


# ═══════════════════════ DGHR alerts (real flags from the sizing engine) ═══════════════════════
# G6/S18: each flag row also states the recommended action, matched by keyword so it stays correct
# even if the engine's flag wording changes.
_FLAG_ACTION = [
    ("variance", "Deep-dive review with the entity"),
    ("floor", "Confirm the legal basis for the floor"),
    ("driver", "Return for driver entry"),
    ("override", "Verify the manual override"),
    ("forecast", "Confirm the forecast assumption"),
]


def _alert_action(flags: list[str]) -> str:
    for f in flags:
        low = f.lower()
        for key, action in _FLAG_ACTION:
            if key in low:
                return action
    return "Review the submission"


@router.get("/dghr/alerts")
def gov_alerts(db: Session = Depends(get_db)) -> dict:
    """Every received submission the sizing engine flagged. No fabricated alerts — each row is a
    flag services/sizing.py actually raised (variance > 15%, statutory floor binds, no drivers)."""
    entities = {e.id: e for e in db.query(m.Entity).all()}
    depts = {d.id: d for d in db.query(m.Department).all()}
    rows: list[dict] = []
    by_flag: dict[str, int] = {}
    for s in db.query(m.DepartmentSubmission).all():
        if s.status not in RECEIVED:
            continue
        sz = sizing.submission_sizing(db, s)
        flags = sz.get("flags") or []
        if not flags:
            continue
        dept = depts.get(s.department_id)
        ent = entities.get(dept.entity_id) if dept else None
        for f in flags:
            by_flag[f] = by_flag.get(f, 0) + 1
        rows.append({
            "submission_id": s.id, "status": s.status,
            "entity_id": ent.id if ent else None, "entity": ent.name if ent else "—",
            "department_id": dept.id if dept else None, "department": dept.name if dept else "—",
            "flags": flags, "required_fte": sz["required_fte"], "current_fte": sz["current_fte"],
            "gap": sz["gap"],
            "variance_pct": round(abs(sz["gap"]) / sz["required_fte"] * 100, 1) if sz["required_fte"] else 0,
            "recommended_action": _alert_action(flags),
            # S18: submission date + who submitted / reviewed / which champion, for the flag drill-down.
            "submitted_at": s.submitted_at.isoformat() if s.submitted_at else None,
            "submitted_by": s.submitted_by_name or "",
            "reviewed_by": s.decided_by_name or s.recommended_by_name or "",
            "champion": ent.champion_name if ent else None,
        })
    rows.sort(key=lambda r: (-len(r["flags"]), -r["variance_pct"]))
    return {"alerts": rows, "total": len(rows),
            "by_flag": [{"flag": k, "count": v} for k, v in sorted(by_flag.items(), key=lambda x: -x[1])]}


@router.get("/pipeline")
def submission_pipeline_view(entity_id: int | None = None, db: Session = Depends(get_db)) -> dict:
    """G7: where each submission sits in the pipeline. Pass `entity_id` for one entity; omit for the
    government-wide view with a per-entity breakdown."""
    return sizing.submission_pipeline(db, entity_id)


@router.get("/dghr/clarification-queue")
def clarification_queue(db: Session = Depends(get_db)) -> dict:
    """Every OPEN clarification government-wide, aged and ranked worst-first — the escalation queue.

    Ageing is derived from each question's own timestamp (services/revisions.clarification_age), so
    an item escalates as the clock moves without anything being stored or a job being run. A
    clarification left unanswered is the workflow's most common silent failure; this makes it loud.
    """
    sla_days, escalate_after = review.sla(db)
    entities = {e.id: e for e in db.query(m.Entity).all()}
    depts = {d.id: d for d in db.query(m.Department).all()}
    subs = {s.id: s for s in db.query(m.DepartmentSubmission).all()}
    order = {lvl: i for i, lvl in enumerate(reversed(revisions.LEVELS))}   # escalated first
    rows = []
    counts = {lvl: 0 for lvl in revisions.LEVELS}
    for c in db.query(m.SubmissionClarification).filter(
            m.SubmissionClarification.status == "open",
            m.SubmissionClarification.side == "dghr").all():
        sub = subs.get(c.submission_id)
        dept = depts.get(sub.department_id) if sub else None
        ent = entities.get(dept.entity_id) if dept else None
        age = revisions.clarification_age(c, sla_days=sla_days, escalate_after=escalate_after)
        counts[age["level"]] += 1
        rows.append({
            "id": c.id, "submission_id": c.submission_id,
            "entity_id": ent.id if ent else None, "entity": ent.name if ent else "—",
            "department_id": dept.id if dept else None, "department": dept.name if dept else "—",
            "element_label": c.element_label or c.element_type, "message": c.message,
            "author": c.author, **age,
        })
    rows.sort(key=lambda r: (order.get(r["level"], 99), -r["days_open"]))
    return {"clarifications": rows, "total": len(rows), "by_level": counts,
            "sla_days": sla_days, "escalate_after": escalate_after}


@router.get("/dghr/report/export.csv")
def export_gov_report(scenario: str = "base", db: Session = Depends(get_db)):
    scn = calc_config.valid_scenario(db, scenario)
    gov = sizing.government_sizing(db, scenario=scn)
    hc = human_capital.government_human_capital(db)
    hc_by_entity = {e["entity_id"]: e for e in hc["entities"]}

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Government-wide workforce report",
                f"scenario: {calc_config.config(db).scenarios[scn].label}"])
    w.writerow([])
    w.writerow(["Entity", "Code", "Departments", "Received", "Current FTE", "Required FTE", "Gap",
                "Headcount", "Emiratization %", "Annual cost (AED)"])
    for e in gov["entities"]:
        h = hc_by_entity.get(e["entity_id"], {})
        w.writerow([e["name"], e["code"], e["dept_count"], e["received"], e["current_fte"],
                    e["required_fte"], e["gap"], h.get("headcount", 0),
                    h.get("emiratization_pct", 0), h.get("annual_cost_aed", 0)])
    t = gov["totals"]
    w.writerow(["TOTAL", "", "", t["departments"], t["current_fte"], t["required_fte"], t["gap"],
                hc["headcount"], hc["emiratization_pct"], hc["annual_cost_aed"]])
    w.writerow([])
    w.writerow(["By department type", "Departments", "Current FTE", "Required FTE", "Gap"])
    for b in gov["by_typeset"]:
        w.writerow([b["typeset"], b["departments"], b["current_fte"], b["required_fte"], b["gap"]])
    w.writerow([])
    w.writerow(["Job level", "Headcount", "% of workforce", "Emirati", "Emiratization %", "Annual cost (AED)"])
    for b in hc["by_level"]:
        w.writerow([b["label"], b["headcount"], b["pct"], b["emirati_count"], b["emiratization_pct"], b["cost"]])

    return Response(
        content=buf.getvalue(), media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="government_workforce_report.csv"'},
    )


@router.get("/dghr/human-capital")
def gov_human_capital(basis: str = "received", entity_id: int | None = None,
                      job_level: str | None = None, dim: str | None = None,
                      bucket: str | None = None, db: Session = Depends(get_db)) -> dict:
    """S1: the government-wide Human Capital view, optionally scoped/sliced by the page-top filters."""
    if entity_id is None and not job_level and not dim:
        return human_capital.government_human_capital(db, basis=basis)
    return human_capital.filtered_human_capital(
        db, basis=basis, entity_id=entity_id, job_level=job_level, dim=dim, bucket=bucket)


@router.get("/dghr/hc-filters")
def hc_filters(db: Session = Depends(get_db)) -> dict:
    """S1: options for the Government page's top filters — data-driven, no hardcoded lists."""
    ents = [{"entity_id": e.id, "name": e.name, "code": e.code}
            for e in db.query(m.Entity).order_by(m.Entity.name).all()]
    levels = [{"key": lv["key"], "label": lv["label"]} for lv in human_capital.JOB_LEVELS]
    dims = [{"key": d, "label": human_capital.BAND_LABEL[d],
             "buckets": [{"bucket": k, "label": lbl} for k, lbl in human_capital.WORKFORCE_BANDS[d]["buckets"]]}
            for d in human_capital.BAND_DIMENSIONS]
    return {"entities": ents, "job_levels": levels, "dimensions": dims}


@router.get("/dghr/projection")
def gov_projection(scenario: str = "base", basis: str = "received", db: Session = Depends(get_db)) -> dict:
    scn = calc_config.valid_scenario(db, scenario)
    return sizing.government_projection(db, basis=basis, base_year=_base_year(db), scenario=scn)


# ═══════════════════════ DGHR: executive analytics dashboards ═══════════════════════
# Three composed views (Human Capital Overview, Demand Analysis, Supply Analysis). `entity_id`
# optional — omit for the government-wide roll-up (filtered by `basis`), pass one to drill into a
# single entity. Everything live reconciles with the Government Position; illustrative panels are
# flagged in the payload. See services/analytics.py.
def _valid_basis(basis: str) -> str:
    return basis if basis in sizing.BASIS_KEYS else "received"


@router.get("/dghr/analytics/human-capital")
def analytics_human_capital(basis: str = "received", scenario: str = "base",
                            entity_id: int | None = None, db: Session = Depends(get_db)) -> dict:
    return analytics.human_capital_overview(
        db, basis=_valid_basis(basis), scenario=calc_config.valid_scenario(db, scenario),
        entity_id=entity_id)


@router.get("/dghr/analytics/demand")
def analytics_demand(basis: str = "received", scenario: str = "base",
                     entity_id: int | None = None, db: Session = Depends(get_db)) -> dict:
    return analytics.demand_analysis(
        db, basis=_valid_basis(basis), scenario=calc_config.valid_scenario(db, scenario),
        entity_id=entity_id)


@router.get("/dghr/analytics/supply")
def analytics_supply(basis: str = "received", scenario: str = "base",
                     entity_id: int | None = None, db: Session = Depends(get_db)) -> dict:
    return analytics.supply_analysis(
        db, basis=_valid_basis(basis), scenario=calc_config.valid_scenario(db, scenario),
        entity_id=entity_id)


def _parse_entity_ids(raw: str) -> list[int]:
    """Comma-separated `entity_ids=1,3,5` → [1, 3, 5]. Tolerant of blanks/spaces."""
    out: list[int] = []
    for part in (raw or "").split(","):
        part = part.strip()
        if part.isdigit():
            out.append(int(part))
    return out


@router.get("/dghr/analytics/entity-comparison")
def analytics_entity_comparison(entity_ids: str = "", basis: str = "received",
                                scenario: str = "base", db: Session = Depends(get_db)) -> dict:
    """Side-by-side comparison of up to 5 entities on descriptive workforce-structure ratios.
    `entity_ids` is a comma-separated list; extras beyond 5 are ignored."""
    return entity_comparison.entity_comparison(
        db, _parse_entity_ids(entity_ids), basis=_valid_basis(basis),
        scenario=calc_config.valid_scenario(db, scenario))


@router.get("/dghr/report/entity-comparison.csv")
def export_entity_comparison(entity_ids: str = "", basis: str = "received",
                             scenario: str = "base", db: Session = Depends(get_db)):
    data = entity_comparison.entity_comparison(
        db, _parse_entity_ids(entity_ids), basis=_valid_basis(basis),
        scenario=calc_config.valid_scenario(db, scenario))
    ents = data["entities"]

    buf = io.StringIO()
    w = csv.writer(buf)
    basis_label = next((b["label"] for b in data["bases"] if b["key"] == data["basis"]), data["basis"])
    w.writerow(["Entity comparison report", f"basis: {basis_label}"])
    w.writerow([])
    w.writerow(["Metric", "Group", "Unit"] + [e["code"] for e in ents])
    for metric in data["metrics"]:
        w.writerow([metric["label"], metric["group"], metric["unit"]]
                   + [metric["values"].get(str(e["id"]), {}).get("display", "—") for e in ents])

    return Response(
        content=buf.getvalue(), media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="entity_comparison.csv"'},
    )


@router.get("/dghr/entities")
def dghr_entities(db: Session = Depends(get_db)) -> dict:
    return {"entities": sizing.government_sizing(db)["entities"]}


@router.get("/dghr/entities/{entity_id}")
def dghr_entity_detail(entity_id: int, db: Session = Depends(get_db)) -> dict:
    ent = _require(db.get(m.Entity, entity_id), "Entity")
    es = sizing.entity_sizing(db, entity_id, received_only=False)
    ts_names = {t.id: t.name for t in db.query(m.Typeset).all()}
    for row in es["departments"]:
        row["typeset"] = ts_names.get(row["typeset_id"])
    return {"entity": {"id": ent.id, "name": ent.name, "code": ent.code}, **es}


@router.get("/dghr/submissions/{sub_id}")
def dghr_submission_detail(sub_id: int, db: Session = Depends(get_db)) -> dict:
    sub = _require(db.get(m.DepartmentSubmission, sub_id), "Submission")
    return _submission_payload(db, sub)


def _actor(db: Session, actor_id: int | None, actor_name: str, what: str) -> m.User:
    """The named person behind a decision. Mandatory, and it must resolve to a real reviewer —
    a signature we can't identify is a signature we can't check the next one against."""
    user = review.resolve_actor(db, actor_id, actor_name)
    if user is None:
        raise HTTPException(422, f"{what} must be signed by a named DGHR reviewer.")
    if user.role not in review.DGHR_ROLES:
        raise HTTPException(403, f"{user.name} is not a DGHR reviewer.")
    return user


def _decide(db: Session, sub: m.DepartmentSubmission, *, new_status: str, note: str, verb: str,
            actor: m.User, conditions: list[str] | None = None):
    dept = db.get(m.Department, sub.department_id)
    sub.status = new_status
    sub.decision_note = note
    sub.decided_at = datetime.utcnow()
    # These were never written at runtime — only by the seed — so every genuinely approved
    # submission displayed "not recorded" as its approver.
    sub.decided_by_id = actor.id
    sub.decided_by_name = actor.name
    sub.conditions = list(conditions or [])
    workflow.add_audit(db, label=f"{dept.name} v{sub.version} {verb} by {actor.name}"
                                 + (f": {note}" if note else ""),
                       actor_name=actor.name, entity_id=dept.entity_id,
                       submission_id=sub.id, verb=verb)
    workflow.notify(db, audience="entity", kind="status", entity_id=dept.entity_id,
                    title=f"{dept.name} v{sub.version} — {verb} by DGHR", body=note or "")
    workflow.bump_last_updated(db)
    db.commit()
    return dept


class DecisionBody(BaseModel):
    note: str = ""
    actor_id: int | None = None
    actor_name: str = ""
    conditions: list[str] = []


@router.post("/dghr/submissions/{sub_id}/recommend")
def recommend(sub_id: int, body: DecisionBody, db: Session = Depends(get_db)) -> dict:
    """Stage 1 of "Reviewer → Approver → DGHR": one reviewer's opinion, awaiting a second signature.

    Gated on every element being signed off — recommending a submission with an open query would be
    recommending something you have just said you don't accept.
    """
    sub = _require(db.get(m.DepartmentSubmission, sub_id), "Submission")
    if sub.status not in ("submitted", "in_clarification"):
        raise HTTPException(409, f"Can only recommend a submitted version (status '{sub.status}').")
    actor = _actor(db, body.actor_id, body.actor_name, "A recommendation")
    if not body.note.strip():
        raise HTTPException(422, "A rationale is required to recommend a submission.")

    state = review.review_state(db, sub)
    if not state["all_approved"]:
        raise HTTPException(409,
            f"{state['queried']} element(s) queried and {state['undecided']} not yet reviewed. "
            f"Sign off every element before recommending.")

    dept = db.get(m.Department, sub.department_id)
    sub.recommendation = "approve"
    sub.recommendation_note = body.note
    sub.recommended_at = datetime.utcnow()
    sub.recommended_by_id = actor.id
    sub.recommended_by_name = actor.name
    sub.status = "recommended"
    workflow.add_audit(db, label=f"{dept.name} v{sub.version} recommended for approval by {actor.name}",
                       actor_name=actor.name, entity_id=dept.entity_id,
                       submission_id=sub.id, verb="recommended")
    workflow.notify(db, audience="dghr", kind="status", entity_id=dept.entity_id,
                    title=f"{dept.name} v{sub.version} awaiting sign-off",
                    body=f"Recommended by {actor.name}. Needs a second signature.")
    workflow.bump_last_updated(db)
    db.commit()
    return _submission_payload(db, sub)


@router.post("/dghr/submissions/{sub_id}/approve")
def approve(sub_id: int, body: DecisionBody, db: Session = Depends(get_db)) -> dict:
    """Stage 2: the second signature — and the maker-checker rule that makes it worth having.

    Approve used to be a single unconfirmed click carrying the hardcoded note "Approved.", on the
    highest-consequence action in the product: the one that promotes a number into the Official
    government position. It now needs a recommendation, a different named person, and a rationale.
    """
    sub = _require(db.get(m.DepartmentSubmission, sub_id), "Submission")
    if sub.status != "recommended":
        raise HTTPException(409,
            "An approval must follow a recommendation — Reviewer → Approver. "
            f"This version is '{sub.status}'.")
    actor = _actor(db, body.actor_id, body.actor_name, "An approval")
    if not body.note.strip():
        raise HTTPException(422, "A rationale is required to approve a submission.")
    # THE control. Without it the second signature is decoration.
    if sub.recommended_by_id and actor.id == sub.recommended_by_id:
        raise HTTPException(409,
            f"{actor.name} recommended this version and cannot also approve it. "
            f"An approval must be signed by someone other than the reviewer.")
    _decide(db, sub, new_status="approved", note=body.note, verb="approved",
            actor=actor, conditions=[c.strip() for c in body.conditions if c.strip()])
    return _submission_payload(db, sub)


@router.post("/dghr/submissions/{sub_id}/reject")
def reject(sub_id: int, body: DecisionBody, db: Session = Depends(get_db)) -> dict:
    """Sending something back needs one named reviewer and a reason — not a second signature.
    Maker-checker guards the consequential act (approving), not the act of declining to."""
    sub = _require(db.get(m.DepartmentSubmission, sub_id), "Submission")
    if sub.status not in ("submitted", "in_clarification", "recommended"):
        raise HTTPException(409, f"Can only reject a submitted version (status '{sub.status}').")
    actor = _actor(db, body.actor_id, body.actor_name, "A rejection")
    if not body.note.strip():
        raise HTTPException(422, "A reason is required to reject.")
    _decide(db, sub, new_status="rejected", note=body.note, verb="rejected", actor=actor)
    return _submission_payload(db, sub)


class ElementDecisionBody(BaseModel):
    element_type: str
    element_key: str
    element_label: str = ""
    decision: str              # approved | queried
    note: str = ""
    actor_id: int | None = None
    actor_name: str = ""


@router.post("/dghr/submissions/{sub_id}/elements/decide")
def decide_element(sub_id: int, body: ElementDecisionBody, db: Session = Depends(get_db)) -> dict:
    """Sign off — or query — ONE part of a submission. Append-only: a later verdict on the same
    element supersedes the earlier one and the earlier one stays as history."""
    sub = _require(db.get(m.DepartmentSubmission, sub_id), "Submission")
    if sub.status not in ("submitted", "in_clarification", "recommended"):
        raise HTTPException(409, f"Cannot review a version with status '{sub.status}'.")
    if body.decision not in m.ELEMENT_DECISIONS:
        raise HTTPException(422, f"Decision must be one of {', '.join(m.ELEMENT_DECISIONS)}.")
    if body.element_type not in m.ELEMENT_TYPES:
        raise HTTPException(422, f"Unknown element type '{body.element_type}'.")
    actor = _actor(db, body.actor_id, body.actor_name, "An element decision")
    if body.decision == "queried" and not body.note.strip():
        raise HTTPException(422, "Say what you're querying — a query without a reason isn't reviewable.")

    db.add(m.SubmissionElementDecision(
        submission_id=sub_id, element_type=body.element_type, element_key=body.element_key,
        element_label=body.element_label, decision=body.decision, note=body.note,
        actor_id=actor.id, actor_name=actor.name))
    # A recommendation stands on every element being approved. Querying one withdraws that ground,
    # so the version drops back to awaiting review rather than sitting recommended on a stale basis.
    if body.decision == "queried" and sub.status == "recommended":
        sub.status = "submitted"
        sub.recommendation = ""
        sub.recommendation_note = ""
        sub.recommended_at = None
        sub.recommended_by_id = None
        sub.recommended_by_name = ""
    workflow.bump_last_updated(db)
    db.commit()
    return _submission_payload(db, sub)


@router.post("/submissions/{sub_id}/revise")
def revise_submission(sub_id: int, db: Session = Depends(get_db)) -> dict:
    """Create the next version as a copy, leaving this one exactly as it was said.

    This is the only way to change anything that has left the entity's hands.
    """
    sub = _require(db.get(m.DepartmentSubmission, sub_id), "Submission")
    _win_dept = db.get(m.Department, sub.department_id)
    if _win_dept:
        _require_open_window(db, _win_dept.entity_id)
    if versioning.is_editable(db, sub):
        raise HTTPException(409, f"v{sub.version} is still a draft — edit it directly.")
    try:
        new = versioning.revise(db, sub)
    except ValueError as e:
        raise HTTPException(409, str(e))
    dept = db.get(m.Department, sub.department_id)
    workflow.add_audit(db, label=f"{dept.name} v{new.version} opened as a revision of v{sub.version}",
                       actor_name="Entity Power User", entity_id=dept.entity_id,
                       submission_id=new.id, verb="revised")
    workflow.bump_last_updated(db)
    db.commit()
    return _submission_payload(db, new)


@router.get("/departments/{dept_id}/history")
def submission_history(dept_id: int, db: Session = Depends(get_db)) -> dict:
    _require(db.get(m.Department, dept_id), "Department")
    return revisions.history(db, dept_id)


@router.get("/submissions/{sub_id}/diff")
def submission_diff(sub_id: int, against: int | None = None, db: Session = Depends(get_db)) -> dict:
    """This version against the one it revised, or against `against` (a submission id)."""
    sub = _require(db.get(m.DepartmentSubmission, sub_id), "Submission")
    if against is not None:
        other = _require(db.get(m.DepartmentSubmission, against), "Submission")
        if other.department_id != sub.department_id:
            raise HTTPException(422, "Can only compare versions of the same department.")
        return revisions.diff(db, other, sub)
    out = revisions.diff_with_previous(db, sub)
    if out is None:
        raise HTTPException(404, f"v{sub.version} is the first version — there is nothing to compare it against.")
    return out


@router.get("/dghr/reviewers")
def list_reviewers(db: Session = Depends(get_db)) -> dict:
    return {"reviewers": [{"id": u.id, "name": u.name, "initials": u.initials, "role": u.role}
                          for u in review.reviewers(db)]}


class ClarifyBody(BaseModel):
    element_type: str          # see models.ELEMENT_TYPES
    element_id: int | None = None
    element_key: str = ""
    element_label: str = ""
    message: str
    actor_id: int | None = None
    actor_name: str = ""


def _element_key_for(db: Session, element_type: str, element_id: int | None, given: str) -> str:
    """The durable pointer for a clarification. Derived from the element's own name when the caller
    doesn't supply one, because `element_id` will not survive the entity's next save."""
    if given.strip():
        return given.strip()
    if element_type == "driver" and element_id:
        d = db.get(m.SubmissionDriver, element_id)
        if d:
            return d.element_key or m.element_key(d.name)
    if element_type == "mandate" and element_id:
        f = db.get(m.MandateFloor, element_id)
        if f:
            return f.element_key or m.element_key(f.role)
    return element_type      # profile / supply / notes / submission are one per submission


@router.post("/dghr/submissions/{sub_id}/clarify")
def clarify(sub_id: int, body: ClarifyBody, db: Session = Depends(get_db)) -> dict:
    sub = _require(db.get(m.DepartmentSubmission, sub_id), "Submission")
    if sub.status not in ("submitted", "in_clarification", "recommended"):
        raise HTTPException(409, f"Can only raise a clarification on a submitted submission (status '{sub.status}').")
    if body.element_type not in m.ELEMENT_TYPES:
        raise HTTPException(422, f"Unknown element type '{body.element_type}'.")
    if not body.message.strip():
        raise HTTPException(422, "A clarification needs a question.")
    actor = _actor(db, body.actor_id, body.actor_name, "A clarification")
    dept = db.get(m.Department, sub.department_id)
    db.add(m.SubmissionClarification(
        submission_id=sub_id, element_type=body.element_type, element_id=body.element_id,
        element_key=_element_key_for(db, body.element_type, body.element_id, body.element_key),
        element_label=body.element_label, message=body.message, author=actor.name,
        side="dghr", status="open"))
    sub.status = "in_clarification"
    workflow.add_audit(db, label=f"{actor.name} asked about {dept.name} · {body.element_label or body.element_type}",
                       actor_name=actor.name, entity_id=dept.entity_id,
                       submission_id=sub_id, verb="clarified")
    workflow.notify(db, audience="entity", kind="clarification", entity_id=dept.entity_id,
                    title=f"{dept.name} — clarification requested",
                    body=f"{body.element_label or body.element_type}: {body.message}")
    workflow.bump_last_updated(db)
    db.commit()
    return _submission_payload(db, sub)


class ReplyBody(BaseModel):
    message: str


@router.post("/submissions/{sub_id}/clarifications/{clar_id}/reply")
def reply_clarification(sub_id: int, clar_id: int, body: ReplyBody, db: Session = Depends(get_db)) -> dict:
    sub = _require(db.get(m.DepartmentSubmission, sub_id), "Submission")
    parent = _require(db.get(m.SubmissionClarification, clar_id), "Clarification")
    # This was fetched by id alone, so a reply could be attached to a thread on a different
    # submission entirely.
    if parent.submission_id != sub_id:
        raise HTTPException(422, "That clarification belongs to a different submission.")
    if not body.message.strip():
        raise HTTPException(422, "A reply needs a message.")
    dept = db.get(m.Department, sub.department_id)
    db.add(m.SubmissionClarification(
        submission_id=sub_id, element_type=parent.element_type, element_id=parent.element_id,
        element_key=parent.element_key,
        element_label=parent.element_label, message=body.message, author="Entity Power User",
        side="entity", status="answered", parent_id=clar_id))
    parent.status = "answered"
    workflow.notify(db, audience="dghr", kind="clarification", entity_id=dept.entity_id,
                    title=f"{dept.name} — clarification answered", body=body.message)
    workflow.bump_last_updated(db)
    db.commit()
    return _submission_payload(db, sub)

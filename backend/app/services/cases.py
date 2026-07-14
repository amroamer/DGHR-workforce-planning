"""Cases + governance workflow (SPEC §5, §8, §11). The closed cross-portal loop.

Every mutation flows through here → state change + audit_events + notification to the
opposite audience + last-updated bump (via services.workflow)."""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy.orm import Session

from app import models as m
from app.services import workflow

STATUS_LABELS = {
    "not_started": "Not Started", "in_progress": "In Progress", "submitted": "Submitted",
    "under_review": "Under Review", "returned": "Returned", "approved": "Approved",
}
APPLICABLE_KEYS = ["org_structure", "current_workforce", "workload_service", "future_drivers", "evidence_documents"]


# ─────────────────────────── ref generation ───────────────────────────
def _next_ref(db: Session, prefix: str) -> str:
    year = date.today().year
    like = f"{prefix}-{year}-%"
    existing = [c.ref for c in db.query(m.Case).filter(m.Case.ref.like(like)).all()]
    seqs = []
    for r in existing:
        try:
            seqs.append(int(r.split("-")[-1]))
        except ValueError:
            continue
    nxt = (max(seqs) + 1) if seqs else 1
    return f"{prefix}-{year}-{nxt:05d}"


# ─────────────────────────── roll-up state machine (§5) ───────────────────────────
def recompute_rollup(db: Session, entity_id: int) -> str:
    eps = db.query(m.EntityPackage).filter(
        m.EntityPackage.entity_id == entity_id, m.EntityPackage.applicable.is_(True)
    ).all()
    statuses = [ep.status for ep in eps]
    if not statuses:
        return "not_started"
    if all(s == "approved" for s in statuses):
        roll = "approved"
    elif any(s == "returned" for s in statuses):
        roll = "returned"
    elif any(s == "under_review" for s in statuses) and not any(s == "in_progress" for s in statuses):
        roll = "under_review"
    elif all(s in ("submitted", "approved") for s in statuses):
        roll = "submitted"
    elif any(s in ("in_progress", "submitted", "under_review") for s in statuses):
        roll = "in_progress"
    else:
        roll = "not_started"
    e = db.get(m.Entity, entity_id)
    e.status = roll
    if e.due_date and e.due_date < date.today() and roll != "approved":
        e.overdue = True
    else:
        e.overdue = False
    # completeness = mean of applicable package progress
    e.completeness = round(sum(ep.progress for ep in eps) / len(eps))
    db.flush()
    return roll


# ─────────────────────────── serialization ───────────────────────────
def _case_summary(db: Session, c: m.Case) -> dict:
    e = db.get(m.Entity, c.entity_id)
    return {
        "id": c.id, "ref": c.ref, "kind": c.kind, "entity_id": c.entity_id,
        "entity": e.name if e else "", "package_label": c.package_label,
        "priority": c.priority, "category": c.category, "status": c.status,
        "issue_summary": c.issue_summary,
        "due_date": c.due_date.isoformat() if c.due_date else None,
        "returned_on": c.returned_on.isoformat() if c.returned_on else None,
        "resolved_on": c.resolved_on.isoformat() if c.resolved_on else None,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "updated_at": c.updated_at.isoformat() if c.updated_at else None,
    }


def list_cases(db: Session, *, side="dghr", entity_id=None, tab="all", search=None, page=1, page_size=50) -> dict:
    q = db.query(m.Case)
    if entity_id is not None:
        q = q.filter(m.Case.entity_id == entity_id)
    if tab == "open":
        q = q.filter(m.Case.kind == "clarification", m.Case.status == "open")
    elif tab == "returned":
        q = q.filter(m.Case.kind == "return")
    elif tab == "resolved":
        q = q.filter(m.Case.status == "resolved")
    if search:
        like = f"%{search.lower()}%"
        q = q.filter(m.Case.ref.ilike(like) | m.Case.issue_summary.ilike(like))
    cases = q.order_by(m.Case.updated_at.desc()).all()
    if search is None:
        # keep a stable ordering that surfaces pinned refs
        cases = sorted(cases, key=lambda c: (c.status != "open", c.ref))

    def grp(kind, status):
        return [_case_summary(db, c) for c in cases if c.kind == kind and (status is None or c.status == status)]

    open_clarifications = [c for c in cases if c.kind == "clarification" and c.status == "open"]
    returns = [c for c in cases if c.kind == "return" and c.status == "open"]
    resolved = [c for c in cases if c.status == "resolved"]

    counts = {
        "all": len(cases),
        "open": len(open_clarifications),
        "returned": len(returns),
        "resolved": len(resolved),
    }
    return {
        "counts": counts,
        "groups": {
            "open_clarifications": [_case_summary(db, c) for c in open_clarifications],
            "returned_submissions": [_case_summary(db, c) for c in returns],
            "resolved": [_case_summary(db, c) for c in resolved[:20]],
        },
        "all": [_case_summary(db, c) for c in cases],
    }


def case_detail(db: Session, case_id: int) -> dict | None:
    c = db.get(m.Case, case_id)
    if not c:
        return None
    e = db.get(m.Entity, c.entity_id)
    users = {u.id: u for u in db.query(m.User).all()}
    msgs = db.query(m.CaseMessage).filter(m.CaseMessage.case_id == case_id).order_by(m.CaseMessage.created_at).all()
    audit = db.query(m.AuditEvent).filter(m.AuditEvent.case_id == case_id).order_by(m.AuditEvent.created_at).all()
    evidence = db.query(m.EvidenceDoc).filter(m.EvidenceDoc.entity_id == c.entity_id).limit(4).all()
    assigned = users.get(c.assigned_to)
    today = date.today()
    sla_days = (c.due_date - today).days if c.due_date else None
    return {
        **_case_summary(db, c),
        "assigned_to": assigned.name if assigned else None,
        "corrections": c.corrections or [],
        "sla_days": sla_days,
        "messages": [{
            "id": mm.id, "side": mm.side,
            "author": users[mm.author_id].name if mm.author_id and mm.author_id in users else ("DGHR Analyst" if mm.side == "dghr" else "Entity Contact"),
            "author_role": "DGHR Analyst" if mm.side == "dghr" else "Entity Contact",
            "body": mm.body, "created_at": mm.created_at.isoformat() if mm.created_at else None,
        } for mm in msgs],
        "audit": [{"label": a.label, "actor_name": a.actor_name,
                   "created_at": a.created_at.isoformat() if a.created_at else None} for a in audit],
        "evidence": [{"filename": ev.filename, "quality": ev.quality, "linked_label": ev.linked_label} for ev in evidence],
        "entity_name": e.name if e else "",
    }


def clarifications_kpis(db: Session, entity_id=None) -> dict:
    q = db.query(m.Case)
    if entity_id is not None:
        q = q.filter(m.Case.entity_id == entity_id)
    cases = q.all()
    open_clar = sum(1 for c in cases if c.kind == "clarification" and c.status == "open")
    returned = sum(1 for c in cases if c.kind == "return" and c.status == "open")
    resolved = sum(1 for c in cases if c.status == "resolved")
    today = date.today()
    overdue = sum(1 for c in cases if c.status in ("open", "responded") and c.due_date and c.due_date < today)

    # avg response time = mean(first entity reply − first dghr message) across cases with both
    deltas = []
    for c in cases:
        msgs = db.query(m.CaseMessage).filter(m.CaseMessage.case_id == c.id).order_by(m.CaseMessage.created_at).all()
        first_dghr = next((mm for mm in msgs if mm.side == "dghr"), None)
        first_entity = next((mm for mm in msgs if mm.side == "entity"), None)
        if first_dghr and first_entity and first_entity.created_at and first_dghr.created_at:
            d = (first_entity.created_at - first_dghr.created_at).total_seconds() / 86400
            if d >= 0:
                deltas.append(d)
    avg_response = round(sum(deltas) / len(deltas), 1) if deltas else 1.6

    return {
        "open_clarifications": open_clar,
        "returned_submissions": returned,
        "avg_response_time": avg_response,
        "overdue_responses": overdue,
        "resolved_items": resolved,
    }


# ─────────────────────────── mutations (§11) ───────────────────────────
def open_clarification(db: Session, *, entity_id: int, package_label: str, issue_summary: str,
                       corrections: list | None = None, priority="Medium", category="Data Quality",
                       actor="DGHR Analyst (Aisha Khan)") -> m.Case:
    aisha = db.query(m.User).filter(m.User.name == "Aisha Khan").first()
    ref = _next_ref(db, "CLF")
    c = m.Case(ref=ref, kind="clarification", entity_id=entity_id, package_label=package_label,
               priority=priority, category=category, status="open",
               assigned_to=aisha.id if aisha else None,
               due_date=date.fromordinal(date.today().toordinal() + 6),
               issue_summary=issue_summary, corrections=corrections or [])
    db.add(c)
    db.flush()
    db.add(m.CaseMessage(case_id=c.id, author_id=aisha.id if aisha else None, side="dghr", body=issue_summary))
    workflow.add_audit(db, label="Clarification created", actor_name="Aisha Khan", entity_id=entity_id, case_id=c.id)
    e = db.get(m.Entity, entity_id)
    workflow.notify(db, audience="entity", kind="clarification", entity_id=entity_id,
                    title="Clarification Requested", body=issue_summary)
    workflow.bump_last_updated(db)
    db.commit()
    return c


def return_submission(db: Session, *, entity_id: int, package_key: str, reason: str) -> m.Case:
    ep = _entity_package(db, entity_id, package_key)
    label = _package_label(db, package_key)
    if ep:
        ep.status = "returned"
        db.flush()
    ref = _next_ref(db, "RTN")
    aisha = db.query(m.User).filter(m.User.name == "Aisha Khan").first()
    c = m.Case(ref=ref, kind="return", entity_id=entity_id, package_label=f"{label}",
               priority="Medium", category=label, status="open",
               assigned_to=aisha.id if aisha else None,
               due_date=date.fromordinal(date.today().toordinal() + 3),
               issue_summary=reason, corrections=[], returned_on=date.today())
    db.add(c)
    db.flush()
    workflow.add_audit(db, label="Submission returned to entity", actor_name="Aisha Khan", entity_id=entity_id, case_id=c.id)
    recompute_rollup(db, entity_id)
    workflow.notify(db, audience="entity", kind="status", entity_id=entity_id,
                    title="Submission Returned", body=f"{label} was returned for correction: {reason}")
    workflow.bump_last_updated(db)
    db.commit()
    return c


def post_message(db: Session, *, case_id: int, side: str, body: str, author_id: int | None = None) -> dict:
    c = db.get(m.Case, case_id)
    db.add(m.CaseMessage(case_id=case_id, author_id=author_id, side=side, body=body))
    if side == "entity":
        c.status = "responded"
        workflow.add_audit(db, label="Entity responded", actor_name="Entity Contact", entity_id=c.entity_id, case_id=case_id)
        workflow.notify(db, audience="dghr", kind="clarification", entity_id=c.entity_id,
                        title=f"Response on {c.ref}", body=body)
    else:
        workflow.add_audit(db, label="DGHR follow-up", actor_name="Aisha Khan", entity_id=c.entity_id, case_id=case_id)
        workflow.notify(db, audience="entity", kind="clarification", entity_id=c.entity_id,
                        title=f"New message on {c.ref}", body=body)
    workflow.bump_last_updated(db)
    db.commit()
    return case_detail(db, case_id)


def case_action(db: Session, *, case_id: int, action: str, reviewer_id: int | None = None) -> dict:
    c = db.get(m.Case, case_id)
    if action == "resolve" or action == "accept_resubmission":
        c.status = "resolved"
        c.resolved_on = date.today()
        workflow.add_audit(db, label="Case resolved", actor_name="Aisha Khan", entity_id=c.entity_id, case_id=case_id)
        workflow.notify(db, audience="entity", kind="status", entity_id=c.entity_id,
                        title=f"{c.ref} resolved", body="Your submission has been accepted by DGHR.")
        if action == "accept_resubmission":
            ep = _entity_package(db, c.entity_id, _key_from_label(c.category))
            if ep:
                ep.status = "under_review"
                db.flush()
            recompute_rollup(db, c.entity_id)
    elif action == "escalate":
        c.priority = "High"
        workflow.add_audit(db, label="Case escalated to senior review", actor_name="Aisha Khan", entity_id=c.entity_id, case_id=case_id)
        workflow.notify(db, audience="entity", kind="status", entity_id=c.entity_id,
                        title=f"{c.ref} escalated", body="This case has been escalated to senior review.")
    elif action == "assign" and reviewer_id:
        c.assigned_to = reviewer_id
        workflow.add_audit(db, label="Reviewer assigned", actor_name="DGHR Admin", entity_id=c.entity_id, case_id=case_id)
    elif action == "request_evidence":
        db.add(m.CaseMessage(case_id=case_id, author_id=c.assigned_to, side="dghr",
                             body="Please provide additional supporting evidence for this submission."))
        workflow.add_audit(db, label="Requested more evidence", actor_name="Aisha Khan", entity_id=c.entity_id, case_id=case_id)
        workflow.notify(db, audience="entity", kind="clarification", entity_id=c.entity_id,
                        title=f"Evidence requested on {c.ref}", body="DGHR requested additional evidence.")
    elif action == "return_to_entity":
        c.status = "open"
        workflow.add_audit(db, label="Returned to entity for correction", actor_name="Aisha Khan", entity_id=c.entity_id, case_id=case_id)
        workflow.notify(db, audience="entity", kind="status", entity_id=c.entity_id,
                        title=f"{c.ref} returned", body="Please review and correct your submission.")
    workflow.bump_last_updated(db)
    db.commit()
    return case_detail(db, case_id)


def entity_acknowledge(db: Session, *, case_id: int) -> dict:
    c = db.get(m.Case, case_id)
    workflow.add_audit(db, label="Entity acknowledged", actor_name="Entity Contact", entity_id=c.entity_id, case_id=case_id)
    workflow.bump_last_updated(db)
    db.commit()
    return case_detail(db, case_id)


def entity_resubmit(db: Session, *, case_id: int) -> dict:
    c = db.get(m.Case, case_id)
    ep = _entity_package(db, c.entity_id, _key_from_label(c.category))
    if ep:
        ep.status = "submitted"
        ep.progress = max(ep.progress, 100)
        db.flush()
    c.status = "responded"
    recompute_rollup(db, c.entity_id)
    workflow.add_audit(db, label="Entity resubmitted package", actor_name="Entity Contact", entity_id=c.entity_id, case_id=case_id)
    workflow.notify(db, audience="dghr", kind="status", entity_id=c.entity_id,
                    title=f"{c.ref} resubmitted", body=f"{_entity_name(db, c.entity_id)} resubmitted the returned package.")
    workflow.bump_last_updated(db)
    db.commit()
    return case_detail(db, case_id)


# ─────────────────────────── package submit / draft ───────────────────────────
def submit_package(db: Session, *, entity_id: int, package_key: str) -> dict:
    ep = _entity_package(db, entity_id, package_key)
    label = _package_label(db, package_key)
    if not ep:
        return {"ok": False, "error": "package not applicable"}
    ep.status = "submitted"
    ep.progress = 100
    db.flush()
    roll = recompute_rollup(db, entity_id)
    workflow.add_audit(db, label=f"{label} submitted", actor_name="Entity Contact", entity_id=entity_id)
    workflow.notify(db, audience="dghr", kind="status", entity_id=entity_id,
                    title=f"{_entity_name(db, entity_id)} submitted {label}",
                    body=f"{_entity_name(db, entity_id)} submitted {label}.")
    workflow.bump_last_updated(db)
    db.commit()
    return {"ok": True, "package": label, "package_status": ep.status, "entity_status": roll}


def save_draft(db: Session, *, entity_id: int, package_key: str, progress: int | None = None) -> dict:
    ep = _entity_package(db, entity_id, package_key)
    if ep and progress is not None:
        ep.progress = progress
        if ep.status == "not_started" and progress > 0:
            ep.status = "in_progress"
    recompute_rollup(db, entity_id)
    workflow.bump_last_updated(db)
    db.commit()
    return {"ok": True}


# ─────────────────────────── DGHR bulk workflow actions ───────────────────────────
def remind(db: Session, entity_ids: list[int]) -> dict:
    for eid in entity_ids:
        workflow.notify(db, audience="entity", kind="reminder", entity_id=eid,
                        title="Reminder from DGHR", body="Please complete and submit your outstanding data packages.")
        workflow.add_audit(db, label="Reminder sent", actor_name="DGHR Admin", entity_id=eid)
    workflow.bump_last_updated(db)
    db.commit()
    return {"ok": True, "reminded": len(entity_ids)}


def approve(db: Session, entity_ids: list[int] | None = None, ready: bool = False) -> dict:
    if ready:
        entities = [e for e in db.query(m.Entity).all()
                    if e.completeness >= 80 and (e.quality_score or 0) >= 75 and e.status in ("submitted", "under_review")]
    else:
        entities = [db.get(m.Entity, eid) for eid in (entity_ids or [])]
    n = 0
    for e in entities:
        if not e:
            continue
        for ep in db.query(m.EntityPackage).filter(m.EntityPackage.entity_id == e.id, m.EntityPackage.applicable.is_(True)).all():
            if ep.status in ("submitted", "under_review"):
                ep.status = "approved"
        e.status = "approved"
        e.overdue = False
        e.forecasting_ready = True
        workflow.add_audit(db, label="Entity approved by DGHR", actor_name="DGHR Admin", entity_id=e.id)
        workflow.notify(db, audience="entity", kind="status", entity_id=e.id,
                        title="Approved by DGHR", body="Your submission has been approved.")
        n += 1
    workflow.bump_last_updated(db)
    db.commit()
    return {"ok": True, "approved": n}


def bulk_review(db: Session, entity_ids: list[int]) -> dict:
    n = 0
    for eid in entity_ids:
        for ep in db.query(m.EntityPackage).filter(m.EntityPackage.entity_id == eid, m.EntityPackage.applicable.is_(True)).all():
            if ep.status == "submitted":
                ep.status = "under_review"
                n += 1
        recompute_rollup(db, eid)
        workflow.add_audit(db, label="Moved to review", actor_name="DGHR Admin", entity_id=eid)
    workflow.bump_last_updated(db)
    db.commit()
    return {"ok": True, "reviewed": len(entity_ids)}


# ─────────────────────────── helpers ───────────────────────────
def _entity_package(db: Session, entity_id: int, package_key: str):
    return (
        db.query(m.EntityPackage).join(m.DataPackage).filter(
            m.EntityPackage.entity_id == entity_id, m.DataPackage.key == package_key
        ).first()
    )


def _package_label(db: Session, package_key: str) -> str:
    p = db.query(m.DataPackage).filter(m.DataPackage.key == package_key).first()
    return p.name if p else package_key


def _entity_name(db: Session, entity_id: int) -> str:
    e = db.get(m.Entity, entity_id)
    return e.name if e else ""


_LABEL_TO_KEY = {
    "Organization Structure": "org_structure", "Current Workforce": "current_workforce",
    "Workload & Service Data": "workload_service", "Future Demand Drivers": "future_drivers",
    "Evidence & Documents": "evidence_documents", "Org Structure": "org_structure",
    "Workforce Data": "current_workforce",
}


def _key_from_label(label: str) -> str:
    return _LABEL_TO_KEY.get(label, "current_workforce")

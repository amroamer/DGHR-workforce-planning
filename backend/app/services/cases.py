"""Cases + governance workflow (SPEC §5, §8, §11). The closed cross-portal loop.

Every mutation flows through here → state change + audit_events + notification to the
opposite audience + last-updated bump (via services.workflow)."""

from __future__ import annotations

from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

from app import models as m
from app.services import workflow, revisions, calc_config

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


# ─────────────────────── submission-review clarifications bridge ───────────────────────
# DGHR raises element-level clarifications during submission review (model SubmissionClarification,
# via services/review + planning router). Those are a SECOND clarification channel and used to live
# ONLY inside the submission stepper, so a clarification sent from review never appeared in the
# entity's Case-backed "Clarifications & Requests from DGHR" inbox — it looked like it never arrived.
# We surface them here read-side under a disjoint synthetic id range. SubmissionClarification stays
# the single source of truth (no duplicate rows, no migration); detail/reply/action for a synthetic
# id route straight back to the thread.
SUBCLAR_ID_BASE = 1_000_000_000

# SubmissionClarification.status → Case-inbox status the frontend already renders.
_SUBCLAR_STATUS = {"open": "open", "answered": "responded", "resolved": "resolved"}


def _subclar_sla(db: Session) -> tuple[float, float]:
    cfg = calc_config.config(db)
    return (cfg.num("clarification.sla_days", 5.0), cfg.num("clarification.escalate_after_days", 10.0))


def _submission_clarification_roots(db: Session, *, entity_id=None):
    """Root DGHR submission-review clarifications (side='dghr', no parent), each joined to its
    department + entity (submission → department → entity). Optionally scoped to one entity."""
    q = (db.query(m.SubmissionClarification, m.Department, m.Entity)
         .join(m.DepartmentSubmission, m.SubmissionClarification.submission_id == m.DepartmentSubmission.id)
         .join(m.Department, m.DepartmentSubmission.department_id == m.Department.id)
         .join(m.Entity, m.Department.entity_id == m.Entity.id)
         .filter(m.SubmissionClarification.side == "dghr",
                 m.SubmissionClarification.parent_id.is_(None)))
    if entity_id is not None:
        q = q.filter(m.Department.entity_id == entity_id)
    return q.order_by(m.SubmissionClarification.created_at.desc()).all()


def _subclar_summary(db: Session, clar, dept, ent, sla_days: float, escalate_after: float) -> dict:
    age = revisions.clarification_age(clar, sla_days=sla_days, escalate_after=escalate_after)
    priority = ("High" if age["level"] == "escalated"
                else "Medium" if age["level"] in ("overdue", "due_soon") else "Low")
    due = (clar.created_at.date() + timedelta(days=int(sla_days))) if clar.created_at else None
    return {
        "id": SUBCLAR_ID_BASE + clar.id,
        "ref": f"CLR-S{clar.id:05d}",
        "kind": "clarification",
        "entity_id": dept.entity_id,
        "entity": ent.name if ent else "",
        "package_label": f"{dept.name} · {clar.element_label or clar.element_type}",
        "priority": priority,
        "category": "Submission review",
        "status": _SUBCLAR_STATUS.get(clar.status, "open"),
        "issue_summary": clar.message,
        "due_date": due.isoformat() if due else None,
        "returned_on": None,
        "resolved_on": clar.resolved_at.date().isoformat() if clar.resolved_at else None,
        "created_at": clar.created_at.isoformat() if clar.created_at else None,
        "updated_at": clar.created_at.isoformat() if clar.created_at else None,
    }


def _subclar_summaries(db: Session, *, entity_id=None, tab="all", search=None) -> list[dict]:
    sla_days, escalate_after = _subclar_sla(db)
    out = [_subclar_summary(db, clar, dept, ent, sla_days, escalate_after)
           for clar, dept, ent in _submission_clarification_roots(db, entity_id=entity_id)]
    if tab == "open":
        out = [s for s in out if s["status"] == "open"]
    elif tab == "returned":
        out = []                       # element clarifications are never package "returns"
    elif tab == "resolved":
        out = [s for s in out if s["status"] == "resolved"]
    if search:
        like = search.lower()
        out = [s for s in out if like in s["ref"].lower() or like in (s["issue_summary"] or "").lower()]
    return out


def _subclar_detail(db: Session, clar_id: int) -> dict | None:
    root = db.get(m.SubmissionClarification, clar_id)
    if not root or root.parent_id is not None:
        return None
    sub = db.get(m.DepartmentSubmission, root.submission_id)
    dept = db.get(m.Department, sub.department_id) if sub else None
    ent = db.get(m.Entity, dept.entity_id) if dept else None
    sla_days, escalate_after = _subclar_sla(db)
    summary = _subclar_summary(db, root, dept, ent, sla_days, escalate_after)
    thread = [root] + (db.query(m.SubmissionClarification)
                       .filter(m.SubmissionClarification.parent_id == root.id)
                       .order_by(m.SubmissionClarification.created_at, m.SubmissionClarification.id).all())
    age = revisions.clarification_age(root, sla_days=sla_days, escalate_after=escalate_after)
    audit = (db.query(m.AuditEvent).filter(m.AuditEvent.submission_id == root.submission_id)
             .order_by(m.AuditEvent.created_at).all())
    return {
        **summary,
        "assigned_to": None,
        "corrections": [],
        "sla_days": int(round(sla_days - age["days_open"])),
        "messages": [{
            "id": t.id, "side": t.side,
            "author": t.author or ("DGHR Analyst" if t.side == "dghr" else "Entity Contact"),
            "author_role": "DGHR Analyst" if t.side == "dghr" else "Entity Contact",
            "body": t.message, "created_at": t.created_at.isoformat() if t.created_at else None,
        } for t in thread],
        "audit": [{"label": a.label, "actor_name": a.actor_name,
                   "created_at": a.created_at.isoformat() if a.created_at else None} for a in audit],
        "evidence": [],
        "entity_name": ent.name if ent else "",
    }


def _subclar_post_message(db: Session, *, clar_id: int, side: str, body: str) -> dict | None:
    """A reply typed in the inbox routes to the SAME thread the submission stepper uses, so both
    surfaces stay one conversation and the opposite portal is notified."""
    root = db.get(m.SubmissionClarification, clar_id)
    if not root:
        return None
    sub = db.get(m.DepartmentSubmission, root.submission_id)
    dept = db.get(m.Department, sub.department_id) if sub else None
    eid = dept.entity_id if dept else None
    dname = dept.name if dept else "Submission"
    db.add(m.SubmissionClarification(
        submission_id=root.submission_id, element_type=root.element_type, element_id=root.element_id,
        element_key=root.element_key, element_label=root.element_label, message=body,
        author=("Entity Contact" if side == "entity" else "DGHR Analyst"),
        side=side, status="answered" if side == "entity" else "open", parent_id=root.id))
    if side == "entity":
        root.status = "answered"
        workflow.add_audit(db, label=f"Entity answered clarification on {dname}", actor_name="Entity Contact",
                           entity_id=eid, submission_id=root.submission_id, verb="clarified")
        workflow.notify(db, audience="dghr", kind="clarification", entity_id=eid,
                        title=f"{dname}: clarification answered", body=body)
    else:
        root.status = "open"
        workflow.notify(db, audience="entity", kind="clarification", entity_id=eid,
                        title=f"{dname}: clarification updated", body=body)
    workflow.bump_last_updated(db)
    db.commit()
    return _subclar_detail(db, clar_id)


def _subclar_action(db: Session, *, clar_id: int, action: str) -> dict | None:
    root = db.get(m.SubmissionClarification, clar_id)
    if not root:
        return None
    if action in ("resolve", "accept_resubmission"):
        root.status = "resolved"
        root.resolved_at = datetime.utcnow()
    elif action == "return_to_entity":
        root.status = "open"
    # escalate / assign / request_evidence have no element-level equivalent — left as no-ops.
    workflow.bump_last_updated(db)
    db.commit()
    return _subclar_detail(db, clar_id)


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

    open_clarifications = [_case_summary(db, c) for c in cases if c.kind == "clarification" and c.status == "open"]
    returns = [_case_summary(db, c) for c in cases if c.kind == "return" and c.status == "open"]
    resolved = [_case_summary(db, c) for c in cases if c.status == "resolved"]
    all_rows = [_case_summary(db, c) for c in cases]

    # Merge in DGHR submission-review clarifications so the inbox honestly reflects every clarification
    # DGHR sent, not just the package-level Case ones.
    subclars = _subclar_summaries(db, entity_id=entity_id, tab=tab, search=search)
    open_clarifications += [s for s in subclars if s["status"] == "open"]
    resolved += [s for s in subclars if s["status"] == "resolved"]
    all_rows += subclars

    counts = {
        "all": len(all_rows),
        "open": len(open_clarifications),
        "returned": len(returns),
        "resolved": len(resolved),
    }
    return {
        "counts": counts,
        "groups": {
            "open_clarifications": open_clarifications,
            "returned_submissions": returns,
            "resolved": resolved[:20],
        },
        "all": all_rows,
    }


def case_detail(db: Session, case_id: int) -> dict | None:
    if case_id >= SUBCLAR_ID_BASE:
        return _subclar_detail(db, case_id - SUBCLAR_ID_BASE)
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

    # Fold in DGHR submission-review clarifications so the KPI tiles match the merged inbox list.
    sla_days, escalate_after = _subclar_sla(db)
    for clar, _dept, _ent in _submission_clarification_roots(db, entity_id=entity_id):
        if clar.status == "open":
            open_clar += 1
            if revisions.clarification_age(clar, sla_days=sla_days, escalate_after=escalate_after)["level"] in ("overdue", "escalated"):
                overdue += 1
        elif clar.status == "resolved":
            resolved += 1

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
                       actor="DGHR Analyst (Aisha Khan)", origin: str = "dghr") -> m.Case:
    """Open a clarification case. origin='dghr' (default) is DGHR asking the entity;
    origin='entity' is the entity raising a query to DGHR."""
    aisha = db.query(m.User).filter(m.User.name == "Aisha Khan").first()
    ref = _next_ref(db, "CLF")
    c = m.Case(ref=ref, kind="clarification", entity_id=entity_id, package_label=package_label,
               priority=priority, category=category, status="open",
               assigned_to=aisha.id if aisha else None,
               due_date=date.fromordinal(date.today().toordinal() + 6),
               issue_summary=issue_summary, corrections=corrections or [])
    db.add(c)
    db.flush()
    e = db.get(m.Entity, entity_id)
    if origin == "entity":
        db.add(m.CaseMessage(case_id=c.id, author_id=None, side="entity", body=issue_summary))
        workflow.add_audit(db, label="Entity raised a query", actor_name=e.name if e else "Entity", entity_id=entity_id, case_id=c.id)
        workflow.notify(db, audience="dghr", kind="clarification", entity_id=entity_id,
                        title="Entity Query Raised", body=f"{e.name if e else 'An entity'}: {issue_summary}")
    else:
        db.add(m.CaseMessage(case_id=c.id, author_id=aisha.id if aisha else None, side="dghr", body=issue_summary))
        workflow.add_audit(db, label="Clarification created", actor_name="Aisha Khan", entity_id=entity_id, case_id=c.id)
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
    if case_id >= SUBCLAR_ID_BASE:
        return _subclar_post_message(db, clar_id=case_id - SUBCLAR_ID_BASE, side=side, body=body)
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
    if case_id >= SUBCLAR_ID_BASE:
        return _subclar_action(db, clar_id=case_id - SUBCLAR_ID_BASE, action=action)
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
    if case_id >= SUBCLAR_ID_BASE:                     # ack is a no-op for element threads
        return _subclar_detail(db, case_id - SUBCLAR_ID_BASE)
    c = db.get(m.Case, case_id)
    workflow.add_audit(db, label="Entity acknowledged", actor_name="Entity Contact", entity_id=c.entity_id, case_id=case_id)
    workflow.bump_last_updated(db)
    db.commit()
    return case_detail(db, case_id)


def entity_resubmit(db: Session, *, case_id: int) -> dict:
    if case_id >= SUBCLAR_ID_BASE:                     # element threads have no package to resubmit
        return _subclar_detail(db, case_id - SUBCLAR_ID_BASE)
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


def escalate(db: Session, entity_ids: list[int]) -> dict:
    """Escalate outstanding submissions: bump any open cases to High priority + notify entity + audit."""
    n = 0
    for eid in entity_ids:
        e = db.get(m.Entity, eid)
        if not e:
            continue
        for c in db.query(m.Case).filter(m.Case.entity_id == eid, m.Case.status != "resolved").all():
            c.priority = "High"
        workflow.add_audit(db, label="Escalated to senior review", actor_name="DGHR Admin", entity_id=eid)
        workflow.notify(db, audience="entity", kind="status", entity_id=eid,
                        title="Escalated to Senior Review",
                        body="Your outstanding submission has been escalated by DGHR.")
        n += 1
    workflow.bump_last_updated(db)
    db.commit()
    return {"ok": True, "escalated": n}


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
    reviewed = 0  # entities that had at least one submitted package moved to review
    skipped = 0   # entities with nothing eligible
    for eid in entity_ids:
        moved = 0
        for ep in db.query(m.EntityPackage).filter(m.EntityPackage.entity_id == eid, m.EntityPackage.applicable.is_(True)).all():
            if ep.status == "submitted":
                ep.status = "under_review"
                moved += 1
        if moved:
            reviewed += 1
            recompute_rollup(db, eid)
            workflow.add_audit(db, label="Moved to review", actor_name="DGHR Admin", entity_id=eid)
        else:
            skipped += 1
    workflow.bump_last_updated(db)
    db.commit()
    return {"ok": True, "reviewed": reviewed, "skipped": skipped}


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

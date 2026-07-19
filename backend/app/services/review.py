"""Review: what a submission is made of, who signed what, and the rule that two people must.

Three ideas live here.

1. REVIEWABLE ELEMENTS. A submission isn't one lump — it's drivers, statutory floors, a workforce
   profile, a supply chain, a note. Clarifications already addressed those individually; decisions
   now do too, using the same stable `element_key`. So a reviewer can sign off the four parts they
   are happy with and query the fifth, and the entity's revision only has to answer the fifth.

2. PARTIAL APPROVAL IS NOT APPROVAL. A submission may only be recommended once EVERY element is
   signed off. A part-approved submission is honestly still in review and never reaches a total.
   (Not to be confused with the entity roll-up's `partially_approved` in services/sizing.py — that
   word describes an entity as a container of departments. Different axis, deliberately.)

3. MAKER-CHECKER. The Cycle screen has always advertised "Reviewer → Approver → DGHR". It was a
   display-only string. This makes it real: one person recommends, a DIFFERENT person signs off, and
   the engine refuses if they are the same. That refusal is the entire control — without it the
   second signature is decoration.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app import models as m
from app.services import calc_config, revisions

DGHR_ROLES = ("dghr_admin", "dghr_reviewer")


def reviewers(db: Session) -> list[m.User]:
    """The people who may review or sign off. Maker-checker needs at least two to mean anything."""
    return (db.query(m.User).filter(m.User.role.in_(DGHR_ROLES))
            .order_by(m.User.name).all())


def resolve_actor(db: Session, actor_id: int | None, actor_name: str) -> m.User | None:
    """A decision must be attributable to a REAL person, not a typed string.

    The override endpoint resolves a free-typed name and silently accepts `None` when it matches
    nobody — which is how `actor_name` ends up holding an unverified string. A signature can't work
    that way: if we can't identify the signer we can't enforce that the next one differs.
    """
    if actor_id is not None:
        return db.get(m.User, actor_id)
    name = (actor_name or "").strip()
    return db.query(m.User).filter(m.User.name == name).first() if name else None


# ── reviewable elements of a submission ──
def elements(db: Session, sub: m.DepartmentSubmission) -> list[dict]:
    """Every part of this version a reviewer must have an opinion about, in reading order."""
    out: list[dict] = []
    for d in (db.query(m.SubmissionDriver)
              .filter(m.SubmissionDriver.submission_id == sub.id)
              .order_by(m.SubmissionDriver.position, m.SubmissionDriver.id).all()):
        out.append({"element_type": "driver", "element_key": d.element_key or m.element_key(d.name),
                    "element_label": d.name, "element_id": d.id})
    for f in db.query(m.MandateFloor).filter(m.MandateFloor.submission_id == sub.id).all():
        out.append({"element_type": "mandate", "element_key": f.element_key or m.element_key(f.role),
                    "element_label": f.role, "element_id": f.id})
    if db.query(m.SubmissionWorkforceRow).filter(
            m.SubmissionWorkforceRow.submission_id == sub.id).count():
        out.append({"element_type": "profile", "element_key": "profile",
                    "element_label": "Workforce profile", "element_id": None})
    if db.query(m.WorkforceAdjustment).filter(
            m.WorkforceAdjustment.submission_id == sub.id).count():
        out.append({"element_type": "supply", "element_key": "supply",
                    "element_label": "Supply reconciliation", "element_id": None})
    return out


def latest_decisions(db: Session, sub: m.DepartmentSubmission) -> dict[str, m.SubmissionElementDecision]:
    """The verdict in force per element — append-only, so the newest row on a key wins and the
    earlier ones stay as history."""
    rows = (db.query(m.SubmissionElementDecision)
            .filter(m.SubmissionElementDecision.submission_id == sub.id)
            .order_by(m.SubmissionElementDecision.id).all())
    return {f"{r.element_type}:{r.element_key}": r for r in rows}   # later rows overwrite


def review_state(db: Session, sub: m.DepartmentSubmission) -> dict:
    """Where this version stands, element by element — and therefore whether it can be signed off."""
    els = elements(db, sub)
    latest = latest_decisions(db, sub)
    rows = []
    for e in els:
        d = latest.get(f"{e['element_type']}:{e['element_key']}")
        rows.append({**e,
                     "decision": d.decision if d else None,
                     "note": d.note if d else "",
                     "actor": d.actor_name if d else "",
                     "decided_at": d.created_at.isoformat() if d and d.created_at else None})
    approved = [r for r in rows if r["decision"] == "approved"]
    queried = [r for r in rows if r["decision"] == "queried"]
    undecided = [r for r in rows if r["decision"] is None]
    return {
        "elements": rows,
        "total": len(rows), "approved": len(approved),
        "queried": len(queried), "undecided": len(undecided),
        # The gate. Everything must be signed off — a part-approved submission is still in review.
        "all_approved": bool(rows) and not queried and not undecided,
        "partial": bool(approved) and bool(queried or undecided),
    }


def sla(db: Session) -> tuple[float, float]:
    """Clarification SLA, read from the DB-held engine config like every other constant here —
    a threshold hardcoded in Python can't be versioned, attributed or shown to anyone."""
    cfg = calc_config.config(db)
    return (cfg.num("clarification.sla_days", 5.0),
            cfg.num("clarification.escalate_after_days", 10.0))


def clarification_rows(db: Session, sub: m.DepartmentSubmission) -> list[dict]:
    """This version's clarification threads, each carrying its own age and escalation level."""
    sla_days, escalate_after = sla(db)
    out = []
    for c in (db.query(m.SubmissionClarification)
              .filter(m.SubmissionClarification.submission_id == sub.id)
              .order_by(m.SubmissionClarification.created_at, m.SubmissionClarification.id).all()):
        age = revisions.clarification_age(c, sla_days=sla_days, escalate_after=escalate_after)
        out.append({
            "id": c.id, "element_type": c.element_type, "element_id": c.element_id,
            "element_key": c.element_key, "element_label": c.element_label,
            "message": c.message, "author": c.author, "side": c.side, "status": c.status,
            "parent_id": c.parent_id,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "resolved_at": c.resolved_at.isoformat() if c.resolved_at else None,
            "resolved_by_name": c.resolved_by_name or "",
            **age,
        })
    return out

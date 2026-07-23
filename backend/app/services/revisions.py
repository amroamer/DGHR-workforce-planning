"""What changed between two versions, and the story of how a submission got here.

Two reads of the same append-only version chain:

  diff(a, b)     field by field — what the entity actually altered when it revised
  history(dept)  the timeline — every version, decision, question and override, in order

Both are DERIVED at read time. Nothing is stored, because a stored diff is one that can disagree with
the rows it claims to describe — the same reason services/trace.py refuses to cache a calculation.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app import models as m
from app.services import versioning

# Driver fields worth diffing, and how to say them.
_DRIVER_FIELDS = [("volume", "Volume"), ("forecast", "Forecast"), ("family", "Family"), ("unit", "Unit")]
_MANDATE_FIELDS = [("positions", "Positions"), ("legal_basis", "Legal basis")]
_WORKFORCE_FIELDS = [("headcount", "Headcount"), ("fte", "FTE"), ("emirati_count", "Emirati")]
_ADJUSTMENT_FIELDS = [("kind", "Type"), ("fte", "FTE"), ("headcount", "People"),
                      ("counts_in_supply", "Counts in supply"), ("starts_on", "Start"), ("ends_on", "End")]


def _num(v) -> object:
    """Normalise for comparison: Numeric columns come back as Decimal, which never equals a float."""
    if isinstance(v, bool) or v is None:
        return v
    if isinstance(v, (int, float)):
        return round(float(v), 4)
    try:
        return round(float(v), 4)
    except (TypeError, ValueError):
        return v


def _fmt(v) -> str:
    if v is None or v == "":
        return "-"
    if isinstance(v, bool):
        return "yes" if v else "no"
    n = _num(v)
    if isinstance(n, float):
        return str(int(n)) if n == int(n) else str(n)
    return str(v)


def _changes(label: str, kind: str, a, b, fields: list[tuple[str, str]]) -> list[dict]:
    out = []
    for attr, field_label in fields:
        va, vb = _num(getattr(a, attr, None)), _num(getattr(b, attr, None))
        if va != vb:
            out.append({"kind": kind, "element": label, "field": field_label,
                        "change": "changed", "before": _fmt(getattr(a, attr, None)),
                        "after": _fmt(getattr(b, attr, None))})
    return out


def _by_key(rows, keyfn) -> dict:
    return {keyfn(r): r for r in rows}


def diff(db: Session, a: m.DepartmentSubmission, b: m.DepartmentSubmission) -> dict:
    """Every difference between version `a` and version `b`, addressed by STABLE element key.

    Keyed by element_key rather than row id on purpose: b's rows are copies with fresh ids, so an id
    comparison would report every single row as removed-and-re-added and tell the reviewer nothing.
    """
    rows: list[dict] = []

    if (a.notes or "") != (b.notes or ""):
        rows.append({"kind": "notes", "element": "Notes", "field": "Note",
                     "change": "changed", "before": a.notes or "-", "after": b.notes or "-"})

    def q(model, sub_id):
        return db.query(model).filter(model.submission_id == sub_id).all()

    # ── drivers ──
    da = _by_key(q(m.SubmissionDriver, a.id), lambda d: d.element_key or m.element_key(d.name))
    dbb = _by_key(q(m.SubmissionDriver, b.id), lambda d: d.element_key or m.element_key(d.name))
    for k in sorted(set(da) | set(dbb)):
        if k not in dbb:
            rows.append({"kind": "driver", "element": da[k].name, "field": "Driver",
                         "change": "removed", "before": _fmt(da[k].volume), "after": "-"})
        elif k not in da:
            rows.append({"kind": "driver", "element": dbb[k].name, "field": "Driver",
                         "change": "added", "before": "-", "after": _fmt(dbb[k].volume)})
        else:
            rows += _changes(dbb[k].name, "driver", da[k], dbb[k], _DRIVER_FIELDS)
            pa, pb = da[k].params or {}, dbb[k].params or {}
            for pk in sorted(set(pa) | set(pb)):
                if _num(pa.get(pk)) != _num(pb.get(pk)):
                    rows.append({"kind": "driver", "element": dbb[k].name,
                                 "field": pk.replace("_", " ").capitalize(), "change": "changed",
                                 "before": _fmt(pa.get(pk)), "after": _fmt(pb.get(pk))})

    # ── mandate floors ──
    fa = _by_key(q(m.MandateFloor, a.id), lambda f: f.element_key or m.element_key(f.role))
    fb = _by_key(q(m.MandateFloor, b.id), lambda f: f.element_key or m.element_key(f.role))
    for k in sorted(set(fa) | set(fb)):
        if k not in fb:
            rows.append({"kind": "mandate", "element": fa[k].role, "field": "Statutory floor",
                         "change": "removed", "before": _fmt(fa[k].positions), "after": "-"})
        elif k not in fa:
            rows.append({"kind": "mandate", "element": fb[k].role, "field": "Statutory floor",
                         "change": "added", "before": "-", "after": _fmt(fb[k].positions)})
        else:
            rows += _changes(fb[k].role, "mandate", fa[k], fb[k], _MANDATE_FIELDS)

    # ── workforce profile (one row per job level — keyed by level) ──
    wa = _by_key(q(m.SubmissionWorkforceRow, a.id), lambda w: w.job_level)
    wb = _by_key(q(m.SubmissionWorkforceRow, b.id), lambda w: w.job_level)
    for k in sorted(set(wa) & set(wb)):
        rows += _changes(k.replace("_", " ").capitalize(), "profile", wa[k], wb[k], _WORKFORCE_FIELDS)

    # ── workforce adjustments ──
    aa = _by_key(q(m.WorkforceAdjustment, a.id), lambda x: m.element_key(x.label or x.kind))
    ab = _by_key(q(m.WorkforceAdjustment, b.id), lambda x: m.element_key(x.label or x.kind))
    for k in sorted(set(aa) | set(ab)):
        if k not in ab:
            rows.append({"kind": "supply", "element": aa[k].label or aa[k].kind, "field": "Adjustment",
                         "change": "removed", "before": _fmt(aa[k].fte), "after": "-"})
        elif k not in aa:
            rows.append({"kind": "supply", "element": ab[k].label or ab[k].kind, "field": "Adjustment",
                         "change": "added", "before": "-", "after": _fmt(ab[k].fte)})
        else:
            rows += _changes(ab[k].label or ab[k].kind, "supply", aa[k], ab[k], _ADJUSTMENT_FIELDS)

    return {
        "from_version": a.version, "to_version": b.version,
        "from_submission_id": a.id, "to_submission_id": b.id,
        "changes": rows, "total": len(rows),
        "unchanged": not rows,
    }


def diff_with_previous(db: Session, sub: m.DepartmentSubmission) -> dict | None:
    """This version against the one it revised. None for v1 — nothing to compare against."""
    if not sub.supersedes_id:
        return None
    prev = db.get(m.DepartmentSubmission, sub.supersedes_id)
    return diff(db, prev, sub) if prev else None


# ═══════════════════════ history ═══════════════════════
def _iso(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


def _person(name: str | None) -> str:
    return (name or "").strip() or "not recorded"


def history(db: Session, department_id: int) -> dict:
    """The full change history of a department's submission, across every version.

    Assembled from the rows that already exist — versions, decisions, clarifications, overrides — so
    it can never drift from them. Newest first.
    """
    subs = versioning.versions(db, department_id)
    events: list[dict] = []

    for s in subs:
        events.append({
            "at": _iso(s.created_at), "verb": "created", "version": s.version,
            "actor": _person(s.submitted_by_name),
            "title": f"v{s.version} created" + (f" (revision of v{s.version - 1})" if s.supersedes_id else " (first draft)"),
            "detail": "",
        })
        if s.submitted_at:
            events.append({"at": _iso(s.submitted_at), "verb": "submitted", "version": s.version,
                           "actor": _person(s.submitted_by_name),
                           "title": f"v{s.version} submitted to DGHR", "detail": s.notes or ""})
        if s.recommended_at:
            events.append({"at": _iso(s.recommended_at), "verb": "recommended", "version": s.version,
                           "actor": _person(s.recommended_by_name),
                           "title": f"v{s.version} recommended for {s.recommendation or 'decision'}",
                           "detail": s.recommendation_note or ""})
        if s.decided_at:
            events.append({"at": _iso(s.decided_at), "verb": s.status, "version": s.version,
                           "actor": _person(s.decided_by_name),
                           "title": f"v{s.version} {s.status}",
                           "detail": s.decision_note or ""})

        for c in (db.query(m.SubmissionClarification)
                  .filter(m.SubmissionClarification.submission_id == s.id).all()):
            events.append({
                "at": _iso(c.created_at), "verb": "clarification", "version": s.version,
                "actor": _person(c.author),
                "title": f"{'Question raised' if c.side == 'dghr' else 'Entity replied'}: {c.element_label or c.element_type}",
                "detail": c.message or "",
            })

        for d in (db.query(m.SubmissionElementDecision)
                  .filter(m.SubmissionElementDecision.submission_id == s.id).all()):
            events.append({
                "at": _iso(d.created_at), "verb": f"element_{d.decision}", "version": s.version,
                "actor": _person(d.actor_name),
                "title": f"{d.element_label or d.element_key} {d.decision}",
                "detail": d.note or "",
            })

        driver_ids = [x.id for x in db.query(m.SubmissionDriver)
                      .filter(m.SubmissionDriver.submission_id == s.id).all()]
        if driver_ids:
            for o in (db.query(m.CalcOverride)
                      .filter(m.CalcOverride.scope == "driver",
                              m.CalcOverride.ref_id.in_(driver_ids)).all()):
                events.append({
                    "at": _iso(o.created_at), "verb": "override", "version": s.version,
                    "actor": _person(o.actor_name),
                    "title": f"Calculated {float(o.calculated_value):g} overridden to {float(o.override_value):g}"
                             + ("" if o.active else " (withdrawn)"),
                    "detail": o.reason or "",
                })

    events.sort(key=lambda e: (e["at"] or "", e["verb"]), reverse=True)
    return {
        "department_id": department_id,
        "versions": [{
            "id": s.id, "version": s.version, "status": s.status,
            "supersedes_id": s.supersedes_id,
            "created_at": _iso(s.created_at), "submitted_at": _iso(s.submitted_at),
            "decided_at": _iso(s.decided_at),
            "submitted_by": s.submitted_by_name or "", "decided_by": s.decided_by_name or "",
            "recommended_by": s.recommended_by_name or "",
            "conditions": list(s.conditions or []),
        } for s in subs],
        "events": events,
        "total": len(events),
    }


# ═══════════════════════ clarification aging ═══════════════════════
# Derived, never stored — exactly as SPEC.md:109 rules for entity overdue ("a flag, not a status").
# There is no scheduler in this codebase and nothing time-driven anywhere; storing an "overdue" bool
# would mean a value that is only correct until the clock moves.
LEVELS = ("open", "due_soon", "overdue", "escalated")


def clarification_age(c: m.SubmissionClarification, *, sla_days: float, escalate_after: float,
                      now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    created = c.created_at
    if created is not None and created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    days = ((now - created).total_seconds() / 86400.0) if created else 0.0
    days = round(days, 1)

    if c.status != "open":
        level = "open"          # answered/resolved threads don't age
    elif days >= escalate_after:
        level = "escalated"
    elif days >= sla_days:
        level = "overdue"
    elif days >= sla_days * 0.6:
        level = "due_soon"
    else:
        level = "open"
    return {"days_open": days, "level": level,
            "days_over": round(max(0.0, days - sla_days), 1),
            "sla_days": sla_days, "escalate_after": escalate_after}

"""Workforce supply — the one place that defines what each supply word means.

Current FTE and headcount used to be the same number: headcount was BUILT by rounding a department's
FTE, so a part-timer could not exist, a vacancy could not exist, and "two staff seconded to the
digital programme until March" could only be prose. Three distinct concepts were collapsed into one
column. This module separates them and derives everything else, so no two screens can disagree.

Three axes, and what belongs to each:

  ESTABLISHMENT — posts, authorised on paper
      approved_positions   Department.approved_positions
      filled_positions     Σ workforce row headcount   (a post is filled by one person)
      vacancies            approved − filled           DERIVED, never stored

  PEOPLE — who is actually there
      headcount            Σ workforce row headcount   bodies (= filled positions)
      establishment_fte    Σ workforce row fte         time; ≤ headcount when part-timers exist

  NON-ESTABLISHMENT CAPACITY — everything that isn't your own filled establishment
      adjustments          WorkforceAdjustment rows: secondments in/out, contractors,
                           temporary resources, outsourced capacity

And the figure planning actually needs:

      available_fte = establishment_fte + Σ (sign(kind) × fte)  over adjustments counting in supply

`available_fte` — NOT the raw establishment — is what the gap measures against, because a department
that has lent two people away does not have their time to deploy. Only `counts_in_supply` decides
inclusion: it is the entity's own declaration, and the engine never overrides it. Where that
declaration looks stale (capacity counted after its window closed) we FLAG it rather than silently
correct it — a silent correction would be the platform overruling an entity without telling anyone.
"""
from __future__ import annotations

from datetime import date

from sqlalchemy.orm import Session

from app import models as m

KINDS = m.ADJUSTMENT_KINDS
SIGN = m.ADJUSTMENT_SIGN
KIND_LABEL = m.ADJUSTMENT_LABEL


def _rows(db: Session, submission_id: int) -> list[m.SubmissionWorkforceRow]:
    return (db.query(m.SubmissionWorkforceRow)
            .filter(m.SubmissionWorkforceRow.submission_id == submission_id)
            .order_by(m.SubmissionWorkforceRow.position, m.SubmissionWorkforceRow.id).all())


def adjustments(db: Session, submission_id: int) -> list[m.WorkforceAdjustment]:
    return (db.query(m.WorkforceAdjustment)
            .filter(m.WorkforceAdjustment.submission_id == submission_id)
            .order_by(m.WorkforceAdjustment.position, m.WorkforceAdjustment.id).all())


def _active(a: m.WorkforceAdjustment, today: date) -> bool:
    """Is today inside the adjustment's window? Open-ended dates mean 'no bound stated'."""
    if a.starts_on and today < a.starts_on:
        return False
    if a.ends_on and today > a.ends_on:
        return False
    return True


def adjustment_row(a: m.WorkforceAdjustment, today: date, dept_names: dict[int, str]) -> dict:
    fte = float(a.fte or 0)
    return {
        "id": a.id, "kind": a.kind, "label": a.label or KIND_LABEL.get(a.kind, a.kind),
        "kind_label": KIND_LABEL.get(a.kind, a.kind),
        "fte": fte,
        # What this does to supply: negative for a loan out, positive for capacity in, and exactly
        # zero when the entity says it should not count. The UI never re-derives this sign.
        "signed_fte": fte * SIGN.get(a.kind, 1) if a.counts_in_supply else 0.0,
        "headcount": int(a.headcount or 0),
        "starts_on": a.starts_on.isoformat() if a.starts_on else None,
        "ends_on": a.ends_on.isoformat() if a.ends_on else None,
        "source_department_id": a.source_department_id,
        "source_department": dept_names.get(a.source_department_id or -1),
        "receiving_department_id": a.receiving_department_id,
        "receiving_department": dept_names.get(a.receiving_department_id or -1),
        "counts_in_supply": bool(a.counts_in_supply),
        "active": _active(a, today),
        "note": a.note or "",
    }


def submission_supply(db: Session, submission: m.DepartmentSubmission, *, today: date | None = None) -> dict:
    """The full establishment → people → adjustments → available chain for one department."""
    today = today or date.today()
    dept = db.get(m.Department, submission.department_id)
    rows = _rows(db, submission.id)
    adjs = adjustments(db, submission.id)

    dept_names = {}
    ids = [i for a in adjs for i in (a.source_department_id, a.receiving_department_id) if i]
    if ids:
        dept_names = {d.id: d.name for d in db.query(m.Department).filter(m.Department.id.in_(ids)).all()}

    filled = sum(int(r.headcount or 0) for r in rows)
    establishment_fte = round(sum(float(r.fte or 0) for r in rows), 2)
    approved = int(dept.approved_positions or 0) if dept else 0

    adj_rows = [adjustment_row(a, today, dept_names) for a in adjs]
    net_adjustment = round(sum(a["signed_fte"] for a in adj_rows), 2)
    available = round(establishment_fte + net_adjustment, 2)

    by_kind = []
    for k in KINDS:
        mine = [a for a in adj_rows if a["kind"] == k]
        if mine:
            by_kind.append({
                "kind": k, "label": KIND_LABEL[k], "count": len(mine),
                "fte": round(sum(a["fte"] for a in mine), 2),
                "signed_fte": round(sum(a["signed_fte"] for a in mine), 2),
                "headcount": sum(a["headcount"] for a in mine),
            })

    flags: list[str] = []
    if approved and filled > approved:
        flags.append("Filled positions exceed the approved establishment")
    if any(r for r in rows if float(r.fte or 0) > int(r.headcount or 0)):
        flags.append("A job level reports more FTE than people")
    # Surfaced, never silently corrected — see the module docstring.
    stale = [a for a in adj_rows if a["counts_in_supply"] and not a["active"]]
    if stale:
        flags.append(f"{len(stale)} adjustment(s) counted in supply are outside their stated dates")

    return {
        # establishment
        "approved_positions": approved,
        "filled_positions": filled,
        "vacancies": approved - filled,
        "vacancy_pct": round((approved - filled) / approved * 100, 1) if approved else 0.0,
        # people
        "headcount": filled,
        "establishment_fte": establishment_fte,
        # part-time shows up exactly here: bodies minus their time
        "part_time_fte_gap": round(filled - establishment_fte, 2),
        # non-establishment capacity
        "adjustments": adj_rows,
        "by_kind": by_kind,
        "net_adjustment_fte": net_adjustment,
        # what planning measures against
        "available_fte": available,
        "flags": flags,
        "has_data": filled > 0 or establishment_fte > 0,
    }


def available_fte(db: Session, submission: m.DepartmentSubmission, *, today: date | None = None) -> float:
    """Supply for the gap. Falls back to the department's establishment FTE when a submission has no
    workforce profile yet — a department that hasn't filled in its people is not a department with
    zero people, and reporting 0 supply would invent a shortfall the size of its whole demand."""
    s = submission_supply(db, submission, today=today)
    if not s["has_data"]:
        dept = db.get(m.Department, submission.department_id)
        return round(float(dept.current_fte or 0) if dept else 0.0, 2)
    return s["available_fte"]


def _empty(approved: int = 0, establishment_fte: float = 0.0) -> dict:
    return {
        "approved_positions": approved, "filled_positions": 0, "vacancies": approved,
        "vacancy_pct": 100.0 if approved else 0.0,
        "headcount": 0, "establishment_fte": establishment_fte, "part_time_fte_gap": 0.0,
        "adjustments": [], "by_kind": [], "net_adjustment_fte": 0.0,
        "available_fte": establishment_fte, "flags": [], "has_data": False,
    }


def _sum_supply(parts: list[dict]) -> dict:
    """Roll several departments' supply into one.

    Returns the SAME shape as submission_supply — including `adjustments` and `flags`. A roll-up that
    silently drops keys its own consumers expect is a crash waiting for the first caller who trusts
    the contract, so the two shapes are kept deliberately identical rather than nearly so.
    """
    out = {
        "approved_positions": sum(p["approved_positions"] for p in parts),
        "filled_positions": sum(p["filled_positions"] for p in parts),
        "headcount": sum(p["headcount"] for p in parts),
        "establishment_fte": round(sum(p["establishment_fte"] for p in parts), 2),
        "net_adjustment_fte": round(sum(p["net_adjustment_fte"] for p in parts), 2),
        "available_fte": round(sum(p["available_fte"] for p in parts), 2),
        "departments_counted": len(parts),
        "adjustments": [a for p in parts for a in p["adjustments"]],
        # Deduped and counted: "3 departments count an adjustment outside its dates" is one finding
        # to act on, not three identical lines to scroll past.
        "flags": sorted({f for p in parts for f in p["flags"]}),
    }
    out["vacancies"] = out["approved_positions"] - out["filled_positions"]
    out["vacancy_pct"] = (round(out["vacancies"] / out["approved_positions"] * 100, 1)
                          if out["approved_positions"] else 0.0)
    out["part_time_fte_gap"] = round(out["filled_positions"] - out["establishment_fte"], 2)

    merged: dict[str, dict] = {}
    for p in parts:
        for b in p["by_kind"]:
            t = merged.setdefault(b["kind"], {"kind": b["kind"], "label": b["label"], "count": 0,
                                              "fte": 0.0, "signed_fte": 0.0, "headcount": 0})
            t["count"] += b["count"]
            t["fte"] = round(t["fte"] + b["fte"], 2)
            t["signed_fte"] = round(t["signed_fte"] + b["signed_fte"], 2)
            t["headcount"] += b["headcount"]
    out["by_kind"] = [merged[k] for k in KINDS if k in merged]
    out["has_data"] = out["filled_positions"] > 0 or out["establishment_fte"] > 0
    return out

"""Cycle resolution + lifecycle.

The planning module used to assume a single CollectionCycle — every read was
`db.query(CollectionCycle).first()`. With cycles now created ad hoc and tracked over time, two things
change: a read must say WHICH cycle it means, and "the cycle that's live" has to be *resolved*, not
guessed from row order (with more than one row, `.first()` returns whichever the DB yields first —
usually the oldest, i.e. exactly the wrong one). This module is that single answer.
"""
from __future__ import annotations

import re
from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

from app import models as m
from app.services import workflow

DRAFT, OPEN, CLOSED, ARCHIVED = "draft", "open", "closed", "archived"
STATUSES = (DRAFT, OPEN, CLOSED, ARCHIVED)


def open_cycle(db: Session) -> m.CollectionCycle | None:
    """The one cycle entities can submit into right now — at most one (enforced in `open_cycle_by_id`)."""
    return (db.query(m.CollectionCycle).filter(m.CollectionCycle.status == OPEN)
            .order_by(m.CollectionCycle.id.desc()).first())


def latest_cycle(db: Session) -> m.CollectionCycle | None:
    # Chronological, not by id: a historical cycle can be seeded AFTER the current one (higher id)
    # yet be an earlier year, so "the most recent cycle" is the one with the latest planned start.
    return db.query(m.CollectionCycle).order_by(
        m.CollectionCycle.starts_on.desc(), m.CollectionCycle.id.desc()).first()


def current_cycle(db: Session) -> m.CollectionCycle | None:
    """The cycle the app defaults to: the live one, else the most recent. This is the drop-in for
    every old `.first()` read — those all meant 'the cycle', which now means 'the current cycle'."""
    return open_cycle(db) or latest_cycle(db)


def base_year(db: Session) -> int:
    c = current_cycle(db)
    return c.starts_on.year if c and c.starts_on else 2026


# ─────────────────────────── scope ───────────────────────────
def entities_in_scope(db: Session, cycle: m.CollectionCycle | None) -> set[int] | None:
    """The entity ids a cycle targets, or None meaning 'every entity' (scope_mode='all')."""
    if cycle is None or cycle.scope_mode != "selected":
        return None
    return {r.entity_id for r in db.query(m.CycleEntityScope)
            .filter(m.CycleEntityScope.cycle_id == cycle.id).all()}


def is_in_scope(db: Session, cycle: m.CollectionCycle | None, entity_id: int) -> bool:
    ids = entities_in_scope(db, cycle)
    return ids is None or entity_id in ids


def can_submit(db: Session, entity_id: int) -> tuple[bool, str]:
    """Whether an entity may edit/submit right now: there must be an OPEN cycle that includes it.
    Returns (ok, reason). The reason is user-facing — it's what the entity is told when blocked."""
    c = open_cycle(db)
    if c is None:
        return False, "No collection cycle is open. You'll be able to submit once DGHR opens the next cycle."
    if not is_in_scope(db, c, entity_id):
        return False, f"Your entity isn't part of the current cycle ({c.name}). No action is needed right now."
    return True, ""


def submission_window(db: Session, entity_id: int) -> dict:
    """The entity-facing view of "can I act?" — carried on the departments and submission payloads so
    the UI can lock itself and say why, in sync with the server that will actually refuse the write."""
    c = open_cycle(db)
    in_scope = is_in_scope(db, c, entity_id) if c else False
    ok, reason = can_submit(db, entity_id)
    ext = (db.query(m.CycleExtension).filter(
        m.CycleExtension.cycle_id == c.id, m.CycleExtension.entity_id == entity_id).first()
        if c else None)
    edl = entity_deadline(db, c, entity_id)
    return {
        "can_submit": ok,
        "cycle_open": c is not None,
        "in_scope": in_scope,
        "reason": reason,
        "cycle": cycle_dict(db, c),
        # the deadline this entity is actually held to, and whether it's an extension
        "entity_deadline": edl.isoformat() if edl else None,
        "extended": ext is not None,
        "extension_reason": ext.reason if ext else "",
    }


def set_scope(db: Session, cycle: m.CollectionCycle, mode: str, entity_ids: list[int] | None) -> None:
    """Replace a cycle's scope. 'all' clears the rows; 'selected' rewrites them to `entity_ids`."""
    cycle.scope_mode = "selected" if mode == "selected" else "all"
    db.query(m.CycleEntityScope).filter(m.CycleEntityScope.cycle_id == cycle.id).delete()
    if cycle.scope_mode == "selected":
        for eid in dict.fromkeys(entity_ids or []):   # dedupe, preserve order
            db.add(m.CycleEntityScope(cycle_id=cycle.id, entity_id=eid))


# ─────────────────────────── lifecycle ───────────────────────────
# ─────────────────────────── outcome + snapshots ───────────────────────────
def cycle_outcome(db: Session, cycle: m.CollectionCycle) -> dict:
    """A cycle's outcome computed LIVE from the submissions that belong to it — how many of its
    in-scope departments arrived / were approved, the average approval turnaround, and which entities
    hadn't fully submitted. The open cycle reads this directly; a closed cycle reads its frozen
    snapshot of the same shape (see resolved_outcome)."""
    scope_ids = entities_in_scope(db, cycle)
    dq = db.query(m.Department)
    if scope_ids is not None:
        dq = dq.filter(m.Department.entity_id.in_(scope_ids or [0]))
    dept_entity = {d.id: d.entity_id for d in dq.all()}
    dept_ids = set(dept_entity)

    rec_d, app_d, turnarounds = set(), set(), []
    for s in db.query(m.DepartmentSubmission).filter(m.DepartmentSubmission.cycle_id == cycle.id).all():
        if s.department_id not in dept_ids:
            continue
        if s.status in m.RECEIVED_STATUSES:
            rec_d.add(s.department_id)
        if s.status == "approved":
            app_d.add(s.department_id)
        if s.submitted_at and s.decided_at:
            turnarounds.append((s.decided_at - s.submitted_at).total_seconds() / 86400.0)

    per_ent_total, per_ent_rec = {}, {}
    for did, eid in dept_entity.items():
        per_ent_total[eid] = per_ent_total.get(eid, 0) + 1
    for did in rec_d:
        per_ent_rec[dept_entity[did]] = per_ent_rec.get(dept_entity[did], 0) + 1
    codes = {e.id: e.code for e in db.query(m.Entity).all()}
    late = sorted(codes[eid] for eid, tot in per_ent_total.items()
                  if per_ent_rec.get(eid, 0) < tot and eid in codes)
    return {
        "departments_total": len(dept_ids), "received": len(rec_d), "approved": len(app_d),
        "avg_turnaround_days": round(sum(turnarounds) / len(turnarounds), 1) if turnarounds else 0.0,
        "late_entity_codes": late,
    }


def write_snapshot(db: Session, cycle: m.CollectionCycle) -> m.CycleSnapshot:
    """Freeze the cycle's current outcome as its snapshot (upsert). Called on close."""
    o = cycle_outcome(db, cycle)
    snap = db.query(m.CycleSnapshot).filter(m.CycleSnapshot.cycle_id == cycle.id).first()
    if snap is None:
        snap = m.CycleSnapshot(cycle_id=cycle.id)
        db.add(snap)
    snap.departments_total = o["departments_total"]
    snap.received = o["received"]
    snap.approved = o["approved"]
    snap.avg_turnaround_days = o["avg_turnaround_days"]
    snap.late_entity_codes = o["late_entity_codes"]
    snap.captured_at = datetime.utcnow()
    return snap


def clear_snapshot(db: Session, cycle: m.CollectionCycle) -> None:
    """Reopening a cycle makes it live again — its 'what happened at close' record no longer holds."""
    db.query(m.CycleSnapshot).filter(m.CycleSnapshot.cycle_id == cycle.id).delete()


def resolved_outcome(db: Session, cycle: m.CollectionCycle) -> dict:
    """The outcome to show for a cycle: the frozen snapshot for a closed/archived cycle (its numbers
    are true only as of close), otherwise a live computation."""
    if cycle.status in (CLOSED, ARCHIVED):
        snap = db.query(m.CycleSnapshot).filter(m.CycleSnapshot.cycle_id == cycle.id).first()
        if snap:
            return {
                "departments_total": snap.departments_total, "received": snap.received,
                "approved": snap.approved, "avg_turnaround_days": float(snap.avg_turnaround_days or 0),
                "late_entity_codes": list(snap.late_entity_codes or []),
            }
    return cycle_outcome(db, cycle)


def _do_close(db: Session, cycle: m.CollectionCycle, *, by: str) -> None:
    cycle.status = CLOSED
    cycle.closed_at = datetime.utcnow()
    cycle.closed_by = by
    write_snapshot(db, cycle)   # freeze the outcome the moment the window shuts
    workflow.add_audit(db, label=f"Cycle '{cycle.name}' closed by {by}", actor_name=by)
    workflow.notify(db, audience="entity", kind="announcement", title="Collection cycle closed",
                    body=f"The {cycle.name} submission window is now closed.")


def sweep_auto_close(db: Session) -> int:
    """Lazy auto-close: the stack has no scheduler, so "the deadline closes the cycle" is evaluated
    whenever the clock is looked at (the notifications poll and the cycle screen). Closes every open
    cycle past its EFFECTIVE deadline (the later of the cycle deadline and any live extension) when
    auto_close is on. Idempotent; returns how many closed."""
    today = date.today()
    closed = 0
    for c in db.query(m.CollectionCycle).filter(m.CollectionCycle.status == OPEN).all():
        cutoff = max_effective_deadline(db, c)
        if c.auto_close and cutoff and today > cutoff:
            _do_close(db, c, by="System (deadline)")
            closed += 1
    if closed:
        workflow.bump_last_updated(db)
        db.commit()
    return closed


# ─────────────────────────── deadline extensions ───────────────────────────
def max_effective_deadline(db: Session, cycle: m.CollectionCycle) -> date | None:
    """The latest deadline in force — the cycle's, or a later per-entity extension. Auto-close waits
    for this so an extension actually buys time rather than being overrun by the cycle deadline."""
    base = cycle.deadline
    latest = db.query(m.CycleExtension).filter(m.CycleExtension.cycle_id == cycle.id).all()
    if latest:
        top = max(e.extended_deadline for e in latest)
        if base is None or top > base:
            return top
    return base


def entity_deadline(db: Session, cycle: m.CollectionCycle | None, entity_id: int) -> date | None:
    """The deadline THIS entity is actually held to — its own extension if later than the cycle's."""
    if cycle is None:
        return None
    ext = db.query(m.CycleExtension).filter(
        m.CycleExtension.cycle_id == cycle.id, m.CycleExtension.entity_id == entity_id).first()
    if ext and (cycle.deadline is None or ext.extended_deadline > cycle.deadline):
        return ext.extended_deadline
    return cycle.deadline


# ─────────────────────────── reminder engine ───────────────────────────
def reminder_milestones(cycle: m.CollectionCycle) -> list[int]:
    """The days-before-deadline the cycle's reminders_label declares (e.g. '7, 3, 1 days before due
    date' → [7, 3, 1]). The label is already config; this is what finally makes it *do* something."""
    nums = sorted({int(x) for x in re.findall(r"\d+", cycle.reminders_label or "")}, reverse=True)
    return nums or [7, 3, 1]


def outstanding_entity_ids(db: Session, cycle: m.CollectionCycle) -> list[int]:
    """In-scope entities that still have a department without a received submission in this cycle."""
    scope_ids = entities_in_scope(db, cycle)
    dq = db.query(m.Department)
    if scope_ids is not None:
        dq = dq.filter(m.Department.entity_id.in_(scope_ids or [0]))
    dept_entity = {d.id: d.entity_id for d in dq.all()}
    tot, rec = {}, {}
    for eid in dept_entity.values():
        tot[eid] = tot.get(eid, 0) + 1
    for s in db.query(m.DepartmentSubmission).filter(m.DepartmentSubmission.cycle_id == cycle.id).all():
        if s.department_id in dept_entity and s.status in m.RECEIVED_STATUSES:
            rec[dept_entity[s.department_id]] = rec.get(dept_entity[s.department_id], 0) + 1
    return [eid for eid, t in tot.items() if rec.get(eid, 0) < t]


def sweep_reminders(db: Session) -> int:
    """Fire the 7/3/1-day auto-reminders the cycle config promises — lazily, like auto-close. Sends
    the most urgent milestone we've entered but not yet sent, to the entities still outstanding, and
    logs it so it fires ONCE per threshold rather than on every poll. Returns entities chased."""
    c = open_cycle(db)
    if c is None or not c.deadline:
        return 0
    days_left = (c.deadline - date.today()).days
    already = {r.milestone for r in db.query(m.CycleReminder).filter(m.CycleReminder.cycle_id == c.id).all()}
    due = [mst for mst in reminder_milestones(c) if days_left <= mst and mst not in already]
    if not due:
        return 0
    milestone = max(due)   # one per sweep — the largest threshold we've crossed but not yet sent
    outstanding = outstanding_entity_ids(db, c)
    label = "the deadline has arrived" if milestone == 0 else \
            f"{milestone} day{'s' if milestone != 1 else ''} to the deadline"
    for eid in outstanding:
        workflow.notify(db, audience="entity", kind="reminder", entity_id=eid,
                        title=f"Reminder — {label}",
                        body=f"The {c.name} deadline is {c.deadline.isoformat()}. "
                             "Please complete your outstanding submissions.")
    db.add(m.CycleReminder(cycle_id=c.id, milestone=milestone,
                           reminded=len(outstanding), sent_at=datetime.utcnow()))
    workflow.add_audit(db, actor_name="System (reminders)",
                       label=f"Auto-reminder ({milestone}-day) sent to {len(outstanding)} "
                             f"entit{'y' if len(outstanding) == 1 else 'ies'} for '{c.name}'")
    workflow.bump_last_updated(db)
    db.commit()
    return len(outstanding)


# ─────────────────────────── clone ───────────────────────────
def clone_cycle(db: Session, src: m.CollectionCycle, actor_name: str = "DGHR Admin") -> m.CollectionCycle:
    """Spin up the next cycle from an existing one — its window shifted a year on, its scope, policies
    and reminder schedule copied — as a DRAFT to review and open. Cycles recur near-identically; this
    is the biggest single time-saver."""
    def shift(d: date | None) -> date | None:
        return d + timedelta(days=365) if d else d

    name = re.sub(r"(19|20)\d{2}", lambda mo: str(int(mo.group()) + 1), src.name, count=1)
    if name == src.name:
        name = f"{src.name} (copy)"
    c = m.CollectionCycle(
        name=name, starts_on=shift(src.starts_on), ends_on=shift(src.ends_on),
        deadline=shift(src.deadline), status=DRAFT, auto_close=src.auto_close,
        scope_mode=src.scope_mode, version_label=src.version_label, late_policy=src.late_policy,
        reviewer_rule=src.reviewer_rule, reminders_label=src.reminders_label,
        approval_workflow_label=src.approval_workflow_label)
    db.add(c)
    db.flush()
    if src.scope_mode == "selected":
        for eid in entities_in_scope(db, src) or []:
            db.add(m.CycleEntityScope(cycle_id=c.id, entity_id=eid))
    workflow.add_audit(db, actor_name=actor_name,
                       label=f"Cycle '{c.name}' created as a clone of '{src.name}'")
    return c


# ─────────────────────────── serialization ───────────────────────────
def cycle_dict(db: Session, cycle: m.CollectionCycle | None) -> dict | None:
    """One serialization of a cycle for every surface that lists or shows one."""
    if cycle is None:
        return None
    scope_ids = entities_in_scope(db, cycle)
    return {
        "id": cycle.id, "name": cycle.name,
        "starts_on": cycle.starts_on.isoformat() if cycle.starts_on else None,
        "ends_on": cycle.ends_on.isoformat() if cycle.ends_on else None,
        "deadline": cycle.deadline.isoformat() if cycle.deadline else None,
        "status": cycle.status,
        "auto_close": bool(cycle.auto_close),
        "reminders_label": cycle.reminders_label or "",
        "scope_mode": cycle.scope_mode,
        "scope_entity_ids": sorted(scope_ids) if scope_ids is not None else None,
        "opened_at": cycle.opened_at.isoformat() if cycle.opened_at else None,
        "opened_by": cycle.opened_by or "",
        "closed_at": cycle.closed_at.isoformat() if cycle.closed_at else None,
        "closed_by": cycle.closed_by or "",
    }

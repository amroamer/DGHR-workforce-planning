"""Submission versions — append-only, and the rules about what may still be edited.

A submitted record used to be freely editable. `save_submission` blocked only status 'submitted', so
an APPROVED submission could be rewritten in place: it stayed approved, kept its "Approved — sizing
consistent with the method" note, kept feeding the Official government position, and its decided_at
went on pointing at a decision taken against numbers that no longer existed. A record you can quietly
edit is not a record.

So: `draft` is the ONLY editable state. Anything that has left the entity's hands is frozen, and
changing it means creating the NEXT VERSION — a copy — leaving the original exactly as it was said.

    v1  submitted → approved            frozen forever, the signed-off record
    v2  copy of v1, draft → submitted   the revision
    v3  …

Which version answers which question:

    current_version(dept)   the newest row — what the entity is working on
    active_submission(dept) the newest RECEIVED row — what the government position counts
    approved_submission()   the newest APPROVED row — still the approved record while v2 is in flight

That last one matters: if v1 is approved and the entity opens v2 to revise, the department has not
stopped having an approved position. v1 is still it, until v2 is approved in its turn.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app import models as m

# Re-exported so callers have one place to ask "can this be edited?" rather than each re-deciding.
EDITABLE = m.EDITABLE_STATUSES
RECEIVED = m.RECEIVED_STATUSES


def versions(db: Session, department_id: int) -> list[m.DepartmentSubmission]:
    """Every version of a department's submission, oldest first."""
    return (db.query(m.DepartmentSubmission)
            .filter(m.DepartmentSubmission.department_id == department_id)
            .order_by(m.DepartmentSubmission.version, m.DepartmentSubmission.id).all())


def current_version(db: Session, department_id: int) -> m.DepartmentSubmission | None:
    """The newest version — what the entity is working on, draft or not."""
    return (db.query(m.DepartmentSubmission)
            .filter(m.DepartmentSubmission.department_id == department_id)
            .order_by(m.DepartmentSubmission.version.desc(), m.DepartmentSubmission.id.desc())
            .first())


def approved_submission(db: Session, department_id: int) -> m.DepartmentSubmission | None:
    """The newest APPROVED version. Survives a revision in flight: opening v2 does not un-approve v1."""
    return (db.query(m.DepartmentSubmission)
            .filter(m.DepartmentSubmission.department_id == department_id,
                    m.DepartmentSubmission.status == "approved")
            .order_by(m.DepartmentSubmission.version.desc(), m.DepartmentSubmission.id.desc())
            .first())


def superseded_by(db: Session, sub: m.DepartmentSubmission) -> m.DepartmentSubmission | None:
    return (db.query(m.DepartmentSubmission)
            .filter(m.DepartmentSubmission.supersedes_id == sub.id).first())


def is_editable(db: Session, sub: m.DepartmentSubmission) -> bool:
    """Draft, and not already replaced by a later version."""
    return sub.status in EDITABLE and superseded_by(db, sub) is None


def why_frozen(db: Session, sub: m.DepartmentSubmission) -> str:
    """The reason, in the words a user needs — an error that just says 'forbidden' teaches nothing."""
    later = superseded_by(db, sub)
    if later:
        return (f"v{sub.version} has been replaced by v{later.version}. "
                f"Open v{later.version} to make changes.")
    if sub.status == "submitted":
        return "This version is with DGHR for review. Revise it to create a new version."
    if sub.status == "recommended":
        return "This version has been recommended for approval and is awaiting sign-off. Revise it to create a new version."
    if sub.status == "in_clarification":
        return "This version is the record of what was submitted. Revise it to answer the clarification in a new version."
    if sub.status == "approved":
        return (f"v{sub.version} is approved and cannot be changed — it is the record DGHR signed off. "
                f"Revise it to propose a new version.")
    if sub.status == "rejected":
        return "This version was rejected and is kept as the record. Revise it to create a new version."
    return "This version cannot be edited."


def next_version_number(db: Session, department_id: int) -> int:
    cur = current_version(db, department_id)
    return (cur.version + 1) if cur else 1


def revise(db: Session, sub: m.DepartmentSubmission, *, actor_name: str = "") -> m.DepartmentSubmission:
    """Create the next version as a COPY of `sub`, leaving `sub` untouched.

    Everything that made up the submission is copied — drivers, mandate floors, workforce rows,
    adjustments — because a version has to be readable on its own years later. Copying by value is
    the whole point: if v2 pointed back at v1's rows, editing v2 would change v1, which is the bug
    this exists to end.

    Clarifications are NOT copied: a thread belongs to the version it was raised against. It reaches
    v2 through `element_key`, which is why that key has to be stable.
    """
    if superseded_by(db, sub):
        raise ValueError(f"v{sub.version} already has a successor.")

    new = m.DepartmentSubmission(
        department_id=sub.department_id, cycle_id=sub.cycle_id, status="draft",
        notes=sub.notes,
        version=next_version_number(db, sub.department_id),
        supersedes_id=sub.id,
    )
    db.add(new)
    db.flush()

    for d in (db.query(m.SubmissionDriver)
              .filter(m.SubmissionDriver.submission_id == sub.id)
              .order_by(m.SubmissionDriver.position, m.SubmissionDriver.id).all()):
        db.add(m.SubmissionDriver(
            submission_id=new.id, element_key=d.element_key or m.element_key(d.name),
            name=d.name, unit=d.unit, family=d.family, volume=d.volume, forecast=d.forecast,
            params=dict(d.params or {}), position=d.position,
            source=d.source, entered_by_id=d.entered_by_id,
            entered_by_name=d.entered_by_name, entered_at=d.entered_at))

    for f in db.query(m.MandateFloor).filter(m.MandateFloor.submission_id == sub.id).all():
        db.add(m.MandateFloor(
            submission_id=new.id, element_key=f.element_key or m.element_key(f.role),
            role=f.role, legal_basis=f.legal_basis, positions=f.positions))

    for w in (db.query(m.SubmissionWorkforceRow)
              .filter(m.SubmissionWorkforceRow.submission_id == sub.id)
              .order_by(m.SubmissionWorkforceRow.position).all()):
        db.add(m.SubmissionWorkforceRow(
            submission_id=new.id, job_level=w.job_level, headcount=w.headcount, fte=w.fte,
            emirati_count=w.emirati_count, annual_cost_aed=w.annual_cost_aed, position=w.position))

    # Demographic bands copy by value too, or the HC Overview donuts would empty out on a revision.
    for b in (db.query(m.SubmissionWorkforceBand)
              .filter(m.SubmissionWorkforceBand.submission_id == sub.id)
              .order_by(m.SubmissionWorkforceBand.position).all()):
        db.add(m.SubmissionWorkforceBand(
            submission_id=new.id, dimension=b.dimension, bucket=b.bucket, label=b.label,
            headcount=b.headcount, position=b.position))

    for a in (db.query(m.WorkforceAdjustment)
              .filter(m.WorkforceAdjustment.submission_id == sub.id)
              .order_by(m.WorkforceAdjustment.position).all()):
        db.add(m.WorkforceAdjustment(
            submission_id=new.id, kind=a.kind, label=a.label, fte=a.fte, headcount=a.headcount,
            starts_on=a.starts_on, ends_on=a.ends_on,
            source_department_id=a.source_department_id,
            receiving_department_id=a.receiving_department_id,
            counts_in_supply=a.counts_in_supply, note=a.note, position=a.position))

    db.flush()
    return new


def open_for_edit(db: Session, department_id: int) -> tuple[m.DepartmentSubmission, bool]:
    """The version an entity should be editing, creating a revision if the current one is frozen.
    Returns (submission, created_new_version)."""
    cur = current_version(db, department_id)
    if cur is None:
        return None, False
    if is_editable(db, cur):
        return cur, False
    return revise(db, cur), True

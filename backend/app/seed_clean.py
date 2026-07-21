"""Clean seed for the Planning department + sizing model.

Wipes ALL tables and seeds ONLY structure: a cycle, a DGHR user, the 10 typesets, and the Dubai
entities with their departments. It fabricates NO dashboard numbers, submissions, or metrics — every
figure on the dashboards comes from what entities actually submit through the app.
"""
from __future__ import annotations

import sys
from datetime import date, datetime, timedelta

from sqlalchemy import text
from sqlalchemy.orm import Session

from app import models as m
from app.calc_seed import METHOD_EFFECTIVE_FROM, seed_calc_config
from app.config import settings
from app.db import Base, SessionLocal, engine
from app.planning_seed import TYPESETS, ENTITIES, category_for, logo_url_for
from app.services import cycles, review, versioning
from app.market_seed import seed_market_reference
from app.services.human_capital import (build_workforce_bands, build_workforce_rows, build_position_rows,
                                         level_weights_for, director_share_for)

# Entity workforce-planning contacts — the named people who enter driver volumes. Attribution is
# half of a trace ("who entered this?"), so these are seeded rather than left blank.
_CONTACTS = [
    ("Sara Al Mansoori", "SM"), ("Ahmed Al Suwaidi", "AS"), ("Fatima Al Balushi", "FB"),
    ("Omar Al Marri", "OM"), ("Noura Al Hashimi", "NH"), ("Khalid Al Zaabi", "KZ"),
    ("Mariam Al Falasi", "MF"), ("Yousef Al Rayes", "YR"),
]

# DGHR reviewers. Maker-checker needs at least two real people or the second signature is
# decoration — the engine refuses an approval signed by whoever recommended it, and that refusal is
# only testable if there is somebody else to sign.
_REVIEWERS = [
    ("Hessa Al Suwaidi", "HS"), ("Rashid Al Nuaimi", "RN"), ("Latifa Al Marzooqi", "LM"),
]

# ── realistic submissions ────────────────────────────────────────────────────
# We do NOT hardcode KPIs. We seed realistic *inputs* (driver volumes) by solving each
# family's formula backwards from a plausible target FTE, then let services/sizing.py
# compute every required-FTE, gap, family split and roll-up for real.
_WEIGHTS = {1: [1.0], 2: [0.70, 0.30], 3: [0.55, 0.30, 0.15], 4: [0.40, 0.30, 0.20, 0.10]}
# deterministic spread of shortfalls/surpluses so gaps look like real life
_FACTORS = [1.12, 0.94, 1.06, 0.88, 1.18, 0.97, 1.02, 1.09, 0.91, 1.15, 0.85, 1.04]

# ── where each entity sits on the roll-up ladder ─────────────────────────────
# Seeded DELIBERATELY, per entity. The previous seed picked a status from a GLOBAL department
# counter (`_STATUSES[i % 12]` with `if i % 11 == 10: skip`), which sprayed outstanding departments
# across every entity — so all 12 came out "Partially submitted", no entity was ever complete, and
# the "Complete entities only" view had nothing it could honestly count.
#
# Keyed by entity CODE, not list position, so reordering ENTITIES can't silently re-label an entity.
#   received = departments that arrive (submitted / in_clarification / approved); None = all of them
#   approved = how many of those DGHR has signed off;                             None = all of them
#   None     = the entity never started — no submission rows at all
# Between them these cover ALL SIX rungs of sizing.ROLLUP_LADDER. A status the seed never produces
# is a status nobody has ever seen render, so every rung the UI can show exists in the data.
_ENTITY_PLAN: dict[str, tuple[int | None, int | None] | None] = {
    # code       received   approved        resulting roll-up status
    "DHA":      (None,      None),        # fully approved
    "RTA":      (None,      4),           # partially approved
    "DXBC":     (None,      3),           # partially approved
    "DLD":      (None,      2),           # partially approved
    "DP":       (None,      0),           # fully submitted, awaiting sign-off
    "GDRFA":    (None,      0),           # fully submitted, awaiting sign-off
    "DET":      (None,      0),           # fully submitted, awaiting sign-off
    "DM":       (5,         1),           # partially submitted — the reported case: 5 of 8
    "KHDA":     (4,         1),           # partially submitted
    "CDA":      (0,         0),           # in progress — drafts open, nothing sent yet
    "DC":       None,                     # not started — hasn't opened the cycle
}
_DEFAULT_PLAN = (None, 0)

# Workforce archetype per entity → job-level / seniority shape (human_capital.LEVEL_WEIGHT_PROFILES).
# Field/operations bodies run leaner management over a large operational base; knowledge/regulatory
# bodies carry more managers and professionals. This is what makes the cross-entity comparison report's
# management, senior-management and skilled-vs-admin ratios differ between entities rather than share one
# government-wide shape. Every code here must exist in _ENTITY_PLAN; the split is deliberate per entity.
_ARCHETYPE: dict[str, str] = {
    "RTA": "field_ops", "DM": "field_ops",
    "DP": "field_ops", "DXBC": "field_ops", "GDRFA": "field_ops",
    "DHA": "knowledge", "KHDA": "knowledge", "DC": "knowledge",
    "DLD": "knowledge", "CDA": "knowledge", "DET": "knowledge",
}
_DEFAULT_ARCHETYPE = "balanced"


def _status_for(j: int, received: int, approved: int) -> str | None:
    """Status for department #j of an entity that receives `received` and approves `approved`.

    None means NO submission row at all — a department that never opened, which is a different fact
    from one holding an unsent draft, and the roll-up ladder distinguishes them.
    """
    if j < approved:
        return "approved"
    if j < received:
        # One received department left mid-clarification — real cycles always have one.
        return "in_clarification" if j == received - 1 and received - approved > 1 else "submitted"
    return "draft" if (j - received) % 2 == 0 else None


_NOTES = [
    # The secondment that used to live ONLY in this sentence is now a WorkforceAdjustment row
    # (_ADJUSTMENTS below) — the note explains, the row counts. Prose is invisible to arithmetic.
    "Volumes from the FY2026 case system extract.",
    "Peak season is Q4; we absorb it with overtime rather than headcount.",
    "New e-service goes live in Q3 which should reduce handling time next cycle.",
    "", "", "Regulatory scope widened this year; casework per inspector is up.",
]

# ── supply shape: approved → filled → part-time → establishment FTE ──────────
# A pure function of `approved`, so the department row and its workforce rows always agree without
# threading a counter between two loops. Indexed spread keeps vacancy/part-time varied but
# deterministic — no RNG, so a re-seed reproduces the demo exactly.
_VACANCY_PCT = (0, 4, 9, 6, 12, 3, 7, 0, 5, 10)
_PART_TIME_PCT = (0, 6, 12, 3, 9, 0, 15, 5, 8, 2)

# Where a driver's volume comes from, by family — so the review page can show provenance a reviewer
# can actually check, rather than a bare number. Each family draws its volume from a different system.
_DRIVER_SOURCE = {
    "demand": "FY2026 case-management system extract",
    "ratio": "HR establishment register (FY2026)",
    "coverage": "Rostering system, approved shift pattern",
    "project": "Approved capital portfolio (PMO register)",
    "mandate": "Enabling legislation / licensing schedule",
}


def _supply_shape(approved: int) -> tuple[int, int, float]:
    """(filled headcount, part-time heads, establishment FTE) for an approved establishment."""
    filled = approved - round(approved * _VACANCY_PCT[approved % len(_VACANCY_PCT)] / 100)
    part_time = round(filled * _PART_TIME_PCT[approved % len(_PART_TIME_PCT)] / 100)
    return filled, part_time, round(filled - 0.5 * part_time, 2)


def _department_docs_for(dep: "m.Department", i: int) -> list[tuple[str, str]]:
    """(category, filename) supporting evidence for a department. Varied but deterministic, so a
    re-seed reproduces the demo and some departments carry more evidence than others."""
    slug = "".join(c.lower() if c.isalnum() else "-" for c in dep.name).strip("-")[:40]
    base = [("Volume evidence", f"{slug}-fy2026-volumes.xlsx"),
            ("Org structure", f"{slug}-org-chart.pdf")]
    if i % 3 == 0:
        base.append(("Workforce data", f"{slug}-hr-establishment.xlsx"))
    if i % 4 == 0:
        base.append(("Methodology", f"{slug}-assumptions-note.pdf"))
    return base


# ── non-establishment capacity, seeded structurally ──────────────────────────
# Keyed by (entity code, department name). The first entry is the note that started all this:
# "Two staff seconded to the digital programme until March" — now an amount, a window, both ends of
# the move, and a say in whether it counts. Dubai Municipality's own Digital Services is the
# receiving end, so the loan nets to zero government-wide while both departments state it honestly.
_ADJUSTMENTS: dict[tuple[str, str], list[dict]] = {
    # The note that started all this. Sits on a RECEIVED department on purpose: an adjustment on a
    # draft is recorded but counts toward nothing, so putting the headline example on DM's draft
    # Permits department would have left it invisible in every DGHR view.
    ("DM", "Customer Happiness"): [
        {"kind": "secondment_out", "label": "Seconded to the digital programme", "fte": 2.0,
         "headcount": 2, "starts_on": date(2026, 4, 1), "ends_on": date(2027, 3, 31),
         "to": ("DM", "Digital Services"), "counts_in_supply": True,
         "note": "Two officers released to the e-permits build until March."},
    ],
    ("DM", "Digital Services"): [
        {"kind": "secondment_in", "label": "Seconded from Permits & Certificates", "fte": 2.0,
         "headcount": 2, "starts_on": date(2026, 4, 1), "ends_on": date(2027, 3, 31),
         "from": ("DM", "Permits & Certificates"), "counts_in_supply": True,
         "note": "Domain knowledge for the e-permits build."},
        {"kind": "contractor", "label": "Integration engineers (managed service)", "fte": 4.0,
         "headcount": 4, "starts_on": date(2026, 7, 1), "ends_on": date(2027, 6, 30),
         "counts_in_supply": True, "note": "Framework agreement, renewed annually."},
    ],
    ("RTA", "Customer Happiness Centres"): [
        {"kind": "temporary", "label": "Seasonal counter staff", "fte": 6.0, "headcount": 8,
         "starts_on": date(2026, 6, 1), "ends_on": date(2027, 2, 28), "counts_in_supply": True,
         "note": "Peak cover; eight people on part-time rosters: 8 heads, 6.0 FTE."},
    ],
    ("DHA", "Corporate Services"): [
        {"kind": "outsourced", "label": "Facilities management contract", "fte": 12.0, "headcount": 0,
         "starts_on": date(2026, 1, 1), "counts_in_supply": False,
         "note": "Delivered as a service, the capacity is the vendor's, so it is NOT counted in our supply."},
    ],
    # Deliberately stale: this loan ENDED in June but is still marked as counting in supply. The
    # quality flag catches it ("counted in supply, outside its stated dates") instead of the platform
    # silently correcting an entity's own declaration. Exactly the kind of drift free text could hide.
    ("DP", "Criminal Investigation"): [
        {"kind": "secondment_out", "label": "Seconded to the federal records programme", "fte": 1.0,
         "headcount": 1, "starts_on": date(2025, 10, 1), "ends_on": date(2026, 6, 30),
         "counts_in_supply": True, "note": "Officer returned at the end of June, needs review."},
    ],
}


def _volume_for(family: str, p: dict, target: float) -> float:
    """Invert the family formula: what volume produces `target` FTE at these standards?"""
    p = p or {}
    if target <= 0:
        return 0
    if family == "demand":
        mpu = float(p.get("minutes_per_unit", 20) or 20)
        hours = float(p.get("productive_hours", 1600) or 1600)
        q = float(p.get("quality_allowance", 1.0) or 1.0)
        return round(target * hours * 60.0 / (mpu * q)) if mpu > 0 else 0
    if family == "ratio":
        return round(target * float(p.get("serving_ratio", 1) or 1))
    if family == "coverage":
        d = float(p.get("shifts", 1) or 1) * float(p.get("relief_factor", 1) or 1)
        return round(target / d, 1) if d > 0 else 0
    if family == "project":
        ts = float(p.get("team_size", 1) or 1)
        return round(target / ts) if ts > 0 else 0
    if family == "mandate":
        return round(target)
    return 0


# Each entity's HR champion (S10-14/S18): the person who reviews the consolidated submission and
# whose verification the champion report carries. Assigned deterministically per entity.
_CHAMPIONS = [
    "Aisha Al Suwaidi", "Khalid Al Marri", "Noura Al Hashimi", "Omar Al Balushi",
    "Fatima Al Zaabi", "Yousef Al Nuaimi", "Mariam Al Falasi", "Saeed Al Ketbi",
    "Hessa Al Mazrouei", "Rashid Al Habtoor", "Latifa Al Rostamani", "Ahmed Al Shamsi",
]


def seed_submissions(db: Session, cycle_id: int | None) -> int:
    typesets = {t.id: t for t in db.query(m.Typeset).all()}
    # Every submitted value must be attributable to someone — "who entered this?" is half of what a
    # trace answers, so the seed names the entity's own contact rather than leaving it blank.
    contacts = {u.entity_id: u for u in db.query(m.User).filter(m.User.role == "entity_contact").all()}
    reviewers = db.query(m.User).filter(m.User.role == "dghr_reviewer").order_by(m.User.id).all()
    made = 0
    control_seen = 0
    i = -1  # global department counter — drives texture only (gap spread, notes, Emiratization)
    # (entity code, department name) → Department, so an adjustment can name both ends of a move.
    dept_by_key = {(ent.code, d.name): d
                   for ent in db.query(m.Entity).all()
                   for d in db.query(m.Department).filter(m.Department.entity_id == ent.id).all()}
    for e in db.query(m.Entity).order_by(m.Entity.id).all():
        e.champion_name = _CHAMPIONS[e.id % len(_CHAMPIONS)]
        depts = (db.query(m.Department).filter(m.Department.entity_id == e.id)
                 .order_by(m.Department.id).all())
        plan = _ENTITY_PLAN.get(e.code, _DEFAULT_PLAN)
        if plan is None:            # never started — no submission rows for this entity at all
            i += len(depts)         # keep the texture counter aligned with department position
            continue
        want_recv, want_appr = plan
        received = len(depts) if want_recv is None else min(want_recv, len(depts))
        approved = received if want_appr is None else min(want_appr, received)

        # Archetype-driven workforce shape for this entity — stable across its departments (seeded by
        # entity id) so the entity's job-level / seniority mix crisply reflects its archetype.
        profile = _ARCHETYPE.get(e.code, _DEFAULT_ARCHETYPE)
        level_weights = level_weights_for(profile, seed_i=e.id)
        dir_share = director_share_for(profile, seed_i=e.id)

        for j, dep in enumerate(depts):
            i += 1
            ts = typesets.get(dep.typeset_id)
            if not ts or not ts.default_drivers:
                continue
            status = _status_for(j, received, approved)
            if status is None:      # never opened — no submission row at all
                continue
            contact = contacts.get(dep.entity_id)
            cur = float(dep.current_fte or 0)
            target = cur * _FACTORS[i % len(_FACTORS)]
            drivers = ts.default_drivers
            weights = _WEIGHTS.get(len(drivers), [1.0 / len(drivers)] * len(drivers))

            entered_at = datetime.utcnow() - timedelta(days=(i % 9) + 1)
            # Sign-off takes time: a submission is SENT some days ago and DECIDED more recently, so
            # turnaround (decided − submitted) is a real, non-zero spread the trends screen can plot.
            # Deterministic per department — no RNG, so a re-seed reproduces the same dates.
            _now = datetime.utcnow()
            _submit_days_ago = 8 + (i % 12)                       # sent 8–19 days ago
            _turn_days = 2 + (i % 8)                              # took 2–9 days to sign off
            submitted_dt = _now - timedelta(days=_submit_days_ago)
            decided_dt = _now - timedelta(days=max(1, _submit_days_ago - _turn_days))
            recommended_dt = decided_dt - timedelta(days=1)      # recommended a day before sign-off
            # Two DIFFERENT reviewers per approved submission — the recommender and the signer. A
            # seed where one person did both would quietly violate the rule the engine enforces.
            reviewer = reviewers[i % len(reviewers)]
            approver = reviewers[(i + 1) % len(reviewers)]
            is_recommended = status in ("recommended", "approved")
            # A submission can only leave the entity attested — the seed signs it as the entity's own
            # contact, so what DGHR reviews is a record someone put their name to.
            is_sent = status != "draft"
            sub = m.DepartmentSubmission(
                department_id=dep.id, cycle_id=cycle_id, status=status, version=1,
                notes=_NOTES[i % len(_NOTES)],
                submitted_at=submitted_dt if is_sent else None,
                submitted_by_id=contact.id if contact and is_sent else None,
                submitted_by_name=contact.name if contact and is_sent else "",
                attested=bool(is_sent and contact),
                attested_by=contact.name if contact and is_sent else "",
                attested_at=submitted_dt if is_sent and contact else None,
                # The entity's HR champion verifies the consolidated report a day before it is sent.
                champion_verified_at=(submitted_dt - timedelta(days=1)) if is_sent else None,
                champion_verified_by=e.champion_name if is_sent else "",
                # stage 1 — a reviewer's opinion
                recommendation="approve" if is_recommended else "",
                recommendation_note=("Sizing consistent with the method; drivers evidenced."
                                     if is_recommended else ""),
                recommended_at=recommended_dt if is_recommended else None,
                recommended_by_id=reviewer.id if is_recommended else None,
                recommended_by_name=reviewer.name if is_recommended else "",
                # stage 2 — a different person signs
                decided_at=decided_dt if status == "approved" else None,
                decision_note=("Sign-off: build-up and statutory floor both checked."
                               if status == "approved" else ""),
                decided_by_id=approver.id if status == "approved" else None,
                decided_by_name=approver.name if status == "approved" else "",
                conditions=(["Re-evidence the supervision ratio at the next cycle."]
                            if status == "approved" and i % 7 == 0 else []),
            )
            db.add(sub)
            db.flush()

            # statutory floor comes out of the target first, so the workload build-up carries the rest
            floor = 0
            if ts.key == "regulation":
                floor = max(4, int(round(cur * 0.12)))
                db.add(m.MandateFloor(submission_id=sub.id, element_key=m.element_key("Licensed inspectors"),
                                      role="Licensed inspectors",
                                      legal_basis="Law 12/2024, Art. 6", positions=floor))
            elif ts.key == "control_coverage":
                control_seen += 1
                # A 24/7 control centre is the classic floor-bound case: the certified-controller
                # minimum sits ABOVE the workload build-up, so required = the floor. Make the first
                # one genuinely bind so the max() rule is actually exercised in the data.
                floor = max(4, int(round(target * 1.18))) if control_seen == 1 else max(4, int(round(cur * 0.20)))
                db.add(m.MandateFloor(submission_id=sub.id, element_key=m.element_key("Certified grid controllers"),
                                      role="Certified grid controllers",
                                      legal_basis="Grid Code s.14 (minimum 2 per shift per desk)", positions=floor))

            for pos, (d, w) in enumerate(zip(drivers, weights)):
                vol = _volume_for(d.get("family", "demand"), d.get("params", {}), target * w)
                dname = d.get("name", "")
                db.add(m.SubmissionDriver(
                    submission_id=sub.id, element_key=m.element_key(dname),
                    name=dname, unit=d.get("unit", ""),
                    family=d.get("family", "demand"), volume=vol,
                    forecast=round(float(vol) * 1.06, 1), params=d.get("params", {}), position=pos,
                    source=_DRIVER_SOURCE.get(d.get("family", "demand"), "Entity submission, planning stepper"),
                    entered_by_id=contact.id if contact else None,
                    entered_by_name=contact.name if contact else "",
                    entered_at=entered_at))

            # Workforce profile. `filled` is PEOPLE and `part_time` of them work half time, so the
            # rows' FTE sums to the department's establishment FTE — below its headcount. Both come
            # from the same _supply_shape(approved) the department row was built with, so the two
            # always reconcile. Emiratization is spread per entity for real range.
            filled, part_time, _ = _supply_shape(int(dep.approved_positions or 0))
            # Emiratization is a high band (90%+ everywhere): a tight per-entity tilt near 1.0 keeps
            # the spread inside the floor/cap the model enforces, so every entity rolls up at 90%+.
            wrows = build_workforce_rows(filled, emirati_factor=0.99 + (i % 6) * 0.004,
                                         part_time_heads=part_time, weights=level_weights)
            for wr in wrows:
                db.add(m.SubmissionWorkforceRow(submission_id=sub.id, **wr))

            # S3: the per-position breakdown (role, grade band, headcount) that sits under the total
            # FTE; its `structural` rows drive the structurally-driven-roles count on S5.
            for pr in build_position_rows(filled, seed_i=i, weights=level_weights, director_share=dir_share):
                db.add(m.SubmissionPositionRow(submission_id=sub.id, **pr))

            # Demographic bands (gender/age/grade/region/nationality) behind the HC Overview donuts.
            # Each dimension sums to the department's filled headcount; the nationality Emirati bucket
            # is the REAL Emirati count, so the nationality donut reconciles with Emiratization.
            emirati_total = sum(wr["emirati_count"] for wr in wrows)
            for bd in build_workforce_bands(filled, emirati_total, seed_i=i):
                db.add(m.SubmissionWorkforceBand(submission_id=sub.id, **bd))

            # Non-establishment capacity — the facts that used to be free text.
            for pos, a in enumerate(_ADJUSTMENTS.get((e.code, dep.name), [])):
                src = dept_by_key.get(a["from"]) if a.get("from") else None
                dst = dept_by_key.get(a["to"]) if a.get("to") else None
                db.add(m.WorkforceAdjustment(
                    submission_id=sub.id, kind=a["kind"], label=a["label"],
                    fte=a["fte"], headcount=a.get("headcount", 0),
                    starts_on=a.get("starts_on"), ends_on=a.get("ends_on"),
                    source_department_id=src.id if src else None,
                    receiving_department_id=dst.id if dst else None,
                    counts_in_supply=a.get("counts_in_supply", True),
                    note=a.get("note", ""), position=pos))
            made += 1

            # A recommendation stands on every element having been signed off — the engine refuses
            # otherwise — so a seeded recommendation without its element decisions would describe a
            # state the app itself would reject.
            if is_recommended:
                db.flush()
                for el in review.elements(db, sub):
                    db.add(m.SubmissionElementDecision(
                        submission_id=sub.id, element_type=el["element_type"],
                        element_key=el["element_key"], element_label=el["element_label"],
                        decision="approved", note="", actor_id=reviewer.id,
                        actor_name=reviewer.name))

            # Supporting documents for received submissions — attached to the DEPARTMENT so evidence
            # travels with the figures, not just the entity. path="" means the demo file isn't on disk
            # (the row renders as "reference — file not stored"), which is honest for seeded evidence.
            if is_sent:
                for cat, fname in _department_docs_for(dep, i):
                    db.add(m.Upload(entity_id=e.id, department_id=dep.id, kind="document",
                                    filename=fname, path="", uploaded_by=contact.name if contact else "",
                                    meta={"category": cat}))
    db.commit()
    return made


def seed_reminders(db: Session, cycle_id: int) -> int:
    """S19: per-recipient reminder receipts for the open cycle. A 7-day reminder goes to each entity's
    champion and its form-filling contributor; some have been read, some not, so the read-receipt
    tracking has range to show."""
    contacts = {u.entity_id: u for u in db.query(m.User).filter(m.User.role == "entity_contact").all()}
    now = datetime.utcnow()
    n = 0
    for k, e in enumerate(db.query(m.Entity).order_by(m.Entity.id).all()):
        sent = now - timedelta(days=3 + (k % 4))
        recips = []
        if e.champion_name:
            recips.append(("champion", e.champion_name, k % 3 != 0))       # ~2/3 of champions read it
        c = contacts.get(e.id)
        if c:
            recips.append(("contributor", c.name, k % 2 == 0))              # ~1/2 of contributors read it
        for role, name, read in recips:
            db.add(m.ReminderReceipt(
                cycle_id=cycle_id, entity_id=e.id, recipient_name=name, recipient_role=role,
                milestone=7, sent_at=sent,
                read_at=(sent + timedelta(hours=6 + (k % 12))) if read else None))
            n += 1
    return n


def seed_review_history(db: Session) -> dict:
    """Give the demo the states it must be able to show: a real version chain, an open clarification
    attached to a specific driver, and one question that has aged into escalation.

    A state the seed never produces is a state nobody has seen render — the same rule as the roll-up
    ladder and the adjustment kinds.
    """
    made = {"revisions": 0, "clarifications": 0}
    reviewers = db.query(m.User).filter(m.User.role == "dghr_reviewer").order_by(m.User.id).all()
    if not reviewers:
        return made

    def dept(code: str, name: str) -> m.Department | None:
        e = db.query(m.Entity).filter(m.Entity.code == code).first()
        return db.query(m.Department).filter(
            m.Department.entity_id == e.id, m.Department.name == name).first() if e else None

    # ── 1. A version chain: v1 approved, then revised. v1 must survive EXACTLY as signed off. ──
    # Hosted on a partially-approved entity's approved department, so revising it to a submitted v2
    # leaves the sole fully-approved entity (DHA) intact for the "≥1 entity complete" invariant.
    d = dept("RTA", "Roads Operations & Maintenance")
    if d:
        v1 = versioning.current_version(db, d.id)
        if v1 and v1.status == "approved":
            v2 = versioning.revise(db, v1)
            drv = (db.query(m.SubmissionDriver)
                   .filter(m.SubmissionDriver.submission_id == v2.id)
                   .order_by(m.SubmissionDriver.position).first())
            if drv:
                # A real revision: the entity restated a volume after the extract was corrected.
                drv.volume = round(float(drv.volume) * 1.08, 2)
                drv.forecast = round(float(drv.volume) * 1.06, 2)
            v2.notes = "Volumes restated after the FY2026 extract was corrected."
            contact = db.query(m.User).filter(m.User.role == "entity_contact",
                                              m.User.entity_id == d.entity_id).first()
            # A submitted version is attested, same as any other — the revision was signed too.
            v2.status = "submitted"
            v2.submitted_at = datetime.utcnow()
            v2.submitted_by_id = contact.id if contact else None
            v2.submitted_by_name = contact.name if contact else ""
            v2.attested = bool(contact)
            v2.attested_by = contact.name if contact else ""
            v2.attested_at = datetime.utcnow() if contact else None
            made["revisions"] += 1

    # ── 2. An open clarification on a SPECIFIC driver, aged past the escalation threshold. ──
    # calc_seed sets escalate_after_days = 10, so 13 days puts this one in escalation rather than
    # merely overdue — the queue has to have something in it to prove the queue works.
    d = dept("DP", "Patrol Operations")
    if d:
        sub = versioning.current_version(db, d.id)
        if sub and sub.status in ("submitted", "in_clarification"):
            drv = (db.query(m.SubmissionDriver)
                   .filter(m.SubmissionDriver.submission_id == sub.id)
                   .order_by(m.SubmissionDriver.position).first())
            if drv:
                db.add(m.SubmissionClarification(
                    submission_id=sub.id, element_type="driver", element_id=drv.id,
                    element_key=drv.element_key or m.element_key(drv.name),
                    element_label=drv.name,
                    message=("This volume is 18% above last cycle with no stated cause. "
                             "What changed: demand, or the way it's counted?"),
                    author=reviewers[0].name, side="dghr", status="open",
                    created_at=datetime.utcnow() - timedelta(days=13)))
                sub.status = "in_clarification"
                made["clarifications"] += 1

    # ── 3. A fresher question, inside SLA — so the queue shows range, not just red. ──
    d = dept("GDRFA", "Customer Happiness")
    if d:
        sub = versioning.current_version(db, d.id)
        if sub and sub.status in ("submitted", "in_clarification"):
            db.add(m.SubmissionClarification(
                submission_id=sub.id, element_type="supply", element_key="supply",
                element_label="Supply reconciliation",
                message="Nine vacancies against an approved establishment of 74, are these funded?",
                author=reviewers[1 % len(reviewers)].name, side="dghr", status="open",
                created_at=datetime.utcnow() - timedelta(days=2)))
            sub.status = "in_clarification"
            made["clarifications"] += 1

    # ── 4. Several open questions on ONE submission, each pinned to a DIFFERENT element. ──
    # Proves the entity page renders a separate banner + reply box per questioned element,
    # not one box for the whole form. Anchored to a driver, the profile, and the supply chain.
    d = dept("DXBC", "Digital & IT")
    if d:
        sub = versioning.current_version(db, d.id)
        if sub and sub.status in ("submitted", "in_clarification"):
            drv = (db.query(m.SubmissionDriver)
                   .filter(m.SubmissionDriver.submission_id == sub.id)
                   .order_by(m.SubmissionDriver.position).first())
            if drv:
                db.add(m.SubmissionClarification(
                    submission_id=sub.id, element_type="driver", element_id=drv.id,
                    element_key=drv.element_key or m.element_key(drv.name),
                    element_label=drv.name,
                    message=("The 12-month volume behind this driver isn't reconciled to a system "
                             "of record. Which report is it drawn from, and over what window?"),
                    author=reviewers[0].name, side="dghr", status="open",
                    created_at=datetime.utcnow() - timedelta(days=4)))
                made["clarifications"] += 1
            db.add(m.SubmissionClarification(
                submission_id=sub.id, element_type="profile", element_key="profile",
                element_label="Workforce profile",
                message=("Emiratization is strong overall, but the split by job level looks uneven "
                         "against the entity average. Is the level breakdown accurate, or is a cohort miscoded?"),
                author=reviewers[1 % len(reviewers)].name, side="dghr", status="open",
                created_at=datetime.utcnow() - timedelta(days=3)))
            db.add(m.SubmissionClarification(
                submission_id=sub.id, element_type="supply", element_key="supply",
                element_label="Supply reconciliation",
                message=("Two vacancies against 55 approved positions, are these funded for the "
                         "cycle, and is any contractor cover being counted as available FTE?"),
                author=reviewers[0].name, side="dghr", status="open",
                created_at=datetime.utcnow() - timedelta(days=1)))
            made["clarifications"] += 2
            sub.status = "in_clarification"

    db.commit()
    return made


def _truncate(db: Session) -> None:
    names = ", ".join(f'"{t}"' for t in Base.metadata.tables.keys())
    db.execute(text(f"TRUNCATE {names} RESTART IDENTITY CASCADE"))
    db.commit()


def _db_has_data(db: Session) -> bool:
    """True once the app has been seeded — used to distinguish a first-run empty DB from a
    populated one that a reseed would destroy."""
    return db.query(m.Typeset).count() > 0 and db.query(m.Department).count() > 0


class ReseedRefused(RuntimeError):
    """Raised when seed_clean() would wipe a populated DB without explicit permission."""


def seed_clean(force: bool = False) -> dict:
    """Rebuild the clean Planning scenario. DESTRUCTIVE — truncates every table first.

    Refuses on an already-populated DB unless the reset is explicit (force=True or
    ALLOW_DB_RESET=true). Seeding an empty DB (first run) is always allowed.
    """
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if _db_has_data(db) and not force and not settings.allow_db_reset:
            raise ReseedRefused(
                "Refusing to reseed: the database already holds data that this would DESTROY "
                "(seed_clean TRUNCATEs every table). To run it deliberately, set ALLOW_DB_RESET=true "
                "or use `python -m app.seed_clean --force`. Back up first, see CLAUDE.md > Database "
                "safety. First-run seeding of an empty DB is unaffected."
            )
        _truncate(db)

        start = date(2026, 7, 1)
        cycle = m.CollectionCycle(
            name="FY2027 Planning Cycle", starts_on=start,
            ends_on=start + timedelta(days=45), deadline=start + timedelta(days=45),
            status="open", opened_at=datetime.combine(start, datetime.min.time()),
            opened_by="DGHR Central Team",
        )
        db.add(cycle)
        dghr = m.User(name="DGHR Central Team", initials="DG", role="dghr_admin")
        db.add(dghr)
        # Named reviewers — the people whose signatures the two-stage sign-off actually checks.
        for rname, rinit in _REVIEWERS:
            db.add(m.User(name=rname, initials=rinit, role="dghr_reviewer"))
        db.flush()

        # The calculation method itself is data: formulas, rounding rules, scenarios and engine
        # constants become rows the engine reads, each with a source and an owner, so every figure
        # can be traced to a definition someone owns rather than to a line of Python.
        seed_calc_config(db, owner=dghr)

        ts_by_key: dict[str, m.Typeset] = {}
        for pos, (key, name, fam, drivers) in enumerate(TYPESETS):
            t = m.Typeset(key=key, name=name, position=pos, primary_family=fam, default_drivers=drivers,
                          category=category_for(key), version="1.0", effective_from=METHOD_EFFECTIVE_FROM)
            db.add(t)
            db.flush()
            ts_by_key[key] = t

        depts = 0
        for wi, (name, code, dlist) in enumerate(ENTITIES):
            wave = ["W1", "W1", "W2", "W2", "W3"][wi % 5]
            e = m.Entity(name=name, code=code, wave=wave, status="in_progress", completeness=0,
                         logo_url=logo_url_for(code))
            db.add(e)
            db.flush()
            # One named contact per entity: the person a trace points at when it says who entered
            # a volume. Without this, every "entered by" would read "not recorded".
            cname, initials = _CONTACTS[wi % len(_CONTACTS)]
            db.add(m.User(name=cname, initials=initials, role="entity_contact", entity_id=e.id))
            for dname, tkey, cur in dlist:
                # The planning_seed figure is the APPROVED establishment — authorised posts. What a
                # department actually has is less: some posts are vacant, and some of the people in
                # post are part-time, so its establishment FTE lands below its headcount. These three
                # used to be one number; _supply_shape derives the other two deterministically.
                filled, part_time, establishment_fte = _supply_shape(int(cur))
                db.add(m.Department(entity_id=e.id, name=dname, typeset_id=ts_by_key[tkey].id,
                                    approved_positions=int(cur), current_fte=establishment_fte))
                depts += 1

        db.add(m.AppState(id=1, trend_points=[]))
        db.commit()

        subs = seed_submissions(db, cycle.id)
        # S19: per-recipient reminder receipts (champion + contributor) with read/unread status.
        seed_reminders(db, cycle.id)
        # Versions, questions and escalation exist only if the seed makes them exist.
        hist = seed_review_history(db)
        # Illustrative labour-market / education reference data for the analytics dashboards — the one
        # seed that is NOT derived from submissions, kept in its own table and labelled in the UI.
        market = seed_market_reference(db)

        # A prior, CLOSED cycle so the history + trends screen has more than one point to plot. It
        # holds no submissions of its own — a closed cycle's numbers are a frozen SNAPSHOT — and this
        # one is DERIVED from this cycle's real outcome, deterministically down-shifted so the prior
        # year reads as less complete and the trend shows genuine cycle-over-cycle improvement.
        prev_start = date(2025, 7, 1)
        prev = m.CollectionCycle(
            name="FY2026 Planning Cycle", starts_on=prev_start,
            ends_on=prev_start + timedelta(days=45), deadline=prev_start + timedelta(days=45),
            status="closed", auto_close=True,
            opened_at=datetime.combine(prev_start, datetime.min.time()), opened_by="DGHR Central Team",
            closed_at=datetime.combine(prev_start + timedelta(days=50), datetime.min.time()),
            closed_by="DGHR Central Team",
        )
        db.add(prev)
        db.flush()
        cur = cycles.cycle_outcome(db, cycle)              # this cycle's REAL received/approved
        total = cur["departments_total"] or db.query(m.Department).count()
        db.add(m.CycleSnapshot(
            cycle_id=prev.id, departments_total=total,
            received=round(cur["received"] * 0.80) if cur["received"] else round(total * 0.58),
            approved=round(cur["approved"] * 0.55) if cur["approved"] else round(total * 0.28),
            avg_turnaround_days=round((cur["avg_turnaround_days"] or 8.0) + 3.4, 1),
            # entities also behind THIS cycle, so they surface as chronically late across both.
            late_entity_codes=["DM", "KHDA", "CDA", "DC"],
            captured_at=datetime.combine(prev_start + timedelta(days=50), datetime.min.time()),
        ))
        db.commit()

        return {"cycle": cycle.name, "typesets": len(ts_by_key), "entities": len(ENTITIES),
                "departments": depts, "submissions": subs, "market_reference": market,
                "revisions": hist["revisions"], "clarifications": hist["clarifications"]}
    finally:
        db.close()


def seed_clean_if_empty() -> dict:
    db = SessionLocal()
    try:
        Base.metadata.create_all(bind=engine)
        if db.query(m.Typeset).count() > 0 and db.query(m.Department).count() > 0:
            return {"skipped": True}
    finally:
        db.close()
    return seed_clean()


if __name__ == "__main__":
    if "--if-empty" in sys.argv:
        print(seed_clean_if_empty())
    else:
        # A bare `python -m app.seed_clean` is destructive; it refuses on a populated DB unless
        # ALLOW_DB_RESET=true. `--force` is the explicit "yes, wipe and rebuild" for a deliberate reset.
        print(seed_clean(force="--force" in sys.argv))

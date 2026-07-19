"""Planning sizing engine.

Turns a department submission's drivers + statutory floors into a Required-FTE, exactly per the
typeset/architecture docs:  required = round(max( workload build-up , statutory floor )).

Per-family formulas (driver -> raw FTE), from the typeset model doc:
  demand   : volume x (minutes_per_unit/60) / productive_hours x quality_allowance   (CEILINGED)
  ratio    : volume / serving_ratio
  coverage : volume x shifts x relief_factor
  project  : volume x team_size
  mandate  : handled separately as MandateFloor (statutory positions)

Verified against the doc's worked examples:
  Certificates & Permits (demand): 210000x18/60/1600x1.15 = 45.28 -> ceil 46
  Corporate HR (ratio):            2400/85 = 28.2 -> 28
  Control Centre (coverage):       6x3x1.55 = 27.9 (+4 supervision) -> 32
  Licensing (mandate floor):       24 positions
  Capital Projects (project):      3x6 + 8x3 + 22x0.8 = 59.6 -> 60
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from statistics import median

from sqlalchemy.orm import Session

from app import models as m
from app.services import calc_config, supply, versioning
from app.services.calc_config import CalcConfig
from app.services.formula import FormulaError, apply_rounding, evaluate

# One definition, on the model beside the statuses themselves — this used to be re-declared here and
# in routers/planning.py, so adding a status meant remembering two places.
RECEIVED = m.RECEIVED_STATUSES


def _scen_factor(cfg: CalcConfig, scenario: str, family: str) -> float:
    return cfg.factor(scenario, family)


# ─────────────────────────── per-driver formula ───────────────────────────
def resolved_params(method, params: dict | None) -> dict:
    """The parameter values the formula will actually see: the method's declared defaults, with the
    driver's own values on top. Returned (not just used) because the trace has to show a parameter
    that fell back to its default as exactly that — a default, not something the entity stated."""
    merged = {s["key"]: s.get("default", 0) for s in (method.param_specs or [])}
    merged.update({k: v for k, v in (params or {}).items()
                   if isinstance(v, (int, float)) and not isinstance(v, bool)})
    return merged


def driver_fte_raw(cfg: CalcConfig, family: str, volume: float | None, params: dict | None) -> float:
    """Raw FTE for one driver, by evaluating the family's DB-held formula.

    The formula is not written here any more: it comes from calc_methods, which is what lets
    "View calculation" show the user the same expression the engine ran.
    """
    p = params or {}
    if p.get("fte_override") is not None:
        try:
            return float(p["fte_override"])
        except (TypeError, ValueError):
            return 0.0
    method = cfg.method(family)
    if method is None:
        return 0.0
    vars_ = resolved_params(method, p)
    vars_["volume"] = float(volume or 0)
    try:
        return float(evaluate(method.expression, vars_))
    except FormulaError:
        # A missing/zero denominator means the department never supplied a required standard.
        # That is "cannot size", which must read as 0 here and be surfaced as a flag — never as
        # an invented number.
        return 0.0


def _effective(cfg: CalcConfig, family: str, raw: float) -> float:
    """Apply the family's own rounding (demand ceilings; the rest stay raw until the final round)."""
    method = cfg.method(family)
    return apply_rounding(method.rounding, raw) if method else raw


def _apportion(cfg: CalcConfig, raw: dict[str, float], total: int) -> list[dict]:
    """Split `total` across families proportionally to `raw`, using the largest-remainder method so
    the integer slices sum EXACTLY to `total`. Guarantees the family donut always reconciles with
    Required FTE (no rounding drift between the chart and the headline)."""
    raw = {k: v for k, v in raw.items() if v > 0}
    if not raw or total <= 0:
        return []
    s = sum(raw.values())
    exact = {k: (v / s) * total for k, v in raw.items()}
    out = {k: int(math.floor(v)) for k, v in exact.items()}
    rem = total - sum(out.values())
    order = sorted(exact, key=lambda k: exact[k] - math.floor(exact[k]), reverse=True)
    for i in range(max(0, rem)):
        out[order[i % len(order)]] += 1
    return [{"family": f, "fte": out[f]} for f in cfg.families if out.get(f, 0) > 0]


# ─────────────────────────── measure sizing (one period) ───────────────────────────
def _driver_volume(d: m.SubmissionDriver, measure) -> float:
    """The volume a measure reads for this driver.

    A forecast of 0 means "not stated", not "no work next year" — so the measure falls back to the
    reported volume (flat) rather than sizing the department to nothing. Reported via
    `forecast_stated` so the UI can say the forecast is assumed flat instead of implying the entity
    forecast no change.
    """
    v = float(getattr(d, measure.volume_field, 0) or 0)
    return v if v > 0 else float(d.volume or 0)


def _size_measure(cfg: CalcConfig, drivers, overrides, floor_total: float,
                  measure, scenario: str) -> dict:
    """Size one period. Same formulas, same rounding — only the volume column differs."""
    build_up = 0.0
    split: dict[str, float] = {}
    per_driver: dict[int, float] = {}
    for d in drivers:
        vol = _driver_volume(d, measure)
        raw = driver_fte_raw(cfg, d.family, vol, d.params) * _scen_factor(cfg, scenario, d.family)
        eff = _effective(cfg, d.family, raw)
        ov = overrides.get(d.id)
        if ov is not None:
            # A human has overruled the engine for this driver. An override states an FTE, not a
            # workload, so there is nothing to grow — it applies unchanged to every period, and the
            # trace says so rather than silently inflating someone's stated number.
            eff = float(ov.override_value)
        build_up += eff
        split[d.family] = split.get(d.family, 0.0) + eff
        per_driver[d.id] = eff

    rule = cfg.text("sizing.final_rounding", "round_half_up")
    required = int(apply_rounding(rule, max(build_up, floor_total)))
    return {"build_up": build_up, "required": required, "split": split, "per_driver": per_driver,
            "floor_binds": floor_total > build_up}


# ─────────────────────────── submission-level sizing ───────────────────────────
def submission_sizing(db: Session, submission: m.DepartmentSubmission, scenario: str = "base") -> dict:
    cfg = calc_config.config(db)
    drivers = (
        db.query(m.SubmissionDriver)
        .filter(m.SubmissionDriver.submission_id == submission.id)
        .order_by(m.SubmissionDriver.position, m.SubmissionDriver.id)
        .all()
    )
    floors = db.query(m.MandateFloor).filter(m.MandateFloor.submission_id == submission.id).all()
    dept = db.get(m.Department, submission.department_id)
    overrides = calc_config.active_overrides(db, "driver", [d.id for d in drivers])
    floor_total = sum(int(f.positions or 0) for f in floors)

    # Size every configured period. `required_fte` remains the CURRENT-volume figure — that is what
    # it has always been, and what the roll-ups, gap and donut are built on. The forecast used to be
    # collected and then only bend the projection curve, so the headline never said which period it
    # spoke for. Now each period is computed and labelled explicitly.
    sized = {ms.key: _size_measure(cfg, drivers, overrides, float(floor_total), ms, scenario)
             for ms in cfg.sized_measures}
    base = sized.get("current") or next(iter(sized.values()), None)
    if base is None:  # no measures configured at all
        base = _size_measure(cfg, drivers, overrides, float(floor_total),
                             calc_config.Measure("current", "Current required FTE", "Current",
                                                 "volume", "", "", "", ""), scenario)
        sized = {"current": base}

    build_up = base["build_up"]
    split = base["split"]
    rounding_rule = cfg.text("sizing.final_rounding", "round_half_up")
    required = base["required"]
    # Supply is AVAILABLE FTE, not the raw establishment: a department that has lent two people to
    # the digital programme until March does not have their time to deploy against demand. See
    # services/supply.py for the establishment → people → adjustments → available chain.
    sup = supply.submission_supply(db, submission)
    # Supply stays FRACTIONAL. `required` is whole posts (you cannot hire 0.4 of a post), but
    # available FTE is fractional BY DEFINITION — that is what makes it not a headcount. Rounding it
    # here would quietly re-merge the two concepts this split exists to separate, and would drift by
    # up to half a post per department once summed across 86 of them.
    current = supply.available_fte(db, submission)
    gap = round(current - required, 2)
    floor_binds = base["floor_binds"]

    driver_rows = []
    for d in drivers:
        ov = overrides.get(d.id)
        eff = base["per_driver"].get(d.id, 0.0)
        row = {
            "id": d.id, "element_key": d.element_key or m.element_key(d.name),
            "name": d.name, "unit": d.unit, "family": d.family,
            "volume": float(d.volume or 0), "forecast": float(d.forecast or 0),
            "source": d.source or "",
            "params": d.params or {}, "fte": int(round(eff)),
            # The UNROUNDED contribution. `fte` is display-rounded, so summing it reproduces neither
            # the build-up nor Required FTE — a trace that shows "40 + 18 + 9 = 66.8" is worse than
            # no trace, because it looks like an arithmetic error rather than a rounding choice.
            "fte_raw": round(eff, 4),
            "overridden": ov is not None,
            "forecast_stated": float(d.forecast or 0) > 0,
        }
        # Per-driver figure for every period, so a driver row can show what it needs THIS cycle and
        # what its own forecast implies for the next one.
        for key, s in sized.items():
            row[f"fte_{key}"] = round(s["per_driver"].get(d.id, 0.0), 4)
        driver_rows.append(row)

    # quality flags (matches the demo's review-queue flags)
    variance = cfg.num("sizing.variance_flag_threshold", 0.15)
    flags: list[str] = []
    if required > 0 and abs(gap) / required > variance:
        flags.append(f"Sizing variance above {round(variance * 100)}%")
    if floor_total > 0:
        flags.append("Statutory floor applies")
    if not driver_rows:
        flags.append("No drivers entered")
    if any(r["overridden"] for r in driver_rows):
        flags.append("Contains a manual override")

    # Family split must reconcile EXACTLY with required_fte:
    #  - drivers contribute their effective FTE (sums to build_up)
    #  - a statutory floor only enters the split when it BINDS (required = floor), as a top-up.
    #    When it doesn't bind it contributes 0 to required, so it must NOT appear in the donut —
    #    it stays reported separately via floor_total / mandates.
    raw_by_fam: dict[str, float] = {f: v for f, v in split.items() if v > 0}
    if floor_binds:
        raw_by_fam["mandate"] = raw_by_fam.get("mandate", 0.0) + (float(floor_total) - build_up)
    family_split = _apportion(cfg, raw_by_fam, required)
    if floor_binds:
        for x in family_split:
            if x["family"] == "mandate":
                x["binds"] = True

    # ── the measures block: what each figure IS, not just what it equals ──
    # Composed here so a screen can never show a Required FTE without being able to name its period.
    results = {k: s["required"] for k, s in sized.items()}
    measures = []
    for ms in cfg.measures:
        if ms.derived:
            try:
                value = int(evaluate(ms.expression, {k: float(v) for k, v in results.items()}))
            except FormulaError:
                continue
        else:
            value = results.get(ms.key)
            if value is None:
                continue
        measures.append({
            "key": ms.key, "label": ms.label, "short_label": ms.short_label,
            "value": value, "derived": ms.derived,
            "period_note": ms.period_note, "description": ms.description, "source": ms.source,
            "build_up": round(sized[ms.key]["build_up"], 4) if ms.key in sized else None,
            "volume_field": ms.volume_field,
        })

    # An entity that stated no forecast is sized flat — say so rather than let a +0 planning change
    # read as a confident "no growth expected".
    forecast_stated = any(r["forecast_stated"] for r in driver_rows)
    if driver_rows and not forecast_stated:
        flags.append("No forecast volumes stated, next cycle assumed flat")

    return {
        "submission_id": submission.id,
        "status": submission.status,
        "build_up": round(build_up, 1),
        "floor_total": floor_total,
        "floor_binds": floor_binds,
        "required_fte": required,
        "measures": measures,
        "forecast_required_fte": results.get("forecast", required),
        "planning_change": results.get("forecast", required) - required,
        "forecast_stated": forecast_stated,
        # `current_fte` is the AVAILABLE FTE the gap was measured against — kept under this key so
        # every existing caller keeps reconciling (gap = current_fte − required_fte). `supply`
        # carries the chain behind it, so a reader can see which of the words they're looking at.
        "current_fte": current,
        "available_fte": current,
        "supply": sup,
        "gap": gap,
        "drivers": driver_rows,
        "mandates": [
            {"id": f.id, "role": f.role, "legal_basis": f.legal_basis, "positions": int(f.positions or 0)}
            for f in floors
        ],
        "family_split": family_split,
        "flags": flags,
        "scenario": scenario,
        "rounding_rule": rounding_rule,
        "build_up_raw": round(build_up, 4),
    }


# ─────────────────────────── active submission per department ───────────────────────────
def active_submission(db: Session, department_id: int) -> m.DepartmentSubmission | None:
    """The newest RECEIVED version, else the newest draft.

    With versioning this is "the version the government position counts". If v1 is approved and the
    entity has opened v2 as a draft, this still returns v1 — a draft revision nobody has submitted
    must not displace the record that was. Once v2 is submitted, v2 wins.
    """
    subs = (
        db.query(m.DepartmentSubmission)
        .filter(m.DepartmentSubmission.department_id == department_id)
        .order_by(m.DepartmentSubmission.version.desc(), m.DepartmentSubmission.id.desc())
        .all()
    )
    for s in subs:
        if s.status in RECEIVED:
            return s
    return subs[0] if subs else None


def basis_submission(db: Session, department_id: int, basis: str) -> m.DepartmentSubmission | None:
    """The version a given basis should read.

    `approved` asks a different question from the rest: "what has DGHR signed off?" — and the answer
    survives a revision in flight. If v1 is approved and v2 is submitted awaiting review, the
    department's APPROVED position is still v1; reading v2 (status 'submitted') would make the
    department vanish from the approved total the moment someone started revising it.
    """
    if basis == "approved":
        return versioning.approved_submission(db, department_id)
    return active_submission(db, department_id)


def _sum_sizings(sizings: list[dict]) -> dict:
    # Sum the exact fractional supply, then round once — rounding each department first would drift
    # by up to half a post per department (±43 FTE across 86 of them).
    cur = round(sum(s["current_fte"] for s in sizings), 2)
    req = sum(s["required_fte"] for s in sizings)
    split: dict[str, int] = {}
    for s in sizings:
        for fs in s["family_split"]:
            split[fs["family"]] = split.get(fs["family"], 0) + fs["fte"]
    return {
        "current_fte": cur, "required_fte": req, "gap": round(cur - req, 2),
        "departments": len(sizings),
        "family_split": [{"family": k, "fte": v} for k, v in split.items()],
    }


# ─────────────────────────── entity roll-up ───────────────────────────
def smart_remark(gap, required, threshold: float, *, high_multiple: float = 2.0):
    """G6 (18072026 change requests): translate a gap into a recommended reviewer action.

    The bands derive from the engine's own variance-flag threshold (calc params), so nothing here is
    a hardcoded metric. Returns None when there is nothing received yet to remark on.
    """
    if gap is None or not required:
        return None
    v = gap / required  # < 0 shortage (under-supplied), > 0 surplus
    clean_band = threshold / 3.0
    if abs(v) <= clean_band:
        return {"tone": "clean", "label": "Clean", "action": "No action"}
    if v < 0:
        if v <= -threshold:
            return {"tone": "shortage", "label": "Shortage", "action": "Deep-dive review, call the entity"}
        return {"tone": "shortage", "label": "Shortage", "action": "Requires a solution, final review"}
    if v >= threshold * high_multiple:
        return {"tone": "high_surplus", "label": "Very high surplus", "action": "Further review"}
    return {"tone": "surplus", "label": "Surplus", "action": "Requires intervention"}


def _status_date_iso(sub):
    """G9/S5: the date the department's current status was reached, for the status tables."""
    if not sub:
        return None
    if sub.status == "approved":
        d = sub.decided_at
    elif sub.status in ("submitted", "in_clarification", "recommended"):
        d = sub.submitted_at
    elif sub.status == "rejected":
        d = sub.decided_at or sub.submitted_at
    else:  # draft
        d = sub.updated_at
    return d.isoformat() if d else None


def entity_sizing(db: Session, entity_id: int, *, received_only: bool = True, scenario: str = "base") -> dict:
    cfg = calc_config.config(db)
    thr = cfg.num("sizing.variance_flag_threshold", 0.15)
    depts = db.query(m.Department).filter(m.Department.entity_id == entity_id).all()
    rows, sizings = [], []
    for dept in depts:
        sub = active_submission(db, dept.id)
        sz = submission_sizing(db, sub, scenario) if sub else None
        counted = sz and (not received_only or sub.status in RECEIVED)
        if counted:
            sizings.append(sz)
        rows.append({
            "department_id": dept.id, "name": dept.name,
            "typeset_id": dept.typeset_id,
            "submission_id": sub.id if sub else None,
            "status": sub.status if sub else "no_submission",
            "current_fte": int(round(float(dept.current_fte or 0))),
            "required_fte": sz["required_fte"] if sz else None,
            "gap": sz["gap"] if sz else None,
            "remark": smart_remark(sz["gap"], sz["required_fte"], thr) if counted else None,
            "status_date": _status_date_iso(sub),
        })
    totals = _sum_sizings(sizings)
    return {"entity_id": entity_id, "departments": rows, "totals": totals}


# ═══════════════════════ submission pipeline (G7) ═══════════════════════
# Where every department submission sits, as one reusable read-model for the government dashboard,
# the entity dashboard and cycle administration. Reads live statuses, nothing seeded.
PIPELINE_STAGES = ["not_started", "draft", "submitted", "in_clarification", "in_review", "approved"]
PIPELINE_LABELS = {
    "not_started": "Not started", "draft": "Draft", "submitted": "Submitted",
    "in_clarification": "In clarification", "in_review": "In review", "approved": "Approved",
}
# recommended = a DGHR reviewer's stage-1 sign-off is in, awaiting the second signature: "in review".
_STATUS_TO_STAGE = {
    "draft": "draft", "rejected": "draft",
    "submitted": "submitted", "in_clarification": "in_clarification",
    "recommended": "in_review", "approved": "approved",
}


def _dept_stage(db: Session, dept_id: int) -> str:
    sub = active_submission(db, dept_id)
    if not sub:
        return "not_started"
    return _STATUS_TO_STAGE.get(sub.status, "draft")


def _pipeline_counts(db: Session, depts) -> dict:
    counts = {s: 0 for s in PIPELINE_STAGES}
    for d in depts:
        counts[_dept_stage(db, d.id)] += 1
    received = counts["submitted"] + counts["in_clarification"] + counts["in_review"] + counts["approved"]
    return {
        "stages": [{"key": s, "label": PIPELINE_LABELS[s], "count": counts[s]} for s in PIPELINE_STAGES],
        "total": len(depts), "received": received,
        "outstanding": counts["not_started"] + counts["draft"],
    }


def submission_pipeline(db: Session, entity_id: int | None = None) -> dict:
    """G7: the submission pipeline. Per entity, or government-wide with a per-entity breakdown."""
    if entity_id is not None:
        depts = db.query(m.Department).filter(m.Department.entity_id == entity_id).all()
        return _pipeline_counts(db, depts)
    per_entity = []
    for e in db.query(m.Entity).order_by(m.Entity.name).all():
        depts = db.query(m.Department).filter(m.Department.entity_id == e.id).all()
        if not depts:
            continue
        per_entity.append({"entity_id": e.id, "name": e.name, "code": e.code, **_pipeline_counts(db, depts)})
    overall = _pipeline_counts(db, db.query(m.Department).all())
    return {**overall, "entities": per_entity}


# ═══════════════════════ entity roll-up status ═══════════════════════
# A DepartmentSubmission.status answers "did THIS department arrive?" — draft / submitted /
# in_clarification / approved / rejected. An entity is a CONTAINER of departments, so it needs its
# own axis: "Partially" and "Fully" are qualifiers that only mean anything for a container, and a
# department is never "partially submitted". The two vocabularies compose; neither replaces the other.
#
# The ladder reports an entity's WEAKEST link. Dubai Municipality (5 of 8 received, 1 of those
# approved) is "Partially submitted", not "Submitted" and not "Partially approved" — the 3 that
# never arrived are the fact that limits what the entity's number means.
ROLLUP_LADDER = ("not_started", "in_progress", "partially_submitted",
                 "fully_submitted", "partially_approved", "fully_approved")
ROLLUP_LABEL = {
    "not_started": "Not started",
    "in_progress": "In progress",
    "partially_submitted": "Partially submitted",
    "fully_submitted": "Fully submitted",
    "partially_approved": "Partially approved",
    "fully_approved": "Fully approved",
}


def rollup_status(total: int, received: int, approved: int, started: int) -> str:
    """`started` = departments holding a submission that has NOT been received (draft / rejected)."""
    if total == 0 or (received == 0 and started == 0):
        return "not_started"
    if received == 0:
        return "in_progress"
    if received < total:
        return "partially_submitted"
    if approved == total:
        return "fully_approved"
    return "partially_approved" if approved > 0 else "fully_submitted"


# ═══════════════════════ position basis ═══════════════════════
# A government-wide figure is only as strong as the departments underneath it. `basis` makes that
# strength explicit and selectable, instead of leaving received_only=True as an invisible default
# that silently reads as a final government position:
#   received  — every department that has arrived (submitted / in_clarification / approved)
#   approved  — only what DGHR has signed off
#   complete  — only entities that submitted EVERY department (no half-counted entities)
#   estimated — received actuals + a modelled estimate for departments still outstanding
# Only `approved` at full coverage is an OFFICIAL position. Everything else is preliminary.
BASES = (
    {"key": "received", "label": "All received submissions"},
    {"key": "approved", "label": "Approved submissions only"},
    {"key": "complete", "label": "Complete entities only"},
    {"key": "estimated", "label": "Estimated full-government position"},
)
BASIS_KEYS = tuple(b["key"] for b in BASES)


@dataclass
class _Snap:
    """One department's standing in the cycle — the unit every basis filters on."""
    department_id: int
    entity_id: int
    typeset_id: int | None
    typeset: str
    primary_family: str
    current_fte: float
    status: str
    submission_id: int | None
    sizing: dict | None  # None when the department has no submission row at all

    @property
    def received(self) -> bool:
        return self.status in RECEIVED

    @property
    def approved(self) -> bool:
        return self.status == "approved"

    @property
    def started(self) -> bool:
        """Has a submission that hasn't arrived — draft or rejected (i.e. back with the entity)."""
        return self.status != "no_submission" and self.status not in RECEIVED


def _snapshot(db: Session, scenario: str | None = None, *, basis: str = "received") -> list[_Snap]:
    """`scenario=None` skips the per-submission sizing — use when only basis membership is needed.

    `basis` decides WHICH VERSION each department is read at (see basis_submission): the approved
    basis reads the newest approved version, everything else reads the newest received one.
    """
    typesets = {t.id: t for t in db.query(m.Typeset).all()}
    snaps = []
    for dept in db.query(m.Department).order_by(m.Department.id).all():
        sub = basis_submission(db, dept.id, basis)
        ts = typesets.get(dept.typeset_id)
        snaps.append(_Snap(
            department_id=dept.id, entity_id=dept.entity_id, typeset_id=dept.typeset_id,
            typeset=ts.name if ts else "Unclassified",
            primary_family=ts.primary_family if ts else "demand",
            current_fte=round(float(dept.current_fte or 0), 2),
            status=sub.status if sub else "no_submission",
            submission_id=sub.id if sub else None,
            sizing=submission_sizing(db, sub, scenario) if sub and scenario else None,
        ))
    return snaps


def counted_department_ids(db: Session, basis: str = "received") -> set[int]:
    """Departments whose ACTUAL submission counts under `basis`.

    The single definition of "counts", shared by the sizing engine, Human Capital and the projection
    so that two panels on one screen can never disagree about what they are standing on.

    `estimated` deliberately returns the same set as `received`: the estimate lives only in the
    sizing engine, which scales a KNOWN current FTE. An outstanding department has no submitted
    workforce rows and no drivers behind it, so Human Capital and the projection stay on actuals —
    and say so rather than inventing an Emiratization rate or a growth curve.
    """
    basis = basis if basis in BASIS_KEYS else "received"
    snaps = _snapshot(db, basis=basis)
    complete = _complete_entities(snaps)
    return {s.department_id for s in snaps if _counts(s, basis, complete)}


# ─────────────── estimating the departments that haven't arrived (basis="estimated") ───────────────
# We already know current_fte for EVERY department — only the sizing is missing. So an outstanding
# department is estimated from its own real establishment × how peer departments of the SAME typeset
# actually sized (median required/current among received ones). Rule-based and explainable, NOT an AI
# forecast, and never presented as submitted data.
def _typeset_ratios(snaps: list[_Snap]) -> tuple[dict, float, dict]:
    """(median required/current per typeset, government-wide fallback ratio, median required per typeset)."""
    ratio: dict[int | None, list[float]] = {}
    absolute: dict[int | None, list[float]] = {}
    every: list[float] = []
    for s in snaps:
        if not s.received or not s.sizing:
            continue
        absolute.setdefault(s.typeset_id, []).append(float(s.sizing["required_fte"]))
        if s.current_fte > 0:
            r = s.sizing["required_fte"] / s.current_fte
            ratio.setdefault(s.typeset_id, []).append(r)
            every.append(r)
    return ({k: median(v) for k, v in ratio.items()},
            median(every) if every else 1.0,
            {k: median(v) for k, v in absolute.items()})


def _estimated_sizing(s: _Snap, ratio: dict, fallback: float, absolute: dict) -> dict:
    if s.current_fte > 0:
        required = int(round(s.current_fte * ratio.get(s.typeset_id, fallback)))
    else:
        # No establishment to scale from — fall back to what peer departments of this type require.
        required = int(round(absolute.get(s.typeset_id, 0.0)))
    return {
        "current_fte": s.current_fte, "required_fte": required, "gap": round(s.current_fte - required, 2),
        # No drivers exist for an unsubmitted department, so the estimate is attributed wholly to its
        # typeset's primary family. Enough to keep the donut reconciling; not a real build-up.
        "family_split": [{"family": s.primary_family, "fte": required}] if required > 0 else [],
        "estimated": True,
    }


def _complete_entities(snaps: list[_Snap]) -> set[int]:
    """Entities where EVERY department has been received — the only ones whose entity total is a
    whole number rather than a partial one."""
    per_entity: dict[int, list[_Snap]] = {}
    for s in snaps:
        per_entity.setdefault(s.entity_id, []).append(s)
    return {eid for eid, rows in per_entity.items() if rows and all(r.received for r in rows)}


def _counts(s: _Snap, basis: str, complete: set[int]) -> bool:
    """Does this department's ACTUAL submission count toward the position under `basis`?
    Deliberately independent of s.sizing so it holds for a light snapshot too — `received` already
    implies a submission exists."""
    if not s.received:
        return False
    if basis == "approved":
        return s.approved
    if basis == "complete":
        return s.entity_id in complete
    return True  # received / estimated both take every actual that has arrived


def _coverage(basis: str, snaps: list[_Snap], counted: list[tuple[_Snap, dict]],
              complete: set[int], entities_total: int) -> dict:
    """What the headline figure is actually standing on — and, in one sentence, what it is not.

    The statement is composed here rather than in JSX so the wording can never drift from the basis
    that produced it, and so no count is ever hardcoded in the UI.
    """
    total = len(snaps)
    received = sum(1 for s in snaps if s.received)
    approved = sum(1 for s in snaps if s.approved)
    estimated = sum(1 for _, sz in counted if sz.get("estimated"))
    actual = len(counted) - estimated
    pct = round(received / total * 100) if total else 0
    official = basis == "approved" and total > 0 and approved == total

    if official:
        statement = f"Official government position: all {total} departments submitted and approved."
    elif basis == "approved":
        statement = (f"Preliminary, approved submissions only: {approved} of {total} departments "
                     f"signed off. This is not a government-wide total.")
    elif basis == "complete":
        statement = (f"Preliminary, complete entities only: {len(complete)} of {entities_total} entities "
                     f"have submitted every department ({actual} of {total} departments). "
                     f"Partially submitted entities are excluded entirely.")
    elif basis == "estimated":
        statement = (f"Estimated, not submitted: {actual} of {total} departments are actual; "
                     f"{estimated} are modelled from typeset peers. Not a government position.")
    else:
        statement = (f"Preliminary government position, based on {received} of {total} departments, "
                     f"of which {approved} are approved.")

    out = {
        "basis": basis,
        "label": next(b["label"] for b in BASES if b["key"] == basis),
        "official": official,
        "statement": statement,
        "departments_total": total,
        "departments_received": received,
        "departments_approved": approved,
        "departments_counted": len(counted),
        "departments_actual": actual,
        "departments_estimated": estimated,
        "departments_outstanding": total - received,
        "entities_total": entities_total,
        "entities_complete": len(complete),
        "received_pct": pct,
    }
    if estimated:
        out["method"] = ("Outstanding departments estimated from their own current FTE × the median "
                         "required/current ratio of received departments of the same typeset. "
                         "Rule-based, not an AI forecast.")
    return out


# ─────────────────────────── government-wide + by-typeset ───────────────────────────
def government_sizing(db: Session, *, basis: str = "received", scenario: str = "base") -> dict:
    basis = basis if basis in BASIS_KEYS else "received"
    cfg = calc_config.config(db)
    thr = cfg.num("sizing.variance_flag_threshold", 0.15)
    snaps = _snapshot(db, scenario, basis=basis)
    complete = _complete_entities(snaps)
    ratios = _typeset_ratios(snaps) if basis == "estimated" else None

    counted: list[tuple[_Snap, dict]] = []
    for s in snaps:
        if _counts(s, basis, complete):
            counted.append((s, s.sizing))
        elif basis == "estimated" and not s.received:
            counted.append((s, _estimated_sizing(s, *ratios)))

    per_entity: dict[int, list[_Snap]] = {}
    for s in snaps:
        per_entity.setdefault(s.entity_id, []).append(s)

    entity_rows = []
    for e in db.query(m.Entity).order_by(m.Entity.name).all():
        rows = per_entity.get(e.id, [])
        mine = [sz for s, sz in counted if s.entity_id == e.id]
        totals = _sum_sizings(mine)
        received = sum(1 for s in rows if s.received)
        approved = sum(1 for s in rows if s.approved)
        entity_rows.append({
            "entity_id": e.id, "name": e.name, "code": e.code,
            "dept_count": len(rows),
            "received": received,
            "approved": approved,
            "counted": len(mine),
            "rollup_status": rollup_status(len(rows), received, approved,
                                           sum(1 for s in rows if s.started)),
            "estimated": any(sz.get("estimated") for sz in mine),
            "current_fte": totals["current_fte"],
            "required_fte": totals["required_fte"],
            "gap": totals["gap"],
            "remark": smart_remark(totals["gap"], totals["required_fte"], thr) if mine else None,
        })

    by_type: dict[str, dict] = {}
    for s, sz in counted:
        b = by_type.setdefault(s.typeset, {"typeset": s.typeset, "departments": 0,
                                           "current_fte": 0, "required_fte": 0, "estimated": 0})
        b["departments"] += 1
        b["current_fte"] += sz["current_fte"]
        b["required_fte"] += sz["required_fte"]
        b["estimated"] += 1 if sz.get("estimated") else 0
    for b in by_type.values():
        b["gap"] = b["current_fte"] - b["required_fte"]

    return {
        "totals": _sum_sizings([sz for _, sz in counted]),
        "entities": entity_rows,
        "by_typeset": sorted(by_type.values(), key=lambda x: -x["required_fte"]),
        "coverage": _coverage(basis, snaps, counted, complete, len(entity_rows)),
        "rollup_labels": ROLLUP_LABEL,
    }


# ═══════════════════════ multi-year demand–supply projection ═══════════════════════
# Turns the point-in-time gap into a forward trajectory. Transparent & rule-based (NOT an
# AI forecast): demand grows from each driver's own 12-month forecast; supply erodes at a flat
# attrition rate if it isn't backfilled. Assumptions are returned so the UI can show them.
def horizon_years(db: Session) -> int:
    return int(calc_config.config(db).num("projection.horizon_years", 5))


def _driver_growth(cfg: CalcConfig, volume: float | None, forecast: float | None) -> float:
    """Per-driver YoY growth implied by the entity's own next-year forecast. With no forecast it
    falls back to the configured default rather than an invented trend."""
    v = float(volume or 0)
    f = float(forecast or 0)
    return f / v if v > 0 and f > 0 else cfg.num("projection.default_growth", 1.0)


def submission_projection(db: Session, submission: m.DepartmentSubmission, *,
                          years: int | None = None, base_year: int = 0, scenario: str = "base") -> dict:
    cfg = calc_config.config(db)
    years = years if years is not None else int(cfg.num("projection.horizon_years", 5))
    attrition = cfg.num("projection.attrition_rate", 0.08)
    rounding_rule = cfg.text("sizing.final_rounding", "round_half_up")
    drivers = (
        db.query(m.SubmissionDriver)
        .filter(m.SubmissionDriver.submission_id == submission.id).all()
    )
    floors = db.query(m.MandateFloor).filter(m.MandateFloor.submission_id == submission.id).all()
    floor_total = sum(int(f.positions or 0) for f in floors)
    # Year 0 must equal the point-in-time position, so the trajectory starts from the same AVAILABLE
    # FTE the gap is measured against — not the raw establishment.
    current = supply.available_fte(db, submission)

    points = []
    for i in range(years):
        build_up = 0.0
        for d in drivers:
            g = _driver_growth(cfg, d.volume, d.forecast)
            vol_i = float(d.volume or 0) * (g ** i)
            raw = driver_fte_raw(cfg, d.family, vol_i, d.params) * _scen_factor(cfg, scenario, d.family)
            build_up += _effective(cfg, d.family, raw)
        demand = int(apply_rounding(rounding_rule, max(build_up, float(floor_total))))
        # Demand rounds to whole posts; supply does not. Rounding supply here would put year 0 at a
        # different gap from the point-in-time position beside it — the same number, disagreeing
        # with itself on one screen.
        supply_i = round(current * ((1 - attrition) ** i), 2)
        points.append({"year": base_year + i, "demand": demand, "supply": supply_i,
                       "gap": round(supply_i - demand, 2)})
    return {"points": points, "years": years, "base_year": base_year}


def _sum_projection_points(projs: list[dict], base_year: int, years: int) -> list[dict]:
    pts = []
    for i in range(years):
        demand = sum(p["points"][i]["demand"] for p in projs if i < len(p["points"]))
        supply_i = round(sum(p["points"][i]["supply"] for p in projs if i < len(p["points"])), 2)
        pts.append({"year": base_year + i, "demand": demand, "supply": supply_i,
                    "gap": round(supply_i - demand, 2)})
    return pts


def _assumptions(cfg: CalcConfig) -> dict:
    """Composed from the parameter rows that actually drove the projection, so the stated assumption
    can never drift from the number beside it."""
    attrition = cfg.num("projection.attrition_rate", 0.08)
    a = cfg.params.get("projection.attrition_rate")
    return {
        "demand": "Demand grown from each department's own 12-month forecast, compounded.",
        "supply": f"Supply held at today's FTE, less {round(attrition * 100, 1):g}% annual attrition "
                  f"if unbackfilled.",
        "horizon_years": int(cfg.num("projection.horizon_years", 5)),
        "note": "Projected: rule-based, not a black-box forecast.",
        "attrition_source": a.source if a else "",
    }


def entity_projection(db: Session, entity_id: int, *, received_only: bool = True,
                      base_year: int = 0, scenario: str = "base", years: int | None = None) -> dict:
    cfg = calc_config.config(db)
    years = years if years is not None else int(cfg.num("projection.horizon_years", 5))
    depts = db.query(m.Department).filter(m.Department.entity_id == entity_id).all()
    projs = []
    for dept in depts:
        sub = active_submission(db, dept.id)
        if not sub or (received_only and sub.status not in RECEIVED):
            continue
        projs.append(submission_projection(db, sub, years=years, base_year=base_year, scenario=scenario))
    return {"points": _sum_projection_points(projs, base_year, years),
            "assumptions": _assumptions(cfg), "departments_counted": len(projs)}


def government_projection(db: Session, *, basis: str = "received", base_year: int = 0,
                          scenario: str = "base", years: int | None = None) -> dict:
    cfg = calc_config.config(db)
    years = years if years is not None else int(cfg.num("projection.horizon_years", 5))
    ids = counted_department_ids(db, basis)
    projs = []
    for dept_id in sorted(ids):
        # basis_submission, NOT active_submission: the ids were selected at this basis, so the
        # versions must be read at it too. Where v1 is approved and v2 is in flight, the approved
        # basis picks v1 — reading v2 here would project a curve the position never claimed.
        sub = basis_submission(db, dept_id, basis)
        if sub:
            projs.append(submission_projection(db, sub, years=years, base_year=base_year, scenario=scenario))
    assumptions = _assumptions(cfg)
    if basis == "estimated":
        # The trajectory is driven by each department's OWN forecast volumes. An outstanding
        # department has none, so it is left out rather than given an invented growth curve.
        assumptions["coverage"] = ("Covers the departments that have actually submitted; estimated "
                                   "departments have no forecast volumes to project.")
    return {"points": _sum_projection_points(projs, base_year, years),
            "assumptions": assumptions, "departments_counted": len(projs), "basis": basis}

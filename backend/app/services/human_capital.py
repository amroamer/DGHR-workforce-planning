"""Human Capital rollups.

Layers workforce demographics — headcount, job-level mix, Emiratization %, and annual cost —
on top of the sizing model. Reads `SubmissionWorkforceRow` (entered in the stepper's
'Workforce profile' step) and rolls it up submission → entity → government, mirroring the
received-only rule used by services/sizing.py so the Human Capital Overview reconciles with the
Government Position.

No fabricated numbers: every figure is a sum of what entities actually entered.
"""
from __future__ import annotations

import math

from sqlalchemy.orm import Session

from app import models as m
from app.services import sizing, supply

# The 4 job levels (reference: Managers / Professionals / Associate Professionals / Clerical Support & Below)
JOB_LEVELS = [
    {"key": "managers", "label": "Managers"},
    {"key": "professionals", "label": "Professionals"},
    {"key": "associate_professionals", "label": "Associate Professionals"},
    {"key": "clerical_support", "label": "Clerical Support & Below"},
]
LEVEL_KEYS = [lv["key"] for lv in JOB_LEVELS]
LEVEL_LABEL = {lv["key"]: lv["label"] for lv in JOB_LEVELS}

# Standard annual cost per FTE by level (AED). Used to seed and to impute a row's cost if omitted.
COST_PER_FTE = {
    "managers": 620_000,
    "professionals": 380_000,
    "associate_professionals": 240_000,
    "clerical_support": 150_000,
}

# ── seed helpers (a realistic demographic profile derived from a department's headcount) ──
_LEVEL_WEIGHTS = {"managers": 0.12, "professionals": 0.33, "associate_professionals": 0.35, "clerical_support": 0.20}
_EMIRATI_BASE = {"managers": 0.46, "professionals": 0.34, "associate_professionals": 0.27, "clerical_support": 0.18}


def _clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))


# Part-timers don't sit evenly across a hierarchy — they cluster in clerical and professional roles,
# not in management. Ordered by who absorbs them first.
_PART_TIME_ORDER = ("clerical_support", "professionals", "associate_professionals", "managers")


def _split_int(total: int, weights: dict[str, float]) -> dict[str, int]:
    """Largest-remainder split so the parts sum EXACTLY to `total`."""
    exact = {k: weights[k] * total for k in LEVEL_KEYS}
    out = {k: int(math.floor(v)) for k, v in exact.items()}
    order = sorted(LEVEL_KEYS, key=lambda k: exact[k] - math.floor(exact[k]), reverse=True)
    for i in range(max(0, total - sum(out.values()))):
        out[order[i % len(order)]] += 1
    return out


def build_workforce_rows(headcount_total: int, *, emirati_factor: float = 1.0,
                         part_time_heads: int = 0) -> list[dict]:
    """One row per job level, carrying PEOPLE and TIME as separate measures.

    `headcount_total` is bodies. `part_time_heads` of them work half time, so the department's FTE
    comes out below its headcount — which is the whole point of the split: this function used to be
    handed a department's FTE and simply declare it to be the headcount, making the two impossible
    to tell apart. `emirati_factor` shifts Emiratization per entity so the government view has spread.
    """
    headcount_total = int(round(headcount_total))
    if headcount_total <= 0:
        return [{"job_level": k, "headcount": 0, "fte": 0.0, "emirati_count": 0,
                 "annual_cost_aed": 0.0, "position": i} for i, k in enumerate(LEVEL_KEYS)]

    heads = _split_int(headcount_total, _LEVEL_WEIGHTS)

    # Seat the part-timers, clerical first, never more than a level actually holds.
    remaining = max(0, min(int(part_time_heads), headcount_total))
    part_time = {k: 0 for k in LEVEL_KEYS}
    for k in _PART_TIME_ORDER:
        if remaining <= 0:
            break
        take = min(remaining, heads[k])
        part_time[k] = take
        remaining -= take

    rows = []
    for i, k in enumerate(LEVEL_KEYS):
        hc = heads[k]
        fte = round(hc - 0.5 * part_time[k], 2)      # a half-timer is 1 person, 0.5 FTE
        emr = int(round(hc * _clamp(_EMIRATI_BASE[k] * emirati_factor)))
        rows.append({"job_level": k, "headcount": hc, "fte": fte, "emirati_count": min(emr, hc),
                     # Cost follows TIME, not bodies — you don't pay a half-timer a full salary.
                     "annual_cost_aed": round(fte * COST_PER_FTE[k], 2), "position": i})
    return rows


# S3: the per-position breakdown under the total FTE. Each job level splits into named roles carrying
# a grade band (on the general 1-15 scale) and a seniority tier; directors and managers are the
# "structurally driven" roles surfaced on S5. Roles sum to the department's headcount.
_ROLE_TEMPLATE = [
    # (job_level, role, seniority, grade_band, share_of_level)
    ("managers", "Director", "director", "Grades 13-15", 0.4),
    ("managers", "Manager", "manager", "Grades 11-13", 0.6),
    ("professionals", "Senior Specialist", "staff", "Grades 9-11", 0.45),
    ("professionals", "Specialist", "staff", "Grades 7-9", 0.55),
    ("associate_professionals", "Officer", "staff", "Grades 5-7", 1.0),
    ("clerical_support", "Support & Administration", "staff", "Grades 1-5", 1.0),
]


def build_position_rows(headcount_total: int, *, seed_i: int = 0) -> list[dict]:
    heads = _split_int(int(round(max(0, headcount_total))), _LEVEL_WEIGHTS)
    rows: list[dict] = []
    pos = 0
    for level in LEVEL_KEYS:
        tmpl = [t for t in _ROLE_TEMPLATE if t[0] == level]
        weights = {t[1]: t[4] for t in tmpl}
        split = _largest_remainder(heads[level], weights) if heads[level] else {t[1]: 0 for t in tmpl}
        for (_lv, role, seniority, grade, _share) in tmpl:
            rows.append({
                "role": role, "grade_band": grade, "job_level": level, "seniority": seniority,
                "structural": seniority in m.STRUCTURAL_SENIORITY,
                "headcount": int(split.get(role, 0)), "position": pos,
            })
            pos += 1
    return rows


# ── read-side rollups ──
def _blank_levels() -> dict[str, dict]:
    return {k: {"headcount": 0, "fte": 0.0, "emirati_count": 0, "cost": 0.0} for k in LEVEL_KEYS}


def _summarize(levels: dict[str, dict]) -> dict:
    headcount = sum(v["headcount"] for v in levels.values())
    fte = round(sum(v["fte"] for v in levels.values()), 2)
    emirati = sum(v["emirati_count"] for v in levels.values())
    cost = sum(v["cost"] for v in levels.values())
    by_level = [{
        "key": k, "label": LEVEL_LABEL[k],
        "headcount": levels[k]["headcount"],
        "fte": round(levels[k]["fte"], 2),
        "emirati_count": levels[k]["emirati_count"],
        "cost": round(levels[k]["cost"], 2),
        "pct": round(levels[k]["headcount"] / headcount * 100, 1) if headcount else 0,
        "emiratization_pct": round(levels[k]["emirati_count"] / levels[k]["headcount"] * 100, 1) if levels[k]["headcount"] else 0,
    } for k in LEVEL_KEYS]
    return {
        "headcount": headcount,
        # Establishment FTE — the time behind those people. Below headcount wherever part-timers sit.
        "fte": fte,
        "part_time_fte_gap": round(headcount - fte, 2),
        "emirati_count": emirati,
        "emiratization_pct": round(emirati / headcount * 100, 1) if headcount else 0,
        "annual_cost_aed": round(cost, 2),
        # Per PERSON and per FTE are different questions and part-time makes them diverge, so report
        # both rather than let one label stand in for the other.
        "cost_per_head": round(cost / headcount) if headcount else 0,
        "cost_per_fte": round(cost / fte) if fte else 0,
        "by_level": by_level,
    }


def _rows_for_submission(db: Session, submission_id: int) -> list[m.SubmissionWorkforceRow]:
    return (
        db.query(m.SubmissionWorkforceRow)
        .filter(m.SubmissionWorkforceRow.submission_id == submission_id)
        .order_by(m.SubmissionWorkforceRow.position, m.SubmissionWorkforceRow.id)
        .all()
    )


def _accumulate(levels: dict[str, dict], rows: list[m.SubmissionWorkforceRow]) -> None:
    for r in rows:
        if r.job_level not in levels:
            continue
        levels[r.job_level]["headcount"] += int(r.headcount or 0)
        levels[r.job_level]["fte"] += float(r.fte or 0)
        levels[r.job_level]["emirati_count"] += int(r.emirati_count or 0)
        levels[r.job_level]["cost"] += float(r.annual_cost_aed or 0)


def submission_human_capital(db: Session, submission: m.DepartmentSubmission) -> dict:
    levels = _blank_levels()
    _accumulate(levels, _rows_for_submission(db, submission.id))
    out = _summarize(levels)
    out["has_data"] = out["headcount"] > 0
    return out


def entity_human_capital(db: Session, entity_id: int, *, received_only: bool = True) -> dict:
    depts = db.query(m.Department).filter(m.Department.entity_id == entity_id).all()
    levels = _blank_levels()
    dept_rows = []
    supplies: list[dict] = []
    sub_ids: list[int] = []
    counted = 0
    for dept in depts:
        sub = sizing.active_submission(db, dept.id)
        rows = _rows_for_submission(db, sub.id) if sub else []
        include = bool(sub) and (not received_only or sub.status in sizing.RECEIVED)
        if include:
            supplies.append(supply.submission_supply(db, sub))
            sub_ids.append(sub.id)
        d_levels = _blank_levels()
        if rows:
            _accumulate(d_levels, rows)
        d_sum = _summarize(d_levels)
        dept_rows.append({
            "department_id": dept.id, "name": dept.name,
            "status": sub.status if sub else "no_submission",
            "headcount": d_sum["headcount"], "fte": d_sum["fte"],
            "emiratization_pct": d_sum["emiratization_pct"],
            "annual_cost_aed": d_sum["annual_cost_aed"],
        })
        if include and rows:
            _accumulate(levels, rows)
            counted += 1
    out = _summarize(levels)
    out["entity_id"] = entity_id
    out["departments"] = dept_rows
    out["departments_counted"] = counted
    out["has_data"] = out["headcount"] > 0
    out["supply"] = supply._sum_supply(supplies)
    # S5/S9: the structurally-driven roles count and the tenure distribution alongside job levels.
    out["structural_roles"] = structural_summary(db, sub_ids)
    out["tenure"] = _band_rollup(db, sub_ids).get("tenure", [])
    return out


# ── S3/S5: per-position breakdown, structural roles ──
def _position_rows_for(db: Session, submission_ids: list[int]) -> list[m.SubmissionPositionRow]:
    if not submission_ids:
        return []
    return (db.query(m.SubmissionPositionRow)
            .filter(m.SubmissionPositionRow.submission_id.in_(submission_ids))
            .order_by(m.SubmissionPositionRow.position, m.SubmissionPositionRow.id).all())


def positions_detail(db: Session, submission_id: int) -> list[dict]:
    """S3: the scrollable per-position breakdown for one submission (role, grade band, headcount)."""
    return [{"role": r.role, "grade_band": r.grade_band, "job_level": r.job_level,
             "seniority": r.seniority, "structural": bool(r.structural), "headcount": int(r.headcount)}
            for r in _position_rows_for(db, [submission_id]) if r.headcount > 0]


def structural_summary(db: Session, submission_ids: list[int]) -> dict:
    """S5: structurally-driven roles (managers, directors, EDs, DGs, CEOs) rolled up: total + by role."""
    by_role: dict[str, int] = {}
    total = 0
    for r in _position_rows_for(db, submission_ids):
        if r.structural and r.headcount:
            by_role[r.role] = by_role.get(r.role, 0) + int(r.headcount)
            total += int(r.headcount)
    return {"count": total,
            "by_role": [{"role": k, "headcount": v} for k, v in sorted(by_role.items(), key=lambda x: -x[1])]}


# ═══════════════════════ demographic bands (HC Overview donuts) ═══════════════════════
# Each dimension partitions the department's FILLED headcount into buckets that sum back to it, so a
# donut can never disagree with the headcount it splits. Buckets carry a stable key + a display label;
# `weights` seed a realistic distribution (nationality is special — its Emirati bucket is the REAL
# emirati_count, so the nationality donut's Emirati slice equals the Emiratization %).
WORKFORCE_BANDS: dict[str, dict] = {
    "gender": {
        "label": "Gender",
        "buckets": [("female", "Female"), ("male", "Male")],
        "weights": {"female": 0.42, "male": 0.58},
    },
    "age_band": {
        "label": "Age",
        "buckets": [("under_30", "Under 30"), ("30_50", "30–50"), ("over_50", "Over 50")],
        "weights": {"under_30": 0.26, "30_50": 0.60, "over_50": 0.14},
    },
    "grade_band": {
        "label": "Grade / wage band",
        "buckets": [("g_high", "Senior, >30k AED/mo"), ("g_mid", "Mid, 20–30k"),
                    ("g_low", "Junior, 10–20k"), ("g_entry", "Entry, <10k")],
        "weights": {"g_high": 0.12, "g_mid": 0.30, "g_low": 0.36, "g_entry": 0.22},
    },
    "region": {
        "label": "Duty station",
        "buckets": [("deira", "Deira"), ("bur_dubai", "Bur Dubai"),
                    ("jebel_ali", "Jebel Ali"), ("hatta", "Hatta")],
        "weights": {"deira": 0.34, "bur_dubai": 0.40, "jebel_ali": 0.18, "hatta": 0.08},
    },
    "nationality": {
        "label": "Nationality mix",
        # emirati is not weighted — it is taken from the real emirati_count; the rest split the remainder
        "buckets": [("emirati", "Emirati"), ("gcc", "GCC"), ("arab", "Other Arab"),
                    ("asian", "Asian"), ("other", "Other")],
        "weights": {"gcc": 0.11, "arab": 0.27, "asian": 0.50, "other": 0.12},
    },
    # S5/S9: tenure distribution alongside the job-level distribution.
    "tenure": {
        "label": "Tenure",
        "buckets": [("t_lt2", "Under 2 yrs"), ("t_2_5", "2–5 yrs"),
                    ("t_5_10", "5–10 yrs"), ("t_gt10", "Over 10 yrs")],
        "weights": {"t_lt2": 0.18, "t_2_5": 0.30, "t_5_10": 0.30, "t_gt10": 0.22},
    },
}
BAND_DIMENSIONS = tuple(WORKFORCE_BANDS.keys())
BAND_LABEL = {dim: spec["label"] for dim, spec in WORKFORCE_BANDS.items()}
_BUCKET_LABEL = {(dim, k): lbl for dim, spec in WORKFORCE_BANDS.items() for k, lbl in spec["buckets"]}


def _largest_remainder(total: int, weights: dict[str, float]) -> dict[str, int]:
    """Split `total` across weighted buckets so the integer parts sum EXACTLY to `total`."""
    keys = list(weights.keys())
    s = sum(weights.values()) or 1.0
    exact = {k: weights[k] / s * total for k in keys}
    out = {k: int(math.floor(v)) for k, v in exact.items()}
    order = sorted(keys, key=lambda k: exact[k] - math.floor(exact[k]), reverse=True)
    for i in range(max(0, total - sum(out.values()))):
        out[order[i % len(order)]] += 1
    return out


def build_workforce_bands(filled: int, emirati_total: int, *, seed_i: int = 0) -> list[dict]:
    """One row per (dimension, bucket) for a department, each dimension summing to `filled`.

    Deterministic (no RNG) with a per-department tilt from `seed_i`, so the government view has spread
    while a re-seed reproduces the demo exactly. `emirati_total` fixes the nationality Emirati bucket
    to the department's real Emirati headcount, so the nationality donut reconciles with Emiratization.
    """
    filled = int(round(max(0, filled)))
    rows: list[dict] = []
    for dim, spec in WORKFORCE_BANDS.items():
        weights = dict(spec["weights"])
        if dim == "gender":  # tilt female share 0.38–0.50 per department for realistic range
            f = 0.38 + (seed_i % 5) * 0.03
            weights = {"female": f, "male": 1 - f}
        if dim == "tenure":  # tilt the newest-joiner share per department so the aggregate has spread
            lt2 = 0.12 + (seed_i % 4) * 0.04
            weights = {"t_lt2": lt2, "t_2_5": 0.30, "t_5_10": 0.30, "t_gt10": max(0.10, 1 - lt2 - 0.60)}
        if dim == "nationality":
            emr = max(0, min(int(emirati_total), filled))
            rest = _largest_remainder(filled - emr, spec["weights"])
            counts = {"emirati": emr, **rest}
        else:
            counts = _largest_remainder(filled, weights)
        for pos, (bucket, label) in enumerate(spec["buckets"]):
            rows.append({"dimension": dim, "bucket": bucket, "label": label,
                         "headcount": int(counts.get(bucket, 0)), "position": pos})
    return rows


def _band_rollup(db: Session, submission_ids: list[int]) -> dict[str, list[dict]]:
    """Sum band headcount per (dimension, bucket) across the given submissions → donut data,
    ordered by the canonical bucket order, each bucket carrying its share of the dimension total."""
    out: dict[str, dict[str, int]] = {dim: {k: 0 for k, _ in WORKFORCE_BANDS[dim]["buckets"]}
                                      for dim in BAND_DIMENSIONS}
    if submission_ids:
        rows = (db.query(m.SubmissionWorkforceBand)
                .filter(m.SubmissionWorkforceBand.submission_id.in_(submission_ids)).all())
        for r in rows:
            if r.dimension in out and r.bucket in out[r.dimension]:
                out[r.dimension][r.bucket] += int(r.headcount or 0)
    result: dict[str, list[dict]] = {}
    for dim in BAND_DIMENSIONS:
        total = sum(out[dim].values())
        result[dim] = [{
            "bucket": k, "label": _BUCKET_LABEL[(dim, k)], "headcount": out[dim][k],
            "pct": round(out[dim][k] / total * 100, 1) if total else 0.0,
        } for k, _ in WORKFORCE_BANDS[dim]["buckets"]]
    return result


def counted_submission_ids(db: Session, basis: str = "received") -> list[int]:
    """Submission ids the government position counts under `basis` — the SAME versions the headline
    and Human Capital stand on (via sizing.counted_department_ids + basis_submission), so the demographic
    donuts cover exactly those departments and can't drift from the number beside them."""
    ids = sizing.counted_department_ids(db, basis)
    subs = [sizing.basis_submission(db, dept_id, basis) for dept_id in ids]
    return [s.id for s in subs if s]


def entity_submission_ids(db: Session, entity_id: int, *, received_only: bool = False) -> list[int]:
    """Active submission ids for one entity's departments — mirrors entity_human_capital's scope
    (received_only=False counts drafts, so the donuts reconcile with the entity page's headcount)."""
    out: list[int] = []
    for dept in db.query(m.Department).filter(m.Department.entity_id == entity_id).all():
        sub = sizing.active_submission(db, dept.id)
        if sub and (not received_only or sub.status in sizing.RECEIVED):
            out.append(sub.id)
    return out


def government_human_capital(db: Session, *, basis: str = "received") -> dict:
    """Government-wide workforce profile, on the SAME basis as the position it sits beside.

    Filters through sizing.counted_department_ids so this panel and the headline can never disagree
    about which departments they cover. Under the `estimated` basis that set is the received actuals:
    an outstanding department has no submitted workforce rows, and an Emiratization rate or job-level
    mix cannot be modelled from a headcount — so the panel reports its own coverage instead.
    """
    ids = sizing.counted_department_ids(db, basis)
    levels = _blank_levels()
    entity_rows = []
    supplies: list[dict] = []
    for e in db.query(m.Entity).order_by(m.Entity.name).all():
        e_levels = _blank_levels()
        e_supplies: list[dict] = []
        for dept in db.query(m.Department).filter(m.Department.entity_id == e.id).all():
            if dept.id not in ids:
                continue
            # Read the version the basis selected — the approved basis reads v1 where a v2 is in
            # flight, so this panel stands on the same version as the headline beside it.
            sub = sizing.basis_submission(db, dept.id, basis)
            rows = _rows_for_submission(db, sub.id) if sub else []
            if rows:
                _accumulate(e_levels, rows)
                _accumulate(levels, rows)
            if sub:
                s = supply.submission_supply(db, sub)
                e_supplies.append(s)
                supplies.append(s)
        eh = _summarize(e_levels)
        es = supply._sum_supply(e_supplies)
        entity_rows.append({
            "entity_id": e.id, "name": e.name, "code": e.code,
            "headcount": eh["headcount"], "fte": eh["fte"],
            "emiratization_pct": eh["emiratization_pct"],
            "annual_cost_aed": eh["annual_cost_aed"],
            "approved_positions": es["approved_positions"], "vacancies": es["vacancies"],
            "available_fte": es["available_fte"],
        })
    out = _summarize(levels)
    out["entities"] = entity_rows
    out["has_data"] = out["headcount"] > 0
    out["departments_counted"] = len(ids)
    out["basis"] = basis
    # The establishment → people → adjustments → available chain, government-wide. Lives beside the
    # demographics because they answer the same question ("what supply do we have?") and must agree.
    out["supply"] = supply._sum_supply(supplies)
    return out


# ═══════════════════════ S1: page-top filters (scope + one filter) ═══════════════════════
def _received_sub_ids(db: Session, *, basis: str = "received", entity_id: int | None = None) -> list[int]:
    """Received (counted) submission ids for the scope — one entity, or government-wide."""
    ids = sizing.counted_department_ids(db, basis)
    q = db.query(m.Department)
    if entity_id is not None:
        q = q.filter(m.Department.entity_id == entity_id)
    out: list[int] = []
    for dept in q.all():
        if dept.id not in ids:
            continue
        sub = sizing.basis_submission(db, dept.id, basis)
        if sub:
            out.append(sub.id)
    return out


def filtered_human_capital(db: Session, *, basis: str = "received", entity_id: int | None = None,
                           job_level: str | None = None, dim: str | None = None,
                           bucket: str | None = None) -> dict:
    """S1 page-top filters: the Human Capital view sliced by scope plus one filter.

    entity_id scopes the workforce; job_level keeps one level (EXACT, from the workforce rows); a
    demographic dim+bucket re-slices headcount EXACTLY (from the band) and scales FTE / Emirati / cost
    proportionally (a modelled slice — demographics are held as headcount distributions, not per
    person). Demand is workload-driven and is NOT touched here.
    """
    sub_ids = _received_sub_ids(db, basis=basis, entity_id=entity_id)
    levels = _blank_levels()
    supplies: list[dict] = []
    for sid in sub_ids:
        _accumulate(levels, _rows_for_submission(db, sid))
        s = db.get(m.DepartmentSubmission, sid)
        if s:
            supplies.append(supply.submission_supply(db, s))

    applied: dict = {}
    if job_level and job_level in levels:
        levels = {k: (levels[k] if k == job_level else {"headcount": 0, "fte": 0.0, "emirati_count": 0, "cost": 0.0})
                  for k in LEVEL_KEYS}
        applied["job_level"] = job_level

    out = _summarize(levels)
    bands = _band_rollup(db, sub_ids)

    if dim and bucket and dim in bands:
        total_hc = sum(b["headcount"] for b in bands[dim]) or 1
        sel = next((b for b in bands[dim] if b["bucket"] == bucket), None)
        f_hc = sel["headcount"] if sel else 0
        share = f_hc / total_hc
        exact_emirati = (dim == "nationality" and bucket == "emirati")
        f_fte = round(out["fte"] * share, 2)
        f_emirati = f_hc if exact_emirati else round(out["emirati_count"] * share)
        f_cost = round(out["annual_cost_aed"] * share, 2)
        out = {
            **out,
            "headcount": f_hc, "fte": f_fte,
            "part_time_fte_gap": round(f_hc - f_fte, 2),
            "emirati_count": f_emirati,
            "emiratization_pct": round(f_emirati / f_hc * 100, 1) if f_hc else 0,
            "annual_cost_aed": f_cost,
            "cost_per_head": round(f_cost / f_hc) if f_hc else 0,
            "cost_per_fte": round(f_cost / f_fte) if f_fte else 0,
        }
        applied.update({"dimension": dim, "bucket": bucket, "approximate": not exact_emirati})

    out["structural_roles"] = structural_summary(db, sub_ids)
    out["tenure"] = bands.get("tenure", [])
    out["supply"] = supply._sum_supply(supplies)
    out["has_data"] = bool(sub_ids) and out["headcount"] > 0
    out["entities"] = []
    out["entity_id"] = entity_id
    out["departments_counted"] = len(sub_ids)
    out["filters_applied"] = applied
    return out

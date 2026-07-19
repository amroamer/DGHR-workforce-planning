"""Executive analytics — the three DGHR dashboards (Human Capital Overview, Demand Analysis,
Supply Analysis).

This module is a COMPOSITION layer: it invents no numbers of its own for the live panels. Every live
figure is pulled from the existing engine —
  - `human_capital.government_human_capital` / `entity_human_capital`  → headcount, job-level mix,
    Emiratization, cost, and (via `_band_rollup`) the demographic donuts,
  - `sizing.government_sizing` / `entity_sizing`                        → required vs available FTE,
    gap, family split, by-typeset,
  - `sizing.government_projection` / `entity_projection`               → the multi-year trajectory,
— all filtered through the SAME `basis` the Government Position uses, so a dashboard number can never
disagree with the headline it sits beside.

The residue the platform does not collect (skill trends, hiring companies, graduate mix, universities,
global hotspots) is read from `MarketReference` and returned with `live=False` so the UI stamps an
"Illustrative reference" chip. The hybrid boundary is explicit in every payload.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app import models as m
from app.services import calc_config, human_capital, sizing
from app.services.human_capital import JOB_LEVELS, LEVEL_KEYS, LEVEL_LABEL


# ─────────────────────────── shared helpers ───────────────────────────
def _reporting_period(db: Session) -> dict:
    cycle = db.query(m.CollectionCycle).first()
    year = cycle.starts_on.year if cycle and cycle.starts_on else 2026
    return {"label": cycle.name if cycle else f"FY{year}", "year": year}


def _level_weights(by_level: list[dict]) -> dict[str, float]:
    """Share of each job level by FTE (fallback headcount, then equal) — used to split a projected
    total across the four levels for the 'by Job Level' stacks."""
    w = {lv["key"]: float(lv.get("fte") or lv.get("headcount") or 0) for lv in by_level}
    s = sum(w.values())
    if s <= 0:
        return {k: 1 / len(LEVEL_KEYS) for k in LEVEL_KEYS}
    return {k: (w.get(k, 0) / s) for k in LEVEL_KEYS}


def _split_float(total: float, weights: dict[str, float]) -> dict[str, float]:
    """Proportional split (1 dp) with the rounding drift folded into the largest slice, so the
    stacked bar sums back to the year total on screen."""
    raw = {k: round(total * weights.get(k, 0), 1) for k in LEVEL_KEYS}
    drift = round(total - sum(raw.values()), 1)
    if raw:
        big = max(LEVEL_KEYS, key=lambda k: raw[k])
        raw[big] = round(raw[big] + drift, 1)
    return raw


def _by_level_series(points: list[dict], field: str, by_level: list[dict]) -> list[dict]:
    """One row per projection year: the year's `field` (demand|supply) split across the four levels."""
    weights = _level_weights(by_level)
    out = []
    for p in points:
        row = {"year": p["year"]}
        row.update(_split_float(float(p.get(field) or 0), weights))
        out.append(row)
    return out


def _gap_by_level(points: list[dict], by_level: list[dict]) -> list[dict]:
    """Per-level demand/supply/gap trajectory — the 'Demand–Supply Gap by Job Level' dual line.
    Demand and supply are each split by the level weights, so the level gaps sum to the total gap."""
    weights = _level_weights(by_level)
    series = []
    for lv in JOB_LEVELS:
        k = lv["key"]
        pts = []
        for p in points:
            d = round(float(p.get("demand") or 0) * weights.get(k, 0), 1)
            s = round(float(p.get("supply") or 0) * weights.get(k, 0), 1)
            pts.append({"year": p["year"], "demand": d, "supply": s, "gap": round(s - d, 1)})
        series.append({"key": k, "label": lv["label"], "points": pts})
    return series


def _typeset_rows(db: Session, dept_rows: list[dict]) -> list[dict]:
    """Group entity department rows by typeset name (the entity-scope equivalent of
    government_sizing.by_typeset, which only exists government-wide)."""
    names = {t.id: t.name for t in db.query(m.Typeset).all()}
    grouped: dict[str, dict] = {}
    for d in dept_rows:
        if d.get("required_fte") is None:
            continue
        name = names.get(d.get("typeset_id")) or "Unclassified"
        g = grouped.setdefault(name, {"typeset": name, "departments": 0, "current_fte": 0.0,
                                      "required_fte": 0, "gap": 0.0})
        g["departments"] += 1
        g["current_fte"] += float(d.get("current_fte") or 0)
        g["required_fte"] += int(d.get("required_fte") or 0)
    for g in grouped.values():
        g["gap"] = round(g["current_fte"] - g["required_fte"], 1)
        g["current_fte"] = round(g["current_fte"], 1)
    return sorted(grouped.values(), key=lambda x: -x["required_fte"])


def _typeset_growth(db: Session, submission_ids: list[int], scenario: str) -> list[dict]:
    """Real growing/declining signal: planning change (forecast − current required FTE) aggregated by
    typeset across the counted submissions. Positive = growing, negative = declining."""
    names = {t.id: t.name for t in db.query(m.Typeset).all()}
    agg: dict[str, dict] = {}
    for sid in submission_ids:
        sub = db.get(m.DepartmentSubmission, sid)
        if not sub:
            continue
        dept = db.get(m.Department, sub.department_id)
        name = names.get(dept.typeset_id) if dept else None
        if not name:
            continue
        sz = sizing.submission_sizing(db, sub, scenario)
        g = agg.setdefault(name, {"typeset": name, "required_fte": 0, "planning_change": 0})
        g["required_fte"] += int(sz["required_fte"])
        g["planning_change"] += int(sz["planning_change"])
    rows = []
    for g in agg.values():
        req = g["required_fte"] or 1
        rows.append({**g, "pct_change": round(g["planning_change"] / req * 100, 1)})
    return sorted(rows, key=lambda x: -x["pct_change"])


def market(db: Session, kind: str, *, scope: str | None = None) -> list[dict]:
    """Illustrative reference rows for a kind, ordered by rank. Never rolled up from submissions."""
    q = db.query(m.MarketReference).filter(m.MarketReference.kind == kind)
    if scope is not None:
        q = q.filter(m.MarketReference.scope == scope)
    rows = q.order_by(m.MarketReference.rank, m.MarketReference.id).all()
    return [{
        "bucket": r.bucket, "label": r.label,
        "value": float(r.value_numeric) if r.value_numeric is not None else None,
        "value_text": r.value_text,
        "pct_change": float(r.pct_change) if r.pct_change is not None else None,
        "rank": r.rank, "scope": r.scope, "meta": r.meta or {},
    } for r in rows]


def _cost_series(points: list[dict], annual_cost_aed: float, establishment_fte: float) -> list[dict]:
    """Projected employee cost to staff the required workforce each year = demand × blended cost/FTE
    (the blended rate is today's total cost ÷ today's establishment FTE — real, from the collected
    cost)."""
    blended = (annual_cost_aed / establishment_fte) if establishment_fte else 0.0
    return [{"year": p["year"], "cost_aed": round(float(p.get("demand") or 0) * blended)} for p in points]


# ─────────────────────────── scope resolution ───────────────────────────
def _scope(db: Session, *, basis: str, scenario: str, entity_id: int | None):
    """Returns (hc, sizing_dict, projection, submission_ids, scope_meta) for the requested scope.
    Government uses the selected basis; a single entity counts all its departments (drafts included),
    matching entity_human_capital / the DGHR entity page so a drill-down reconciles with the aggregate."""
    by = _reporting_period(db)["year"]
    if entity_id is not None:
        ent = db.get(m.Entity, entity_id)
        hc = human_capital.entity_human_capital(db, entity_id, received_only=False)
        szd = sizing.entity_sizing(db, entity_id, received_only=False, scenario=scenario)
        proj = sizing.entity_projection(db, entity_id, received_only=False, base_year=by, scenario=scenario)
        ids = human_capital.entity_submission_ids(db, entity_id, received_only=False)
        scope = {"kind": "entity",
                 "entity": {"id": ent.id, "name": ent.name, "code": ent.code} if ent else None,
                 "label": ent.name if ent else "Entity"}
        by_typeset = _typeset_rows(db, szd["departments"])
        entities = []
        totals = szd["totals"]
    else:
        hc = human_capital.government_human_capital(db, basis=basis)
        gov = sizing.government_sizing(db, basis=basis, scenario=scenario)
        proj = sizing.government_projection(db, basis=basis, base_year=by, scenario=scenario)
        ids = human_capital.counted_submission_ids(db, basis)
        scope = {"kind": "government", "entity": None, "label": "Government-wide"}
        by_typeset = gov["by_typeset"]
        entities = gov["entities"]
        totals = gov["totals"]
    return hc, {"totals": totals, "by_typeset": by_typeset, "entities": entities}, proj, ids, scope


def _base(db, hc, szd, proj, ids, scope, basis, scenario) -> dict:
    """The block every dashboard shares: identity, headline demographics, and the counted coverage."""
    return {
        "scope": scope, "basis": basis, "scenario": scenario,
        "reporting_period": _reporting_period(db),
        "scenarios": calc_config.scenario_options(db),
        "bases": list(sizing.BASES),
        "job_levels": JOB_LEVELS,
        "headcount": hc["headcount"], "fte": hc["fte"],
        "emirati_count": hc["emirati_count"], "emiratization_pct": hc["emiratization_pct"],
        "annual_cost_aed": hc["annual_cost_aed"], "cost_per_fte": hc["cost_per_fte"],
        "by_level": hc["by_level"],
        "has_data": bool(hc.get("has_data")),
        "departments_counted": len(ids),
    }


# ─────────────────────────── 1. Human Capital Overview ───────────────────────────
def human_capital_overview(db: Session, *, basis: str = "received", scenario: str = "base",
                           entity_id: int | None = None) -> dict:
    hc, szd, proj, ids, scope = _scope(db, basis=basis, scenario=scenario, entity_id=entity_id)
    pts = proj["points"]
    cfg = calc_config.config(db)
    out = _base(db, hc, szd, proj, ids, scope, basis, scenario)
    out.update({
        # panel 1 — Employment (FTEs): supply bars + demand (target) line
        "employment_series": [{"year": p["year"], "employment": p["supply"], "target": p["demand"]}
                              for p in pts],
        "employment_by_level": _by_level_series(pts, "supply", hc["by_level"]),
        # panel 2 — headline KPIs
        "employment_target": pts[-1]["demand"] if pts else szd["totals"]["required_fte"],
        "jobs_created": (pts[-1]["demand"] - pts[0]["demand"]) if len(pts) > 1 else 0,
        # panel 3 — Total Employee (FTE) Cost trend (Mn AED on screen)
        "cost_series": _cost_series(pts, hc["annual_cost_aed"], hc["fte"]),
        # panel 4 — gauges & demographic donuts
        "emiratization_target_pct": cfg.num("emiratization.target_pct", 40),
        "demographics": human_capital._band_rollup(db, ids),
        "band_labels": human_capital.BAND_LABEL,
        # panel 5 — Demand–Supply gap by job level
        "gap_by_level": _gap_by_level(pts, hc["by_level"]),
        "supply": hc.get("supply"),
        "assumptions": proj.get("assumptions"),
        "totals": szd["totals"],
    })
    return out


# ─────────────────────────── 2. Demand Analysis ───────────────────────────
def demand_analysis(db: Session, *, basis: str = "received", scenario: str = "base",
                    entity_id: int | None = None) -> dict:
    hc, szd, proj, ids, scope = _scope(db, basis=basis, scenario=scenario, entity_id=entity_id)
    pts = proj["points"]
    out = _base(db, hc, szd, proj, ids, scope, basis, scenario)
    total_req = sum(t["required_fte"] for t in szd["by_typeset"]) or 1
    # Top hiring need — entities (or the single entity's departments) ranked by shortfall to close.
    if scope["kind"] == "government":
        hiring = sorted(
            [{"name": e["name"], "code": e["code"], "need": max(0, -e["gap"]),
              "gap": e["gap"], "required_fte": e["required_fte"]}
             for e in szd["entities"] if e["counted"] > 0],
            key=lambda x: -x["need"])[:8]
    else:
        names = {t.id: t.name for t in db.query(m.Typeset).all()}
        hiring = sorted(
            [{"name": d["name"], "code": names.get(d.get("typeset_id"), ""),
              "need": max(0, -(d.get("gap") or 0)), "gap": d.get("gap") or 0,
              "required_fte": d.get("required_fte") or 0}
             for d in szd.get("entities", []) or []], key=lambda x: -x["need"])[:8]
        hiring = hiring or _hiring_from_departments(db, entity_id)
    out.update({
        # Overview (live)
        "projected_employment": [{"year": p["year"], "employment": p["demand"]} for p in pts],
        "projected_by_level": _by_level_series(pts, "demand", hc["by_level"]),
        "jobs_created": (pts[-1]["demand"] - pts[0]["demand"]) if len(pts) > 1 else 0,
        "region": human_capital._band_rollup(db, ids)["region"],
        # Jobs & Skills (hybrid)
        "job_categories": [{**t, "pct": round(t["required_fte"] / total_req * 100, 1)}
                           for t in szd["by_typeset"]],           # LIVE (typesets)
        "top_hiring": hiring,                                     # LIVE (entities/depts by shortfall)
        "growing_declining": _typeset_growth(db, ids, scenario),  # LIVE (planning change by typeset)
        # Illustrative reference
        "skills": {
            "growing": market(db, "skill_growing"),
            "declining": market(db, "skill_declining"),
            "breakout": market(db, "skill_breakout"),
        },
        "adjacent_jobs": market(db, "adjacent_job"),
        "notable_roles": market(db, "notable_role"),
    })
    return out


def _hiring_from_departments(db: Session, entity_id: int | None) -> list[dict]:
    if entity_id is None:
        return []
    names = {t.id: t.name for t in db.query(m.Typeset).all()}
    rows = sizing.entity_sizing(db, entity_id, received_only=False)["departments"]
    out = [{"name": d["name"], "code": names.get(d.get("typeset_id"), ""),
            "need": max(0, -(d.get("gap") or 0)), "gap": d.get("gap") or 0,
            "required_fte": d.get("required_fte") or 0}
           for d in rows if d.get("required_fte") is not None]
    return sorted(out, key=lambda x: -x["need"])[:8]


# ─────────────────────────── 3. Supply Analysis ───────────────────────────
def supply_analysis(db: Session, *, basis: str = "received", scenario: str = "base",
                    entity_id: int | None = None) -> dict:
    hc, szd, proj, ids, scope = _scope(db, basis=basis, scenario=scenario, entity_id=entity_id)
    pts = proj["points"]
    out = _base(db, hc, szd, proj, ids, scope, basis, scenario)
    out.update({
        # Overview (live): labour supply = available FTE eroded by attrition
        "labor_supply": [{"year": p["year"], "supply": p["supply"]} for p in pts],
        "labor_supply_by_level": _by_level_series(pts, "supply", hc["by_level"]),
        # where talent lands = the workforce job-level mix (live, derived)
        "destination_by_level": [{"key": lv["key"], "label": lv["label"], "pct": lv["pct"],
                                  "headcount": lv["headcount"]} for lv in hc["by_level"]],
        "assumptions": proj.get("assumptions"),
        # Graduate Analysis (illustrative reference)
        "graduates": {r["bucket"]: r for r in market(db, "graduates")},
        "education_level": market(db, "education_level"),
        "education_background": market(db, "education_background"),
        "university_majors": market(db, "university_major"),
        "grad_gender": market(db, "grad_gender"),
        "universities": {"local": market(db, "university", scope="local"),
                         "global": market(db, "university", scope="global")},
        "global_hotspots": market(db, "global_hotspot"),
    })
    return out

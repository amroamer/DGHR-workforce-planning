"""Cross-entity comparison — the Executive-Dashboard report that puts up to 5 entities side by side
on descriptive workforce-structure ratios.

Every figure is derived from the DB: department establishment FTE (Department.current_fte) grouped by
its typeset's support/core category for the structure ratios, and the entity's submitted workforce
profile (via human_capital.filtered_human_capital at the selected basis) for the management, seniority,
skill-mix and people ratios. Nothing is hardcoded — the metric labels/formats live here, and every
number is computed. Structure ratios have 100% coverage (current_fte exists for every department, even
entities that never submitted); workforce-mix ratios read null/"—" where a selected entity has no
submitted data at the chosen basis.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app import models as m
from app.services import calc_config, human_capital, sizing

MAX_ENTITIES = 5

# Metric catalog: (key, label, group, unit, format, higher_is_better, description).
# `key` doubles as the stats field the value is read from. `higher_is_better` is None for neutral
# structural ratios (there is no "good" management ratio in the abstract), True/False where a direction
# is meaningful (more Emiratization is better; a lower vacancy rate is better) — the frontend colours by it.
_METRICS: list[tuple] = [
    ("support_to_core", "Support-to-core FTE ratio", "Structure", "ratio", "ratio", None,
     "Corporate-support establishment FTE (corporate services + IT) per unit of core-service FTE."),
    ("support_share_pct", "Corporate-support share of FTE", "Structure", "%", "pct", None,
     "Share of establishment FTE in corporate-support functions (HR/finance/procurement/facilities + IT)."),
    ("establishment_fte", "Total establishment FTE", "Scale", "FTE", "fte", None,
     "Filled establishment FTE across all of the entity's departments."),
    ("headcount", "Workforce headcount", "Scale", "people", "count", None,
     "People in post across submitted departments at the selected basis."),
    ("annual_cost_aed", "Annual workforce cost", "Scale", "AED", "aed_m", None,
     "Total annual workforce cost across submitted departments."),
    ("cost_per_fte", "Cost per FTE", "Scale", "AED", "aed", False,
     "Annual workforce cost per FTE — sensitive to the seniority mix."),
    ("management_pct", "Management-to-total FTE", "Workforce mix", "%", "pct", None,
     "Managers as a share of total workforce FTE."),
    ("senior_mgmt_pct", "Senior-management ratio", "Workforce mix", "%", "pct", None,
     "Structural senior roles (director and above) as a share of headcount."),
    ("skilled_to_admin", "Skilled-to-admin ratio", "Workforce mix", "ratio", "ratio", True,
     "Professional + associate-professional FTE per unit of clerical/support (admin) FTE."),
    ("span_of_control", "Span of control", "Workforce mix", "staff/mgr", "number", None,
     "Non-management staff per manager (headcount)."),
    ("emiratization_pct", "Emiratization", "People", "%", "pct", True,
     "Emirati share of the workforce."),
    ("vacancy_rate", "Vacancy rate", "People", "%", "pct", False,
     "Vacant posts as a share of the approved establishment."),
]
_METRIC_GROUPS = ["Structure", "Scale", "Workforce mix", "People"]

_CATEGORY_LABEL = {"support": "Corporate-support", "core": "Core services"}


def _fmt(value: float | None, fmt: str) -> str:
    """Server-side display string per metric format, so the table renders text and no number is
    formatted (or hardcoded) in JSX."""
    if value is None:
        return "—"
    if fmt == "ratio":
        return f"{value:.2f}×"
    if fmt == "pct":
        return f"{value:.1f}%"
    if fmt == "fte":
        return f"{value:,.0f}"
    if fmt == "aed_m":
        return f"AED {value / 1e6:,.1f}M"
    if fmt == "aed":
        return f"AED {value:,.0f}"
    if fmt == "number":
        return f"{value:.1f}"
    if fmt == "count":
        return f"{value:,.0f}"
    return str(value)


def _div(num: float, den: float) -> float | None:
    return round(num / den, 4) if den else None


def _entity_stats(db: Session, entity: m.Entity, *, basis: str) -> dict:
    """All the raw comparison numbers for one entity, keyed by metric key."""
    typesets = {t.id: t for t in db.query(m.Typeset).all()}
    depts = db.query(m.Department).filter(m.Department.entity_id == entity.id).all()

    # ── structure: establishment FTE by support/core category (all departments, 100% coverage) ──
    support_fte = core_fte = corporate_fte = it_fte = 0.0
    for d in depts:
        fte = round(float(d.current_fte or 0), 2)
        ts = typesets.get(d.typeset_id)
        category = ts.category if ts else "core"
        if category == "support":
            support_fte += fte
        else:
            core_fte += fte
        if ts and ts.key == "corporate":
            corporate_fte += fte
        elif ts and ts.key == "digital":
            it_fte += fte
    support_fte, core_fte = round(support_fte, 2), round(core_fte, 2)
    corporate_fte, it_fte = round(corporate_fte, 2), round(it_fte, 2)
    establishment_fte = round(support_fte + core_fte, 2)

    # ── workforce mix: the entity's submitted profile at the selected basis ──
    hc = human_capital.filtered_human_capital(db, basis=basis, entity_id=entity.id)
    by_level = {lv["key"]: lv for lv in hc["by_level"]}
    profile_fte = float(hc.get("fte") or 0)
    headcount = int(hc.get("headcount") or 0)
    mgr = by_level.get("managers", {})
    managers_fte = float(mgr.get("fte") or 0)
    managers_headcount = int(mgr.get("headcount") or 0)
    skilled_fte = round(float(by_level.get("professionals", {}).get("fte") or 0)
                        + float(by_level.get("associate_professionals", {}).get("fte") or 0), 2)
    admin_fte = round(float(by_level.get("clerical_support", {}).get("fte") or 0), 2)
    senior_hc = int(hc.get("structural_roles", {}).get("count") or 0)
    sup = hc.get("supply") or {}
    approved_positions = int(sup.get("approved_positions") or 0)
    vacancies = int(sup.get("vacancies") or 0)

    has_workforce = bool(hc.get("has_data"))

    return {
        # structure (always present)
        "support_fte": support_fte,
        "core_fte": core_fte,
        "corporate_fte": corporate_fte,
        "it_fte": it_fte,
        "establishment_fte": establishment_fte,
        "support_to_core": _div(support_fte, core_fte),
        "support_share_pct": round(support_fte / establishment_fte * 100, 1) if establishment_fte else None,
        # scale / people (workforce-profile based — null when the entity hasn't submitted)
        "headcount": headcount if has_workforce else None,
        "annual_cost_aed": round(float(hc.get("annual_cost_aed") or 0), 2) if has_workforce else None,
        "cost_per_fte": round(float(hc.get("cost_per_fte") or 0), 2) if has_workforce else None,
        "emiratization_pct": round(float(hc.get("emiratization_pct") or 0), 1) if has_workforce else None,
        # workforce mix
        "management_pct": round(managers_fte / profile_fte * 100, 1) if profile_fte else None,
        "senior_mgmt_pct": round(senior_hc / headcount * 100, 1) if headcount else None,
        "skilled_to_admin": _div(skilled_fte, admin_fte),
        "span_of_control": _div(headcount - managers_headcount, managers_headcount),
        "vacancy_rate": round(vacancies / approved_positions * 100, 1) if approved_positions else None,
        # extras carried for the composition/mix panels (not ranked metrics)
        "_has_workforce": has_workforce,
        "_by_level": [
            {"key": lv["key"], "label": lv["label"], "headcount": int(lv["headcount"]),
             "fte": round(float(lv["fte"]), 2),
             "pct": round(float(lv["fte"]) / profile_fte * 100, 1) if profile_fte else 0.0}
            for lv in hc["by_level"]
        ],
    }


def _benchmark(db: Session, key: str) -> float | None:
    """Optional target/benchmark for a metric, from a CalcParameter row (`comparison.benchmark.<key>`).
    None when no such parameter is seeded — never a hardcoded number."""
    p = (db.query(m.CalcParameter)
         .filter(m.CalcParameter.key == f"comparison.benchmark.{key}").first())
    if not p:
        return None
    try:
        return float(p.value)
    except (TypeError, ValueError):
        return None


def _ranks(pairs: list[tuple[str, float | None]]) -> dict[str, int]:
    """Rank entity ids by value, 1 = highest. Null values are unranked."""
    ranked = sorted([p for p in pairs if p[1] is not None], key=lambda p: -p[1])
    return {eid: i + 1 for i, (eid, _v) in enumerate(ranked)}


def entity_comparison(db: Session, entity_ids: list[int], *, basis: str = "received",
                      scenario: str = "base") -> dict:
    """Side-by-side comparison of up to 5 entities across the descriptive-ratio catalog."""
    basis = basis if basis in sizing.BASIS_KEYS else "received"

    # Preserve request order, de-duplicate, cap at 5, keep only entities that exist.
    seen: set[int] = set()
    entities: list[m.Entity] = []
    for eid in entity_ids:
        if eid in seen:
            continue
        seen.add(eid)
        e = db.get(m.Entity, eid)
        if e:
            entities.append(e)
        if len(entities) >= MAX_ENTITIES:
            break

    stats = {e.id: _entity_stats(db, e, basis=basis) for e in entities}

    entity_rows = []
    for e in entities:
        s = stats[e.id]
        entity_rows.append({
            "id": e.id, "name": e.name, "code": e.code, "logo_url": e.logo_url, "wave": e.wave,
            "has_workforce_data": s["_has_workforce"],
            "structure": {
                "support_fte": s["support_fte"], "core_fte": s["core_fte"],
                "establishment_fte": s["establishment_fte"],
                "corporate_fte": s["corporate_fte"], "it_fte": s["it_fte"],
                "support_share_pct": s["support_share_pct"],
                "by_category": [
                    {"category": "support", "label": _CATEGORY_LABEL["support"], "fte": s["support_fte"],
                     "pct": round(s["support_fte"] / s["establishment_fte"] * 100, 1) if s["establishment_fte"] else 0.0},
                    {"category": "core", "label": _CATEGORY_LABEL["core"], "fte": s["core_fte"],
                     "pct": round(s["core_fte"] / s["establishment_fte"] * 100, 1) if s["establishment_fte"] else 0.0},
                ],
            },
            "level_mix": s["_by_level"],
        })

    metrics = []
    for key, label, group, unit, fmt, hib, desc in _METRICS:
        pairs = [(str(e.id), stats[e.id].get(key)) for e in entities]
        ranks = _ranks(pairs)
        metrics.append({
            "key": key, "label": label, "group": group, "unit": unit, "format": fmt,
            "higher_is_better": hib, "source": "live", "description": desc,
            "benchmark": _benchmark(db, key),
            "values": {
                eid: {"value": val, "display": _fmt(val, fmt), "rank": ranks.get(eid)}
                for eid, val in pairs
            },
        })

    return {
        "basis": basis,
        "scenario": scenario,
        "bases": list(sizing.BASES),
        "scenarios": calc_config.scenario_options(db),
        "max_entities": MAX_ENTITIES,
        "entities": entity_rows,
        "metrics": metrics,
        "metric_groups": _METRIC_GROUPS,
        "category_labels": _CATEGORY_LABEL,
    }

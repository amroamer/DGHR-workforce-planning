"""Forecasting Readiness (SPEC §9.5) — the demo's closing screen.
Zone 1 = real collection→readiness data. Zone 2 = §7.6 Layer-B preview (Illustrative)."""

from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy.orm import Session

from app import models as m
from app.services import cycles, dghr_views


def _is_ready(e: m.Entity) -> bool:
    # Canonical §6 rule (matches services/kpi.py) → 11 ready / 48 blocked.
    return e.completeness >= 80 and (e.quality_score or 0) >= 75 and e.status in ("submitted", "under_review")


def _blocking_reasons(e: m.Entity) -> list[str]:
    reasons = []
    if e.completeness < 80:
        reasons.append("Completeness < 80%")
    if (e.quality_score or 0) < 75:
        reasons.append("Quality below threshold")
    if e.status in ("not_started", "in_progress"):
        reasons.append("Submission incomplete")
    if e.status == "returned":
        reasons.append("Returned for correction")
    return reasons


def build_readiness(db: Session, *, filter_state="all", page=1, page_size=8) -> dict:
    entities = db.query(m.Entity).all()
    total = len(entities)
    ready = [e for e in entities if _is_ready(e)]
    blocked = [e for e in entities if not _is_ready(e)]
    cycle = cycles.current_cycle(db)
    target_date = (cycle.deadline + timedelta(days=7)).isoformat() if cycle else None

    avg_completeness = round(sum(e.completeness for e in entities) / total) if total else 0
    scored = [e for e in entities if e.quality_score is not None]
    avg_quality = round(sum(e.quality_score for e in scored) / len(scored)) if scored else 0

    # entity readiness table
    rows_src = entities
    if filter_state == "ready":
        rows_src = ready
    elif filter_state == "blocked":
        rows_src = blocked
    rows_src = sorted(rows_src, key=lambda e: (not _is_ready(e), -e.completeness))
    filtered_total = len(rows_src)
    page_rows = rows_src[(page - 1) * page_size: page * page_size]
    table = [{
        "id": e.id, "name": e.name, "code": e.code,
        "completeness": e.completeness, "quality_score": e.quality_score,
        "forecasting_ready": _is_ready(e),
        "blocking_reasons": [] if _is_ready(e) else _blocking_reasons(e),
    } for e in page_rows]

    # vision preview (§7.6 — Illustrative)
    vm = {v.key: v for v in db.query(m.VisionMetric).all()}

    def metric(k):
        v = vm.get(k)
        if not v:
            return None
        return {"value_numeric": float(v.value_numeric) if v.value_numeric is not None else None,
                "value_text": v.value_text, "label": v.label, "unit": v.unit}

    skills = db.query(m.SkillsGapPreview).order_by(m.SkillsGapPreview.rank).all()
    scenarios = db.query(m.ScenarioPreview).all()
    quotes = db.query(m.InsightQuote).all()

    return {
        "kpis": {
            "ready": len(ready), "ready_pct": round(len(ready) / total * 100, 1) if total else 0,
            "blocked": len(blocked), "blocked_pct": round(len(blocked) / total * 100, 1) if total else 0,
            "avg_completeness": avg_completeness, "avg_quality": avg_quality,
            "readiness_progress": round(len(ready) / total * 100, 1) if total else 0,
            "target_date": target_date,
        },
        "entity_readiness": {
            "rows": table, "page": page, "page_size": page_size, "total": filtered_total,
        },
        "blockers": dghr_views.tracker_blocked_summary(db),
        "vision_preview": {
            "metrics": {
                "current_workforce": metric("current_workforce"),
                "forecast_demand": metric("forecast_demand_fy_plus1"),
                "workforce_gaps": metric("workforce_gaps"),
                "growth": metric("growth"),
                "reduction": metric("reduction"),
                "budget_impact": metric("budget_impact"),
            },
            "skills": [{"skill": s.skill, "gap_fte": s.gap_fte, "rank": s.rank} for s in skills],
            "scenarios": [{"scenario": s.scenario, "headcount": s.headcount,
                           "cost_aed_b": float(s.cost_aed_b), "gaps": s.gaps} for s in scenarios],
            "quotes": [{"body": q.body, "tag": q.tag} for q in quotes],
        },
    }

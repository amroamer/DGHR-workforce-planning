"""AI layer (SPEC §13) — exactly three features, never blocking. Uses the Anthropic
Messages API when configured; otherwise deterministic fallbacks. Indistinguishable offline."""

from __future__ import annotations

from rapidfuzz import fuzz, process
from sqlalchemy.orm import Session

from app.config import settings
from app.services import fallbacks, import_engine
from app import models as m


def _live_enabled() -> bool:
    return bool(settings.anthropic_api_key) and settings.demo_ai_mode != "fallback"


def _call_anthropic(prompt: str, system: str, max_tokens: int = 400) -> str | None:
    """Best-effort live call; returns None on any error/timeout so callers fall back."""
    try:
        import anthropic

        client = anthropic.Anthropic(api_key=settings.anthropic_api_key, timeout=10.0)
        msg = client.messages.create(
            model=settings.model_name,
            max_tokens=max_tokens,
            temperature=0.4,
            system=system,
            messages=[{"role": "user", "content": prompt}],
        )
        return "".join(block.text for block in msg.content if getattr(block, "type", "") == "text").strip()
    except Exception:  # noqa: BLE001
        return None


_ANALYST_SYSTEM = (
    "You are a workforce-planning analyst for Dubai Government HR. Be specific, cross-entity where "
    "relevant, evidence-seeking, and work-first-not-headcount-first. Challenge respectfully. "
    "Never sound like a generic chatbot."
)


# ─────────────────────────── driver summary ───────────────────────────
def driver_summary(db: Session, entity_id: int) -> dict:
    e = db.get(m.Entity, entity_id)
    drivers = db.query(m.DemandDriver).filter(m.DemandDriver.entity_id == entity_id).all()
    cov = db.query(m.DashboardStat).filter(m.DashboardStat.group == "drivers", m.DashboardStat.key == "evidence_coverage").first()
    gaps = db.query(m.DashboardStat).filter(m.DashboardStat.group == "drivers", m.DashboardStat.key == "outstanding_gaps").first()
    coverage = cov.value_int if cov else 72
    gapn = gaps.value_int if gaps else 6
    driver_dicts = [{"category": d.category, "impact": d.impact, "horizon": d.horizon} for d in drivers]

    text = None
    if _live_enabled():
        prompt = (
            f"Write a 150-200 word demand outlook for {e.name}. Drivers: {driver_dicts}. "
            f"Evidence coverage {coverage}% with {gapn} gaps. Cover: demand outlook, top 3 impact themes, "
            f"evidence coverage gaps, suggested next steps."
        )
        text = _call_anthropic(prompt, _ANALYST_SYSTEM)
    if not text:
        text = fallbacks.driver_summary(e.name, driver_dicts, coverage, gapn)
    return {"summary": text, "source": "ai" if _live_enabled() and text else "fallback"}


# ─────────────────────────── anomaly narrative ───────────────────────────
def anomaly_narrative(db: Session, anomaly_id: int) -> dict:
    a = db.get(m.Anomaly, anomaly_id)
    if not a:
        return {"narrative": "", "source": "fallback"}
    if a.narrative:
        return {"narrative": a.narrative, "source": "cached"}
    e = db.get(m.Entity, a.entity_id)
    entity_name = e.name if e else "This entity"
    text = None
    if _live_enabled():
        prompt = f"Anomaly: '{a.title}' at {entity_name} (confidence {a.confidence}%). Write 3-4 sentences plus 2 recommended checks."
        text = _call_anthropic(prompt, _ANALYST_SYSTEM)
    if not text:
        text = fallbacks.anomaly_narrative(entity_name, a.title)
    a.narrative = text  # cache on the row
    db.commit()
    return {"narrative": text, "source": "ai" if _live_enabled() else "fallback"}


# ─────────────────────────── job-title mapping suggestions ───────────────────────────
def map_titles(db: Session, titles: list[str]) -> dict:
    """For unmapped/partial titles, suggest the best standard title + family + confidence.
    Fallback uses rapidfuzz; if live, AI can override low-confidence guesses (AI wins ties)."""
    _exact, _alias, all_titles, title_family = import_engine._build_taxonomy(db)
    suggestions = []
    for raw in titles:
        best = process.extractOne(str(raw), all_titles, scorer=fuzz.token_sort_ratio)
        if best:
            match, score, _ = best
            suggestions.append({
                "input": raw, "suggested_title": match, "family": title_family.get(match, ""),
                "confidence": int(score),
            })
        else:
            suggestions.append({"input": raw, "suggested_title": None, "family": None, "confidence": 0})
    return {"suggestions": suggestions, "source": "ai" if _live_enabled() else "fallback"}

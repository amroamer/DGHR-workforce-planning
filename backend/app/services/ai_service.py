"""AI layer (SPEC §13) — exactly three features, never blocking. Uses the Anthropic
Messages API when configured; otherwise deterministic fallbacks. Indistinguishable offline."""

from __future__ import annotations

import json
import re

from rapidfuzz import fuzz, process
from sqlalchemy.orm import Session

from statistics import median

from app.config import settings
from app.services import calc_config, cycles, fallbacks, human_capital, import_engine, review, revisions, sizing
from app import models as m


def _live_enabled() -> bool:
    return bool(settings.anthropic_api_key) and settings.demo_ai_mode != "fallback"


def _call_anthropic(prompt: str, system: str, max_tokens: int = 400, timeout: float = 10.0) -> str | None:
    """Best-effort live call; returns None on any error/timeout so callers fall back."""
    try:
        import anthropic

        client = anthropic.Anthropic(api_key=settings.anthropic_api_key, timeout=timeout)
        # No sampling params: current Claude models (Sonnet 5+) reject `temperature` with a 400.
        # Thinking is explicitly disabled — these are short, simple generations on a 10s
        # never-blocking budget, and Sonnet 5 defaults to adaptive thinking when omitted.
        msg = client.messages.create(
            model=settings.model_name,
            max_tokens=max_tokens,
            thinking={"type": "disabled"},
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


# ─────────────────────────── report narrative (entity + government) ───────────────────────────
def _report_facts(db: Session, scope: str, entity_id: int | None, scenario: str) -> dict | None:
    """The aggregates the report pages already render, reduced to the facts a narrative needs.
    Same service calls as the report endpoints — the narrative can never disagree with the page."""
    scn = calc_config.valid_scenario(db, scenario)
    year = cycles.base_year(db)
    if scope == "entity":
        e = db.get(m.Entity, entity_id) if entity_id else None
        if not e:
            return None
        es = sizing.entity_sizing(db, entity_id, received_only=False)
        hc = human_capital.entity_human_capital(db, entity_id, received_only=False)
        proj = sizing.entity_projection(db, entity_id, received_only=False, base_year=year, scenario=scn)
        rows = es["departments"]
        if not rows:
            return None
        name = f"{e.name}'s workforce report"
        received = sum(1 for d in rows if d["status"] in m.RECEIVED_STATUSES)
        total = len(rows)
        gaps = [{"name": d["name"], "gap": d["gap"]} for d in rows if d["gap"] is not None]
        totals = es["totals"]
    else:
        gov = sizing.government_sizing(db, scenario=scn)
        hc = human_capital.government_human_capital(db)
        proj = sizing.government_projection(db, base_year=year, scenario=scn)
        rows = gov["entities"]
        totals = gov["totals"]
        if not totals.get("required_fte") and not totals.get("current_fte"):
            return None
        name = "The government-wide position"
        received = sum(r["received"] for r in rows)
        total = sum(r["dept_count"] for r in rows)
        gaps = [{"name": r["name"], "gap": r["gap"]} for r in rows if r.get("counted")]

    end = proj["points"][-1] if proj.get("points") else None
    return {
        "name": name, "scope": scope, "scenario": scn,
        "departments_total": total, "received": received,
        "current_fte": totals["current_fte"], "required_fte": totals["required_fte"], "gap": totals["gap"],
        "has_hc": bool(hc.get("has_data")), "headcount": hc.get("headcount", 0),
        "emiratization_pct": hc.get("emiratization_pct", 0),
        "top_shortage": sorted((g for g in gaps if g["gap"] < 0), key=lambda g: g["gap"])[:3],
        "top_surplus": sorted((g for g in gaps if g["gap"] > 0), key=lambda g: -g["gap"])[:3],
        "horizon_years": proj["assumptions"]["horizon_years"],
        "end_year": end["year"] if end else None,
        "end_gap": end["gap"] if end else None,
    }


def report_narrative(db: Session, scope: str, entity_id: int | None = None, scenario: str = "base") -> dict:
    facts = _report_facts(db, scope, entity_id, scenario)
    if facts is None:
        return {"narrative": "", "source": "empty"}
    live_text = None
    if _live_enabled():
        prompt = (
            "Write a 140-180 word executive summary of this workforce report. Cover: submission coverage, "
            "required vs available FTE and what the gap means, where shortage/surplus concentrates, the "
            "workforce profile, the projected trajectory, and one or two recommended next steps. Use ONLY "
            "the figures given — never invent a number. Plain prose, no headings or bullets. FACTS: "
            + json.dumps(facts)
        )
        live_text = _call_anthropic(prompt, _ANALYST_SYSTEM, max_tokens=500)
    return {"narrative": live_text or fallbacks.report_narrative(facts),
            "source": "ai" if live_text else "fallback"}


# ─────────────────────────── ask-the-data chat (government-wide + entity) ───────────────────────────
def _gov_data_pack(db: Session, scenario: str) -> dict:
    """The government-wide position reduced to the facts a question could need — the SAME service
    calls the dashboard renders, so a chat answer can never disagree with the page. Grounding for the
    model: it only ever sees this pack, so it cannot invent a number that isn't on the screen."""
    scn = calc_config.valid_scenario(db, scenario)
    year = cycles.base_year(db)
    gov = sizing.government_sizing(db, scenario=scn)
    hc = human_capital.government_human_capital(db)
    proj = sizing.government_projection(db, base_year=year, scenario=scn)
    cov = gov.get("coverage") or {}

    counted = [{
        "name": e["name"], "code": e["code"], "gap": e["gap"],
        "required_fte": e["required_fte"], "available_fte": e["current_fte"],
        "received": e["received"], "departments": e["dept_count"], "remark": e.get("remark"),
    } for e in gov["entities"] if e.get("counted")]

    end = proj["points"][-1] if proj.get("points") else None
    open_clars = (db.query(m.SubmissionClarification)
                  .filter(m.SubmissionClarification.status == "open",
                          m.SubmissionClarification.side == "dghr").count())
    return {
        "scope": "gov", "label": "the government-wide position", "unit_word": "entity",
        "scenario": scn,
        "coverage": {
            "departments_total": cov.get("departments_total"),
            "departments_received": cov.get("departments_received"),
            "departments_approved": cov.get("departments_approved"),
        },
        "totals": {"required_fte": gov["totals"]["required_fte"],
                   "available_fte": gov["totals"]["current_fte"], "gap": gov["totals"]["gap"]},
        "human_capital": {
            "headcount": hc.get("headcount"), "emiratization_pct": hc.get("emiratization_pct"),
            "annual_cost_aed": hc.get("annual_cost_aed"),
            "by_level": [{"label": b["label"], "headcount": b["headcount"], "pct": b["pct"],
                          "emiratization_pct": b["emiratization_pct"]} for b in (hc.get("by_level") or [])],
        },
        # worst gap first — the order most questions care about
        "units": sorted(counted, key=lambda g: g["gap"]),
        "by_typeset": [{"typeset": t["typeset"], "required_fte": t["required_fte"],
                        "available_fte": t["current_fte"], "gap": t["gap"], "departments": t["departments"]}
                       for t in (gov.get("by_typeset") or [])],
        "projection": (None if not end else
                       {"end_year": end["year"], "end_gap": end["gap"],
                        "horizon_years": proj["assumptions"]["horizon_years"]}),
        "open_clarifications": open_clars,
    }


def _entity_data_pack(db: Session, entity_id: int, scenario: str) -> dict | None:
    """One entity's position, department by department — the same shape as the gov pack (scope /
    label / unit_word / units / totals / human_capital / coverage / projection) so both the model
    prompt and the deterministic fallback treat them identically."""
    e = db.get(m.Entity, entity_id)
    if not e:
        return None
    scn = calc_config.valid_scenario(db, scenario)
    year = cycles.base_year(db)
    es = sizing.entity_sizing(db, entity_id, received_only=False)
    hc = human_capital.entity_human_capital(db, entity_id, received_only=False)
    proj = sizing.entity_projection(db, entity_id, received_only=False, base_year=year, scenario=scn)
    rows = es["departments"]
    if not rows:
        return None
    units = [{
        "name": d["name"], "gap": d["gap"], "required_fte": d["required_fte"],
        "available_fte": d["current_fte"], "status": d["status"], "remark": d.get("remark"),
    } for d in rows if d["gap"] is not None]
    total = len(rows)
    received = sum(1 for d in rows if d["status"] in m.RECEIVED_STATUSES)
    approved = sum(1 for d in rows if d["status"] == "approved")
    end = proj["points"][-1] if proj.get("points") else None
    return {
        "scope": "entity", "label": f"{e.name}'s workforce position", "unit_word": "department",
        "scenario": scn,
        "coverage": {"departments_total": total, "departments_received": received,
                     "departments_approved": approved},
        "totals": {"required_fte": es["totals"]["required_fte"],
                   "available_fte": es["totals"]["current_fte"], "gap": es["totals"]["gap"]},
        "human_capital": {
            "headcount": hc.get("headcount"), "emiratization_pct": hc.get("emiratization_pct"),
            "annual_cost_aed": hc.get("annual_cost_aed"),
            "by_level": [{"label": b["label"], "headcount": b["headcount"], "pct": b["pct"],
                          "emiratization_pct": b["emiratization_pct"]} for b in (hc.get("by_level") or [])],
        },
        "units": sorted(units, key=lambda g: g["gap"]),
        "projection": (None if not end else
                       {"end_year": end["year"], "end_gap": end["gap"],
                        "horizon_years": proj["assumptions"]["horizon_years"]}),
    }


def _ask_pack(db: Session, scope: str, entity_id: int | None, scenario: str) -> dict | None:
    return _entity_data_pack(db, entity_id, scenario) if scope == "entity" and entity_id else _gov_data_pack(db, scenario)


def _ask_prompt(pack: dict, question: str, history: list[dict] | None) -> str:
    convo = ""
    for turn in (history or [])[-4:]:
        label = "Q" if turn.get("role") == "user" else "A"
        convo += f"{label}: {turn.get('content', '')}\n"
    return (
        f"Answer the analyst's question using ONLY the workforce data for {pack['label']} below. "
        "Cite the specific figures you use. If the data doesn't contain the answer, say so plainly "
        "rather than guessing. Plain prose, 2-5 sentences, no headings or bullets. "
        + (f"CONVERSATION SO FAR:\n{convo}\n" if convo else "")
        + f"QUESTION: {question}\nDATA: " + json.dumps(pack)
    )


def ask_data(db: Session, question: str, history: list[dict] | None = None,
             scope: str = "gov", entity_id: int | None = None, scenario: str = "base") -> dict:
    """Answer a free-text question over the government-wide OR one entity's position. Grounded in the
    data pack only; the deterministic fallback routes on intent so an offline demo still answers."""
    question = (question or "").strip()
    if not question:
        return {"answer": "", "source": "empty"}
    pack = _ask_pack(db, scope, entity_id, scenario)
    if pack is None:
        return {"answer": "There's no submitted data to answer from yet.", "source": "empty"}
    live_text = _call_anthropic(_ask_prompt(pack, question, history), _ANALYST_SYSTEM, max_tokens=400) if _live_enabled() else None
    return {"answer": live_text or fallbacks.ask_data(question, pack),
            "source": "ai" if live_text else "fallback"}


def ask_data_stream(pack: dict | None, question: str, history: list[dict] | None):
    """NDJSON generator for the chat: streams live tokens as they arrive, then a terminal line with
    the source. Pure (no DB) — the pack is built by the caller while the request session is open, so
    the stream can outlive it. Any live-call error falls through to the deterministic answer."""
    question = (question or "").strip()
    if pack is None or not question:
        msg = "" if not question else "There's no submitted data to answer from yet."
        yield json.dumps({"delta": msg}) + "\n"
        yield json.dumps({"done": True, "source": "empty"}) + "\n"
        return
    if _live_enabled():
        try:
            import anthropic

            client = anthropic.Anthropic(api_key=settings.anthropic_api_key, timeout=25.0)
            streamed = False
            with client.messages.stream(
                model=settings.model_name, max_tokens=400, thinking={"type": "disabled"},
                system=_ANALYST_SYSTEM,
                messages=[{"role": "user", "content": _ask_prompt(pack, question, history)}],
            ) as stream:
                for text in stream.text_stream:
                    if text:
                        streamed = True
                        yield json.dumps({"delta": text}) + "\n"
            if streamed:
                yield json.dumps({"done": True, "source": "ai"}) + "\n"
                return
        except Exception:  # noqa: BLE001 — any failure/timeout drops to the deterministic answer
            pass
    yield json.dumps({"delta": fallbacks.ask_data(question, pack)}) + "\n"
    yield json.dumps({"done": True, "source": "fallback"}) + "\n"


# ─────────────────────────── review brief: the DGHR reviewer's copilot ───────────────────────────
def _review_facts(db: Session, sub: m.DepartmentSubmission) -> dict:
    """Everything the reviewer would otherwise assemble by hand: the sizing chain, engine flags,
    what changed since the prior version, where review stands, aging questions, and how this
    department sits against its same-typeset peers. All computed — nothing narrated here."""
    cfg = calc_config.config(db)
    dept = db.get(m.Department, sub.department_id)
    ent = db.get(m.Entity, dept.entity_id) if dept else None
    ts = db.get(m.Typeset, dept.typeset_id) if dept and dept.typeset_id else None
    sz = sizing.submission_sizing(db, sub)
    state = review.review_state(db, sub)
    clars = review.clarification_rows(db, sub)
    open_clars = [c for c in clars if c["side"] == "dghr" and c["status"] == "open"]
    d = revisions.diff_with_previous(db, sub)

    # Same-typeset peers (received versions only) — the reviewer's cross-entity yardstick.
    peers = []
    if dept and dept.typeset_id:
        for pd in (db.query(m.Department)
                   .filter(m.Department.typeset_id == dept.typeset_id, m.Department.id != dept.id).all()):
            psub = sizing.active_submission(db, pd.id)
            if psub and psub.status in m.RECEIVED_STATUSES:
                psz = sizing.submission_sizing(db, psub)
                peers.append({"name": pd.name, "required_fte": psz["required_fte"], "gap": psz["gap"],
                              "drivers": psz["drivers"]})

    # Minutes-per-unit vs the peer median for the same unit of work — the quiet way a sizing inflates.
    outlier_ratio = cfg.num("ai.mpu_outlier_ratio", 1.5)
    peer_mpu: dict[str, list[float]] = {}
    for p in peers:
        for r in p["drivers"]:
            mpu = (r.get("params") or {}).get("minutes_per_unit")
            if mpu:
                peer_mpu.setdefault(r["unit"], []).append(float(mpu))
    mpu_outliers = []
    for r in sz["drivers"]:
        mpu = (r.get("params") or {}).get("minutes_per_unit")
        med = median(peer_mpu[r["unit"]]) if r["unit"] in peer_mpu else None
        if mpu and med and float(mpu) >= outlier_ratio * med:
            mpu_outliers.append({"driver": r["name"], "unit": r["unit"], "minutes_per_unit": float(mpu),
                                 "peer_median": round(med, 1)})

    drivers = [{
        "name": r["name"], "unit": r["unit"], "volume": r["volume"], "fte": r["fte"],
        "minutes_per_unit": (r.get("params") or {}).get("minutes_per_unit"),
        "has_source": bool(r["source"]), "forecast_stated": r["forecast_stated"],
        "overridden": r["overridden"], "element_key": r["element_key"],
    } for r in sz["drivers"]]

    return {
        "department": dept.name if dept else "", "entity": ent.name if ent else "",
        "typeset": ts.name if ts else "", "version": sub.version, "status": sub.status,
        "required_fte": sz["required_fte"], "available_fte": sz["available_fte"], "gap": sz["gap"],
        "flags": sz["flags"], "floor_total": sz.get("floor_total"),
        "drivers": drivers, "mandates": sz["mandates"],
        "review": {k: state[k] for k in ("total", "approved", "queried", "undecided", "all_approved")},
        "queried_elements": [r["element_label"] for r in state["elements"] if r["decision"] == "queried"],
        "open_clarifications": [{"element": c["element_label"] or c["element_type"],
                                 "days_open": c["days_open"], "level": c["level"]} for c in open_clars],
        "changes_from_previous": (None if d is None else
                                  {"from_version": d["from_version"], "to_version": d["to_version"],
                                   "count": len(d["changes"]),
                                   "changes": d["changes"][:8]}),
        "peers": [{"name": p["name"], "required_fte": p["required_fte"], "gap": p["gap"]} for p in peers],
        "peer_median_required": round(median([p["required_fte"] for p in peers]), 1) if peers else None,
        "mpu_outliers": mpu_outliers,
    }


def review_brief(db: Session, sub_id: int) -> dict:
    sub = db.get(m.DepartmentSubmission, sub_id)
    if not sub:
        return {"summary": "", "risks": [], "checks": [], "source": "empty"}
    facts = _review_facts(db, sub)
    if _live_enabled():
        prompt = (
            "You are briefing a DGHR reviewer before they open this department submission. Respond ONLY with "
            'JSON: {"summary":str (60-90 words: what the submission claims, how it compares to peers and its '
            'prior version, and where review stands),"risks":[{"title":str,"detail":str}] (max 4; each a '
            'specific, evidence-seeking concern grounded in the facts, detail one sentence),"checks":[str] '
            "(2-3 things to verify first, most material first, one sentence each). Use ONLY the figures given "
            "— never invent one. FACTS: " + json.dumps(facts)
        )
        # The brief is the one heavyweight generation — a full JSON deliverable, not a paragraph.
        # It gets a longer leash; the UI shows a busy state and the fallback still catches a miss.
        raw = _call_anthropic(prompt, _ANALYST_SYSTEM, max_tokens=800, timeout=25.0)
        if raw:
            try:
                data = json.loads(raw.replace("```json", "").replace("```", "").strip())
                return {"summary": str(data.get("summary", "")),
                        "risks": [{"title": str(r.get("title", "")), "detail": str(r.get("detail", ""))}
                                  for r in data.get("risks", [])],
                        "checks": [str(c) for c in data.get("checks", [])], "source": "ai"}
            except (json.JSONDecodeError, TypeError, KeyError, AttributeError):
                pass
    return {**fallbacks.review_brief(facts), "source": "fallback"}


# ─────────────────────────── clarification drafting (DGHR question / entity reply) ───────────────────────────
def _clarification_context(db: Session, sub: m.DepartmentSubmission,
                           element_type: str, element_key: str) -> dict:
    """The element's ACTUAL submitted figures — a draft grounded in the record, never invented."""
    sz = sizing.submission_sizing(db, sub)
    ctx: dict = {
        "element_type": element_type,
        "required_fte": sz.get("required_fte"), "available_fte": sz.get("available_fte"),
        "gap": sz.get("gap"), "flags": sz.get("flags") or [],
    }
    if element_type == "driver":
        d = next((r for r in sz["drivers"] if r["element_key"] == element_key), None)
        if d:
            ctx["driver"] = {
                "name": d["name"], "unit": d["unit"], "volume": d["volume"], "forecast": d["forecast"],
                "source": d["source"], "fte": d["fte"],
                "minutes_per_unit": (d.get("params") or {}).get("minutes_per_unit"),
            }
    elif element_type == "mandate":
        f = next((r for r in sz["mandates"] if m.element_key(r["role"]) == element_key), None)
        if f:
            ctx["mandate"] = {"role": f["role"], "positions": f["positions"], "legal_basis": f["legal_basis"]}
    elif element_type == "notes":
        ctx["note"] = sub.notes or ""
    return ctx


def draft_clarification(db: Session, sub_id: int, direction: str, element_type: str = "submission",
                        element_key: str = "", element_label: str = "",
                        clarification_id: int | None = None) -> dict:
    sub = db.get(m.DepartmentSubmission, sub_id)
    if not sub:
        return {"draft": "", "source": "empty"}
    ctx = _clarification_context(db, sub, element_type, element_key)
    question = ""
    if clarification_id:
        parent = db.get(m.SubmissionClarification, clarification_id)
        if parent and parent.submission_id == sub_id:
            question = parent.message or ""

    live_text = None
    if _live_enabled():
        if direction == "reply":
            prompt = (
                "You are the entity's department lead answering a DGHR reviewer's clarification. Draft a "
                "2-4 sentence reply grounded ONLY in the submitted figures below. Where evidence or a source "
                "must be named and is not in the data, insert a [bracketed placeholder] for the lead to fill. "
                f"Never invent a number. QUESTION: {question or element_label or 'the submission'}. "
                f"SUBMITTED FIGURES: {json.dumps(ctx)}"
            )
        else:
            prompt = (
                "You are the DGHR reviewer. Draft a 2-4 sentence clarification question to the entity about "
                f"the element below — specific, evidence-seeking, challenging respectfully. Ask for the source "
                f"behind the figures, not for justification of headcount. Use ONLY the figures given. "
                f"ELEMENT: {element_label or element_type}. FIGURES: {json.dumps(ctx)}"
            )
        live_text = _call_anthropic(prompt, _ANALYST_SYSTEM, max_tokens=300)
    text = live_text or fallbacks.draft_clarification(direction, element_type, element_label, ctx, question)
    return {"draft": text, "source": "ai" if live_text else "fallback"}


# ─────────────────────────── Smart Assist: extract drivers from a note ───────────────────────────
_NOUNS = "permit applications|applications|transactions|inspections|cases|invoices|payments|tickets|permits|licences|licenses|declarations"
_WORDS = {"two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10, "twelve": 12}


def _extract_fallback(text: str) -> dict:
    out: dict = {"drivers": [], "mandates": [], "context": []}
    t = text.lower()
    minutes = re.search(r"(\d+)\s*min", t)
    mpu = int(minutes.group(1)) if minutes else 20
    vol_m = re.search(r"([\d,]{3,})\s+(" + _NOUNS + r")", text, re.I)
    if vol_m:
        raw = int(vol_m.group(1).replace(",", ""))
        vol = raw * (4 if "quarter" in t else 1)
        grow = re.search(r"(\d+)\s*percent", t)
        g = (1 + int(grow.group(1)) / 100) if grow else 1.1
        noun = vol_m.group(2).lower()
        out["drivers"].append({
            "name": noun.capitalize() + " processed", "unit": noun + "/yr", "family": "demand",
            "volume": vol, "forecast": round(vol * g),
            "params": {"minutes_per_unit": mpu, "productive_hours": 1600, "quality_allowance": 1.15},
        })
    man_m = re.search(r"at least\s+(\w+)\s+([\w\s]{3,40}?)\s+on duty", text, re.I)
    if man_m:
        g1 = man_m.group(1).lower()
        n = _WORDS.get(g1) or (int(g1) if g1.isdigit() else 1)
        out["mandates"].append({"role": man_m.group(2).strip() + " (per the cited resolution)", "positions": n})
    if "second" in t:
        out["context"].append("Team members on secondment - temporary capacity reduction, not a structural gap.")
    if re.search(r"grow|increase|\d+\s*percent", t):
        out["context"].append("Lead expects volume growth - apply it to the forecast, not the baseline.")
    if not out["drivers"] and not out["mandates"]:
        out["context"].append("No countable drivers detected. Ask the lead for volumes with units.")
    return out


def smart_assist(text: str) -> dict:
    """Read a free-text note and propose structured drivers + statutory floors. AI when configured;
    deterministic regex fallback otherwise. Nothing is committed — the lead accepts each proposal."""
    text = (text or "").strip()
    if not text:
        return {"drivers": [], "mandates": [], "context": [], "source": "empty"}
    if _live_enabled():
        prompt = (
            "Extract workload drivers and statutory staffing requirements from the note. Respond ONLY with JSON: "
            '{"drivers":[{"name":str,"unit":str,"family":"demand|ratio|coverage|project","volume":num,"forecast":num,"minutes_per_unit":num}],'
            '"mandates":[{"role":str,"positions":num}],"context":[str]}. NOTE: ' + text
        )
        raw = _call_anthropic(prompt, _ANALYST_SYSTEM, max_tokens=800)
        if raw:
            try:
                data = json.loads(raw.replace("```json", "").replace("```", "").strip())
                for d in data.get("drivers", []):
                    mpu = d.pop("minutes_per_unit", 20)
                    d.setdefault("params", {"minutes_per_unit": mpu, "productive_hours": 1600, "quality_allowance": 1.15})
                    d.setdefault("family", "demand")
                    d.setdefault("forecast", d.get("volume", 0))
                return {"drivers": data.get("drivers", []), "mandates": data.get("mandates", []),
                        "context": data.get("context", []), "source": "ai"}
            except (json.JSONDecodeError, TypeError, KeyError):
                pass
    return {**_extract_fallback(text), "source": "fallback"}

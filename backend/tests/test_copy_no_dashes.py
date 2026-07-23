"""Guardrail: no em/en dashes (— –) in any user-facing text the backend produces.

The house rule bans em/en dashes in visible copy and AI output (they read as machine-generated).
The source-level scanner (scripts/scan_dashes.py) guards static string literals; this guards the
RUNTIME output of every deterministic producer (fallbacks, coverage statements, the comparison
payload) plus the live-AI sanitizer, so a regression is caught even when the phrasing is composed
at request time. Live AI output is cleaned by ai_service._sanitize, unit-tested here directly.
"""
from __future__ import annotations

from app import models as m
from app.services import ai_service, entity_comparison, sizing

DASHES = ("—", "–")  # em dash, en dash


def _strings(obj):
    if isinstance(obj, str):
        yield obj
    elif isinstance(obj, dict):
        for v in obj.values():
            yield from _strings(v)
    elif isinstance(obj, (list, tuple)):
        for v in obj:
            yield from _strings(v)


def _assert_clean(obj, where: str) -> None:
    for s in _strings(obj):
        bad = [d for d in DASHES if d in s]
        assert not bad, f"em/en dash in {where}: {s!r}"


def _received_submission(db):
    return next((s for s in db.query(m.DepartmentSubmission).all()
                 if s.status in m.RECEIVED_STATUSES), None)


def test_sanitize_strips_dashes():
    assert ai_service._sanitize("a — b over 0–2 years") == "a - b over 0-2 years"
    assert ai_service._sanitize("") == ""
    assert ai_service._sanitize(None) is None


def test_coverage_statements_have_no_dashes(db):
    for basis in sizing.BASIS_KEYS:
        _assert_clean(sizing.government_sizing(db, basis=basis)["coverage"], f"coverage[{basis}]")


def test_fallback_narratives_have_no_dashes(db):
    ent = db.query(m.Entity).first()
    _assert_clean(ai_service.report_narrative(db, "gov"), "report_narrative(gov)")
    _assert_clean(ai_service.report_narrative(db, "entity", ent.id), "report_narrative(entity)")
    for q in ("what is the gap?", "any surplus?", "emiratization", "annual cost",
              "coverage so far", "the projection to 2030", "by type of work", "open clarifications"):
        _assert_clean(ai_service.ask_data(db, q, scope="gov"), f"ask_data({q!r})")
    _assert_clean(ai_service.clarification_triage(db), "clarification_triage")
    _assert_clean(ai_service.quality_sweep(db), "quality_sweep")
    _assert_clean(ai_service.smart_assist(
        "We process 210,000 permit applications a year at 18 minutes each, growing 8 percent."),
        "smart_assist")
    sub = _received_submission(db)
    if sub is not None:
        _assert_clean(ai_service.review_brief(db, sub.id), "review_brief")
        _assert_clean(ai_service.pre_review(db, sub.id), "pre_review")


def test_entity_comparison_copy_has_no_dashes(db):
    ids = [e.id for e in db.query(m.Entity).order_by(m.Entity.id).limit(3).all()]
    _assert_clean(entity_comparison.entity_comparison(db, ids), "entity_comparison")

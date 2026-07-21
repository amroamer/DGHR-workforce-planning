"""End-to-end contract tests for the DGHR → entity clarification flow.

Reproduces and pins the reported bug: a clarification raised from the DGHR submission-review screen
(SubmissionClarification) never surfaced in the entity's Case-backed "Clarifications & Requests from
DGHR" inbox, so it looked like it never arrived. These 20 cases exercise both clarification channels
and their edge cases through the SAME HTTP endpoints the two portals call, asserting delivery,
scoping, threading and validation.
"""
from __future__ import annotations

import itertools

from app import models as m
from app.services.cases import SUBCLAR_ID_BASE

_nonce = itertools.count(1)


# ───────────────────────── helpers ─────────────────────────
def _reviewer_id(db) -> int:
    r = db.query(m.User).filter(m.User.role == "dghr_reviewer").order_by(m.User.id).first()
    assert r, "seed must contain a DGHR reviewer"
    return r.id


def _clarifiable(db, used: set[int] | None = None):
    """A submission a clarification can be raised on, with its entity id + department name.
    Prefers a fresh 'submitted' one; falls back to already-open threads so the suite never starves."""
    db.expire_all()
    used = used or set()
    for status in ("submitted", "in_clarification", "recommended"):
        for s in db.query(m.DepartmentSubmission).filter(
                m.DepartmentSubmission.status == status).order_by(m.DepartmentSubmission.id).all():
            if s.id in used:
                continue
            dept = db.get(m.Department, s.department_id)
            if dept:
                used.add(s.id)
                return s.id, dept.entity_id, dept.name
    raise AssertionError("no clarifiable submission in seed")


def _two_entities(db):
    """(entity_id, sub_id) for two DIFFERENT entities, for isolation tests."""
    picks: dict[int, int] = {}
    for s in db.query(m.DepartmentSubmission).filter(
            m.DepartmentSubmission.status.in_(("submitted", "in_clarification", "recommended"))
    ).order_by(m.DepartmentSubmission.id).all():
        dept = db.get(m.Department, s.department_id)
        picks.setdefault(dept.entity_id, s.id)
        if len(picks) >= 2:
            break
    assert len(picks) >= 2, "need two entities with clarifiable submissions"
    (e1, s1), (e2, s2) = list(picks.items())
    return (e1, s1), (e2, s2)


def _msg(text: str) -> str:
    return f"{text} [#{next(_nonce)}]"


def _raise(client, db, sub_id, *, element_type="submission", element_key="submission",
           element_id=None, element_label="", message="Please clarify."):
    return client.post(
        f"/api/planning/dghr/submissions/{sub_id}/clarify",
        json={"element_type": element_type, "element_id": element_id, "element_key": element_key,
              "element_label": element_label, "message": message, "actor_id": _reviewer_id(db)},
    )


def _clar_id_from_payload(payload, message) -> int:
    ids = [c["id"] for c in payload["clarifications"] if c["side"] == "dghr" and c["message"] == message]
    assert ids, f"raised clarification not in submission payload: {message}"
    return max(ids)


def _inbox(client, entity_id, *, side="entity", tab="all", search=None):
    params = {"side": side, "tab": tab}
    if entity_id is not None:          # DGHR-wide inbox omits the scope entirely
        params["entity_id"] = entity_id
    if search is not None:
        params["search"] = search
    r = client.get("/api/cases", params=params)
    assert r.status_code == 200, r.text
    return r.json()


def _all_summaries(inbox):
    return inbox["all"]


def _find(inbox, message):
    return next((c for c in inbox["all"] if c["issue_summary"] == message), None)


# ───────────────────────── the 20 cases ─────────────────────────
def test_01_submission_clarification_reaches_entity_inbox(client, db):
    """THE BUG: a review-screen clarification must now appear in the entity's Clarifications inbox."""
    sub_id, eid, _ = _clarifiable(db)
    text = _msg("Reconcile the 12-month volume to a system of record.")
    payload = _raise(client, db, sub_id, message=text).json()
    clar_id = _clar_id_from_payload(payload, text)
    hit = _find(_inbox(client, eid), text)
    assert hit is not None, "clarification did not reach the entity inbox"
    assert hit["id"] == SUBCLAR_ID_BASE + clar_id
    assert hit["status"] == "open" and hit["kind"] == "clarification"


def test_02_clarification_notifies_entity(client, db):
    sub_id, eid, _ = _clarifiable(db)
    text = _msg("Confirm the headcount basis.")
    _raise(client, db, sub_id, element_label="Workforce profile", message=text)
    notes = client.get("/api/notifications", params={"audience": "entity", "entity_id": eid}).json()
    assert any(text in n["body"] and n["kind"] == "clarification" for n in notes["items"]), \
        "entity was not notified of the clarification"


def test_03_clarification_in_submission_payload(client, db):
    """The stepper channel must keep working — the entity still sees it inside their submission."""
    sub_id, _eid, _ = _clarifiable(db)
    text = _msg("Which report is this drawn from?")
    payload = _raise(client, db, sub_id, message=text).json()
    got = client.get(f"/api/planning/dghr/submissions/{sub_id}").json()
    assert any(c["message"] == text and c["side"] == "dghr" for c in got["clarifications"])
    assert got["status"] == "in_clarification"


def test_04_clarification_scoped_to_its_entity_only(client, db):
    (e1, s1), (e2, _s2) = _two_entities(db)
    text = _msg("Only entity one should see this.")
    _raise(client, db, s1, message=text)
    assert _find(_inbox(client, e1), text) is not None
    assert _find(_inbox(client, e2), text) is None, "clarification leaked to another entity"


def test_05_inbox_detail_shows_the_message(client, db):
    sub_id, eid, _ = _clarifiable(db)
    text = _msg("Explain the vacancy funding.")
    payload = _raise(client, db, sub_id, element_label="Supply", message=text).json()
    cid = SUBCLAR_ID_BASE + _clar_id_from_payload(payload, text)
    d = client.get(f"/api/cases/{cid}").json()
    assert d["issue_summary"] == text
    assert any(mm["side"] == "dghr" and mm["body"] == text for mm in d["messages"])


def test_06_kpis_count_the_open_clarification(client, db):
    sub_id, eid, _ = _clarifiable(db)
    before = client.get("/api/cases/kpis", params={"entity_id": eid}).json()["open_clarifications"]
    _raise(client, db, sub_id, message=_msg("Bump the open KPI."))
    after = client.get("/api/cases/kpis", params={"entity_id": eid}).json()["open_clarifications"]
    assert after == before + 1


def test_07_entity_reply_from_inbox_answers_and_notifies_dghr(client, db):
    sub_id, eid, _ = _clarifiable(db)
    text = _msg("Please provide the source system.")
    payload = _raise(client, db, sub_id, message=text).json()
    cid = SUBCLAR_ID_BASE + _clar_id_from_payload(payload, text)
    reply = "Drawn from the HRMS monthly export."
    d = client.post(f"/api/cases/{cid}/messages", json={"side": "entity", "body": reply})
    assert d.status_code == 200, d.text
    detail = d.json()
    assert detail["status"] == "responded"
    assert any(mm["side"] == "entity" and mm["body"] == reply for mm in detail["messages"])
    dghr_notes = client.get("/api/notifications", params={"audience": "dghr", "entity_id": eid}).json()
    assert any(reply in n["body"] for n in dghr_notes["items"]), "DGHR not notified of the reply"


def test_08_answered_clarification_leaves_the_open_tab(client, db):
    sub_id, eid, _ = _clarifiable(db)
    text = _msg("Answer moves it out of open.")
    payload = _raise(client, db, sub_id, message=text).json()
    cid = SUBCLAR_ID_BASE + _clar_id_from_payload(payload, text)
    client.post(f"/api/cases/{cid}/messages", json={"side": "entity", "body": "Answered."})
    open_tab = _inbox(client, eid, tab="open")
    assert all(c["id"] != cid for c in open_tab["groups"]["open_clarifications"])


def test_09_entity_reply_via_stepper_channel_reflects_in_inbox(client, db):
    """A reply typed in the submission stepper must update the SAME thread the inbox reads."""
    sub_id, eid, _ = _clarifiable(db)
    text = _msg("Reply through the stepper.")
    payload = _raise(client, db, sub_id, message=text).json()
    clar_id = _clar_id_from_payload(payload, text)
    r = client.post(f"/api/planning/submissions/{sub_id}/clarifications/{clar_id}/reply",
                    json={"message": "Answered from the stepper."})
    assert r.status_code == 200, r.text
    d = client.get(f"/api/cases/{SUBCLAR_ID_BASE + clar_id}").json()
    assert d["status"] == "responded"
    assert any(mm["side"] == "entity" for mm in d["messages"])


def test_10_resolve_from_inbox_moves_to_resolved(client, db):
    sub_id, eid, _ = _clarifiable(db)
    text = _msg("Resolve me.")
    payload = _raise(client, db, sub_id, message=text).json()
    cid = SUBCLAR_ID_BASE + _clar_id_from_payload(payload, text)
    d = client.post(f"/api/cases/{cid}/action", json={"action": "resolve"}).json()
    assert d["status"] == "resolved"
    resolved = _inbox(client, eid, tab="resolved")
    assert any(c["id"] == cid for c in resolved["groups"]["resolved"])
    assert _find(_inbox(client, eid, tab="open"), text) is None


def test_11_dghr_followup_from_inbox_reopens_thread(client, db):
    sub_id, eid, _ = _clarifiable(db)
    text = _msg("Followup reopens.")
    payload = _raise(client, db, sub_id, message=text).json()
    cid = SUBCLAR_ID_BASE + _clar_id_from_payload(payload, text)
    client.post(f"/api/cases/{cid}/messages", json={"side": "entity", "body": "First answer."})
    d = client.post(f"/api/cases/{cid}/messages", json={"side": "dghr", "body": "Need more detail."}).json()
    assert d["status"] == "open", "a DGHR follow-up should reopen the thread"
    assert len(d["messages"]) >= 3


def test_12_search_matches_message_text(client, db):
    sub_id, eid, _ = _clarifiable(db)
    marker = f"zebra{next(_nonce)}"
    text = _msg(f"Unique token {marker} for search.")
    _raise(client, db, sub_id, message=text)
    found = _inbox(client, eid, search=marker)
    assert _find(found, text) is not None
    absent = _inbox(client, eid, search="nomatchxyz123")
    assert _find(absent, text) is None


def test_13_dghr_side_sees_clarifications_across_entities(client, db):
    (e1, s1), (e2, s2) = _two_entities(db)
    t1, t2 = _msg("DGHR sees entity one."), _msg("DGHR sees entity two.")
    _raise(client, db, s1, message=t1)
    _raise(client, db, s2, message=t2)
    dghr = _inbox(client, entity_id=None, side="dghr")
    msgs = {c["issue_summary"] for c in dghr["all"]}
    assert t1 in msgs and t2 in msgs


def test_14_element_type_driver_reaches_inbox(client, db):
    sub_id, eid, _ = _clarifiable(db)
    text = _msg("Driver-level question.")
    _raise(client, db, sub_id, element_type="driver", element_key="service-transactions",
           element_label="Service transactions", message=text)
    hit = _find(_inbox(client, eid), text)
    assert hit and "Service transactions" in hit["package_label"]


def test_15_element_type_mandate_reaches_inbox(client, db):
    sub_id, eid, _ = _clarifiable(db)
    text = _msg("Mandate-level question.")
    _raise(client, db, sub_id, element_type="mandate", element_key="grid-controllers",
           element_label="Certified grid controllers", message=text)
    assert _find(_inbox(client, eid), text) is not None


def test_16_element_type_profile_reaches_inbox(client, db):
    sub_id, eid, _ = _clarifiable(db)
    text = _msg("Profile-level question.")
    _raise(client, db, sub_id, element_type="profile", element_key="profile",
           element_label="Workforce profile", message=text)
    assert _find(_inbox(client, eid), text) is not None


def test_17_empty_message_is_rejected(client, db):
    sub_id, _eid, _ = _clarifiable(db)
    r = _raise(client, db, sub_id, message="   ")
    assert r.status_code == 422, r.text


def test_18_unknown_element_type_is_rejected(client, db):
    sub_id, _eid, _ = _clarifiable(db)
    r = _raise(client, db, sub_id, element_type="banana", message=_msg("bad element type"))
    assert r.status_code == 422, r.text


def test_19_clarify_on_a_draft_is_rejected(client, db):
    draft = db.query(m.DepartmentSubmission).filter(m.DepartmentSubmission.status == "draft").first()
    assert draft, "seed should contain at least one draft submission"
    r = _raise(client, db, draft.id, message=_msg("cannot clarify a draft"))
    assert r.status_code == 409, r.text


def test_20_reply_to_a_thread_on_another_submission_is_rejected(client, db):
    (e1, s1), (e2, s2) = _two_entities(db)
    text = _msg("Thread belongs to submission one.")
    payload = _raise(client, db, s1, message=text).json()
    clar_id = _clar_id_from_payload(payload, text)
    # route the reply at a DIFFERENT submission — must be refused, not silently misfiled
    r = client.post(f"/api/planning/submissions/{s2}/clarifications/{clar_id}/reply",
                    json={"message": "misrouted reply"})
    assert r.status_code == 422, r.text

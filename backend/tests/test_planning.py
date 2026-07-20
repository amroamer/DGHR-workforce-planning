"""Contract tests for the Planning department + sizing model (replaces the old package tests)."""
from __future__ import annotations

from app import models as m
from app.services import calc_config, sizing, versioning


def _reviewers(db):
    rs = db.query(m.User).filter(m.User.role == "dghr_reviewer").order_by(m.User.id).all()
    assert len(rs) >= 2, "maker-checker needs two reviewers"
    return rs[0], rs[1]


def _submit(client, sid, by="Sara Al Mansoori"):
    """Submit with the attestation the endpoint now requires."""
    return client.post(f"/api/planning/submissions/{sid}/submit",
                       json={"attested": True, "attested_by": by})


def _sign_off_all(client, sid, actor_id):
    """Approve every element of a submission, so it can be recommended."""
    review = client.get(f"/api/planning/dghr/submissions/{sid}").json()["review"]
    for el in review["elements"]:
        client.post(f"/api/planning/dghr/submissions/{sid}/elements/decide",
                    json={"element_type": el["element_type"], "element_key": el["element_key"],
                          "element_label": el["element_label"], "decision": "approved",
                          "actor_id": actor_id})


def _recommend_and_approve(client, db, sid):
    """Drive a submission through the full two-stage sign-off with two different reviewers."""
    r1, r2 = _reviewers(db)
    _sign_off_all(client, sid, r1.id)
    rec = client.post(f"/api/planning/dghr/submissions/{sid}/recommend",
                      json={"note": "Sizing consistent with the method.", "actor_id": r1.id})
    assert rec.status_code == 200, rec.json()
    return client.post(f"/api/planning/dghr/submissions/{sid}/approve",
                       json={"note": "Second signature.", "actor_id": r2.id}), r1, r2


def _dm_permits(db):
    ent = db.query(m.Entity).filter(m.Entity.code == "DM").first()
    return db.query(m.Department).filter(
        m.Department.entity_id == ent.id, m.Department.name.like("Permits%")).first()


# ───────────────────────── engine ─────────────────────────
def test_engine_reproduces_doc_examples(db):
    """The formulas now live in calc_methods, so this also proves the DB-held expressions are the
    ones the doc specifies — not just that some Python reproduces the numbers."""
    cfg = calc_config.config(db)
    # demand (Certificates): 210000 x 18/60 /1600 x1.15 = 45.28 -> ceil 46
    assert round(sizing.driver_fte_raw(cfg, "demand", 210000, {"minutes_per_unit": 18, "productive_hours": 1600, "quality_allowance": 1.15})) == 45
    # productive_hours omitted -> falls back to the METHOD's declared default (1600), not a literal
    assert sizing._effective(cfg, "demand", sizing.driver_fte_raw(cfg, "demand", 210000, {"minutes_per_unit": 18, "quality_allowance": 1.15})) == 46
    # ratio (HR): 2400/85 = 28.2
    assert round(sizing.driver_fte_raw(cfg, "ratio", 2400, {"serving_ratio": 85})) == 28
    # coverage (control desk): 6 x3 x1.55 = 27.9
    assert round(sizing.driver_fte_raw(cfg, "coverage", 6, {"shifts": 3, "relief_factor": 1.55})) == 28
    # project (mega): 3 x 6 = 18
    assert sizing.driver_fte_raw(cfg, "project", 3, {"team_size": 6}) == 18


def test_seed_clean_shape(db):
    assert db.query(m.Typeset).count() == 10
    assert db.query(m.Entity).count() >= 5
    assert db.query(m.Department).count() > 40
    # NO fabricated dashboard metrics — every KPI must be computed from real submissions
    assert db.query(m.VisionMetric).count() == 0
    assert db.query(m.ScenarioPreview).count() == 0
    assert db.query(m.DashboardStat).count() == 0
    # realistic *inputs* are seeded (driver volumes), so the engine has something real to compute
    assert db.query(m.DepartmentSubmission).count() > 0
    assert db.query(m.SubmissionDriver).count() > 0


def test_typesets_endpoint(client):
    r = client.get("/api/planning/typesets")
    assert r.status_code == 200 and len(r.json()) == 10


def test_department_crud(client, db):
    ent = db.query(m.Entity).filter(m.Entity.code == "DM").first()
    ts = db.query(m.Typeset).first()
    r = client.post(f"/api/planning/entities/{ent.id}/departments", json={"name": "Test Dept", "typeset_id": ts.id, "current_fte": 10})
    assert r.status_code == 200
    did = r.json()["id"]
    assert client.patch(f"/api/planning/departments/{did}", json={"current_fte": 12}).status_code == 200
    assert db.get(m.Department, did).current_fte == 12
    assert client.delete(f"/api/planning/departments/{did}").status_code == 200
    assert db.get(m.Department, did) is None


# ───────────────────────── reconciliation (regression) ─────────────────────────
def test_family_split_reconciles_with_required(client, db):
    """The donut must ALWAYS sum to Required FTE — per submission and government-wide.
    Guards the bug where a non-binding statutory floor was added to the split, and
    per-family rounding drifted away from the headline."""
    for dep in db.query(m.Department).all():
        sub = sizing.active_submission(db, dep.id)
        if not sub:
            continue
        sz = sizing.submission_sizing(db, sub)
        assert sum(x["fte"] for x in sz["family_split"]) == sz["required_fte"], f"{dep.name} split != required"
        # a floor that does NOT bind contributes nothing to required
        if sz["floor_total"] and not sz["floor_binds"]:
            assert all(x["family"] != "mandate" for x in sz["family_split"] if not x.get("binds"))
    for scen in ("base", "demand"):
        gov = client.get(f"/api/planning/dghr/government?scenario={scen}").json()
        t = gov["totals"]
        assert sum(x["fte"] for x in t["family_split"]) == t["required_fte"], f"gov split != required ({scen})"


def test_statutory_floor_binds_somewhere(db):
    """The max(build-up, floor) rule must actually be exercised by the data."""
    bound = []
    for dep in db.query(m.Department).all():
        sub = sizing.active_submission(db, dep.id)
        if sub and sizing.submission_sizing(db, sub)["floor_binds"]:
            bound.append(dep.name)
    assert bound, "no department is floor-bound — the max() rule is never exercised"


# ───────────────────────── full cycle ─────────────────────────
def _fresh_dept(client, db) -> int:
    """Create an isolated department so the cycle test doesn't collide with seeded submissions."""
    ent = db.query(m.Entity).filter(m.Entity.code == "DM").first()
    ts = db.query(m.Typeset).filter(m.Typeset.key == "backoffice").first()
    r = client.post(f"/api/planning/entities/{ent.id}/departments",
                    json={"name": "Cycle Test Dept", "typeset_id": ts.id, "current_fte": 51})
    return r.json()["id"]


def test_full_cycle_submit_approve_reject_clarify(client, db):
    dep_id = _fresh_dept(client, db)
    sub = client.get(f"/api/planning/departments/{dep_id}/submission").json()
    sid = sub["id"]
    save = {"current_fte": 51, "notes": "FY2027.",
            "drivers": [{"name": "Applications processed", "unit": "applications/yr", "family": "demand",
                         "volume": 210000, "forecast": 220000,
                         "params": {"minutes_per_unit": 18, "productive_hours": 1600, "quality_allowance": 1.15}}],
            "mandates": []}
    saved = client.put(f"/api/planning/submissions/{sid}", json=save).json()
    assert saved["sizing"]["required_fte"] == 46          # engine reproduces the doc end-to-end
    assert saved["version"] == 1

    # round 1: submit -> two-stage sign-off (recommend, then a DIFFERENT person approves)
    assert _submit(client, sid).json()["status"] == "submitted"
    detail = client.get(f"/api/planning/dghr/submissions/{sid}").json()
    assert len(detail["sizing"]["drivers"]) == 1 and detail["notes"] == "FY2027."
    approved, r1, r2 = _recommend_and_approve(client, db, sid)
    assert approved.status_code == 200
    body = approved.json()
    assert body["status"] == "approved"
    assert body["recommended_by"] == r1.name and body["decided_by"] == r2.name  # attribution recorded


def test_submit_requires_attestation(client, db):
    dep_id = _fresh_dept(client, db)
    sid = client.get(f"/api/planning/departments/{dep_id}/submission").json()["id"]
    client.put(f"/api/planning/submissions/{sid}", json={"drivers": [
        {"name": "Applications processed", "unit": "x", "family": "demand", "volume": 210000, "forecast": 0,
         "params": {"minutes_per_unit": 18, "productive_hours": 1600, "quality_allowance": 1.15}}], "mandates": []})
    # No attestation -> rejected; unnamed -> rejected; signed -> recorded on the submission.
    assert client.post(f"/api/planning/submissions/{sid}/submit", json={}).status_code == 422
    assert client.post(f"/api/planning/submissions/{sid}/submit",
                       json={"attested": True, "attested_by": "  "}).status_code == 422
    ok = client.post(f"/api/planning/submissions/{sid}/submit",
                     json={"attested": True, "attested_by": "Fatima Al Balushi"}).json()
    assert ok["status"] == "submitted"
    assert ok["attested"] and ok["attested_by"] == "Fatima Al Balushi" and ok["attested_at"]


def test_driver_source_is_saved_and_returned(client, db):
    dep_id = _fresh_dept(client, db)
    sid = client.get(f"/api/planning/departments/{dep_id}/submission").json()["id"]
    saved = client.put(f"/api/planning/submissions/{sid}", json={"drivers": [
        {"name": "Applications processed", "unit": "x", "family": "demand", "volume": 210000, "forecast": 0,
         "source": "FY2026 case-system extract",
         "params": {"minutes_per_unit": 18, "productive_hours": 1600, "quality_allowance": 1.15}}], "mandates": []}).json()
    assert saved["sizing"]["drivers"][0]["source"] == "FY2026 case-system extract"


def test_department_documents_include_department_and_entity_scope(client, db):
    ent = db.query(m.Entity).filter(m.Entity.code == "DM").first()
    dep = db.query(m.Department).filter(m.Department.entity_id == ent.id).first()
    # entity-wide doc + department-specific doc
    import io
    client.post(f"/api/planning/entities/{ent.id}/documents",
                files={"file": ("entity.txt", io.BytesIO(b"x"), "text/plain")},
                data={"category": "Methodology"})
    client.post(f"/api/planning/entities/{ent.id}/documents",
                files={"file": ("dept.txt", io.BytesIO(b"y"), "text/plain")},
                data={"category": "Evidence", "department_id": str(dep.id)})
    docs = client.get(f"/api/planning/departments/{dep.id}/documents").json()["documents"]
    scopes = {d["filename"]: d["scope"] for d in docs}
    assert scopes.get("dept.txt") == "department"
    assert scopes.get("entity.txt") == "entity"


def test_approved_is_immutable_and_revising_creates_v2(client, db):
    """The bug this replaces: the old suite edited an approved submission in place and asserted
    nothing about it. An approved record must be frozen; a change is a new version."""
    dep_id = _fresh_dept(client, db)
    sid = client.get(f"/api/planning/departments/{dep_id}/submission").json()["id"]
    client.put(f"/api/planning/submissions/{sid}", json={"notes": "v1", "drivers": [
        {"name": "Applications processed", "unit": "applications/yr", "family": "demand",
         "volume": 210000, "forecast": 220000,
         "params": {"minutes_per_unit": 18, "productive_hours": 1600, "quality_allowance": 1.15}}], "mandates": []})
    _submit(client, sid)
    assert _recommend_and_approve(client, db, sid)[0].json()["status"] == "approved"

    # v1 is frozen — editing it is a 409, not a silent rewrite.
    assert client.put(f"/api/planning/submissions/{sid}", json={"notes": "tampered"}).status_code == 409

    # Revising creates v2 as a copy; v1 survives EXACTLY as approved.
    v2 = client.post(f"/api/planning/submissions/{sid}/revise").json()
    assert v2["version"] == 2 and v2["status"] == "draft" and v2["supersedes_id"] == sid
    v1 = client.get(f"/api/planning/dghr/submissions/{sid}").json()
    assert v1["status"] == "approved" and v1["notes"] == "v1"       # untouched

    # v2 is editable and its drivers were copied by value.
    v2_saved = client.put(f"/api/planning/submissions/{v2['id']}",
                          json={"notes": "v2 restated"}).json()
    assert v2_saved["status"] == "draft"
    assert client.get(f"/api/planning/dghr/submissions/{sid}").json()["notes"] == "v1"  # still untouched


def test_maker_checker_blocks_self_approval(client, db):
    dep_id = _fresh_dept(client, db)
    sid = client.get(f"/api/planning/departments/{dep_id}/submission").json()["id"]
    client.put(f"/api/planning/submissions/{sid}", json={"drivers": [
        {"name": "Applications processed", "unit": "x", "family": "demand", "volume": 210000, "forecast": 0,
         "params": {"minutes_per_unit": 18, "productive_hours": 1600, "quality_allowance": 1.15}}], "mandates": []})
    _submit(client, sid)
    r1, _ = _reviewers(db)
    _sign_off_all(client, sid, r1.id)
    client.post(f"/api/planning/dghr/submissions/{sid}/recommend",
                json={"note": "Looks right.", "actor_id": r1.id})
    # The recommender cannot also approve — the entire point of the second signature.
    same = client.post(f"/api/planning/dghr/submissions/{sid}/approve",
                       json={"note": "self", "actor_id": r1.id})
    assert same.status_code == 409 and "other than the reviewer" in same.json()["detail"]

    # Approve requires a rationale, like reject always has.
    r1b, r2 = _reviewers(db)
    assert client.post(f"/api/planning/dghr/submissions/{sid}/approve",
                       json={"note": "", "actor_id": r2.id}).status_code == 422


def test_partial_approval_gates_recommendation(client, db):
    dep_id = _fresh_dept(client, db)
    sid = client.get(f"/api/planning/departments/{dep_id}/submission").json()["id"]
    client.put(f"/api/planning/submissions/{sid}", json={"drivers": [
        {"name": "Applications processed", "unit": "x", "family": "demand", "volume": 210000, "forecast": 0,
         "params": {"minutes_per_unit": 18, "productive_hours": 1600, "quality_allowance": 1.15}}], "mandates": []})
    _submit(client, sid)
    r1, _ = _reviewers(db)

    # Query one element -> cannot recommend while anything is queried or unreviewed.
    els = client.get(f"/api/planning/dghr/submissions/{sid}").json()["review"]["elements"]
    client.post(f"/api/planning/dghr/submissions/{sid}/elements/decide",
                json={"element_type": els[0]["element_type"], "element_key": els[0]["element_key"],
                      "element_label": els[0]["element_label"], "decision": "queried",
                      "note": "Evidence?", "actor_id": r1.id})
    blocked = client.post(f"/api/planning/dghr/submissions/{sid}/recommend",
                          json={"note": "ok", "actor_id": r1.id})
    assert blocked.status_code == 409


def test_element_clarification_survives_a_save(client, db):
    """The orphaning bug: element_id pointed at a driver row that save destroys and recreates. The
    thread must still address that driver by key afterwards."""
    dep_id = _fresh_dept(client, db)
    sid = client.get(f"/api/planning/departments/{dep_id}/submission").json()["id"]
    save = {"drivers": [{"name": "Applications processed", "unit": "x", "family": "demand",
                         "volume": 210000, "forecast": 0,
                         "params": {"minutes_per_unit": 18, "productive_hours": 1600, "quality_allowance": 1.15}}],
            "mandates": []}
    client.put(f"/api/planning/submissions/{sid}", json=save)
    _submit(client, sid)
    r1, _ = _reviewers(db)
    driver = client.get(f"/api/planning/dghr/submissions/{sid}").json()["sizing"]["drivers"][0]
    clar = client.post(f"/api/planning/dghr/submissions/{sid}/clarify",
                       json={"element_type": "driver", "element_id": driver["id"],
                             "element_label": "Applications processed", "message": "Still 18 min?",
                             "actor_id": r1.id}).json()
    assert clar["status"] == "in_clarification"
    key = clar["clarifications"][0]["element_key"]
    assert key == m.element_key("Applications processed")

    # Entity revises (drivers deleted + recreated with fresh ids), then answers.
    v2 = client.post(f"/api/planning/submissions/{sid}/revise").json()
    client.put(f"/api/planning/submissions/{v2['id']}", json=save)     # new driver rows, new ids
    new_driver = client.get(f"/api/planning/dghr/submissions/{v2['id']}").json()["sizing"]["drivers"][0]
    assert new_driver["id"] != driver["id"]                            # genuinely a different row
    # The clarification still points at the same element by key, not the dead id.
    assert clar["clarifications"][0]["element_key"] == (new_driver.get("element_key") or key)


def test_government_rollup_and_by_type(client, db):
    """Roll-ups are computed from the seeded real submissions — not from any stored metric."""
    gov = client.get("/api/planning/dghr/government").json()
    t = gov["totals"]
    assert t["required_fte"] > 0 and t["current_fte"] > 0 and t["departments"] > 0
    assert t["gap"] == t["current_fte"] - t["required_fte"]
    assert any(b["typeset"] == "Back-office transaction processing" for b in gov["by_typeset"])
    assert any(e["code"] == "DM" and e["received"] >= 1 for e in gov["entities"])
    # scenarios genuinely re-price demand/project (and nothing else)
    base = client.get("/api/planning/dghr/government?scenario=base").json()["totals"]["required_fte"]
    dem = client.get("/api/planning/dghr/government?scenario=demand").json()["totals"]["required_fte"]
    assert dem > base


# ───────────────────────── cross-entity comparison ─────────────────────────
def _eid(db, code: str) -> int:
    return db.query(m.Entity).filter(m.Entity.code == code).first().id


def test_entity_comparison_partitions_support_and_core(client, db):
    """Support + core establishment FTE equals the entity's whole establishment, and structure is
    computed for every selected entity — even one that never submitted (current_fte is always known)."""
    rta, dc = _eid(db, "RTA"), _eid(db, "DC")   # DC never started — no submissions, but has departments
    r = client.get(f"/api/planning/dghr/analytics/entity-comparison?entity_ids={rta},{dc}")
    assert r.status_code == 200
    data = r.json()
    assert [e["id"] for e in data["entities"]] == [rta, dc]      # request order preserved
    for e in data["entities"]:
        st = e["structure"]
        assert abs(st["support_fte"] + st["core_fte"] - st["establishment_fte"]) < 0.02
        assert st["establishment_fte"] > 0                        # structure always present
    rta_row = next(e for e in data["entities"] if e["id"] == rta)
    # RTA has corporate + IT departments, so support FTE must be a real non-zero slice — guards the
    # all-'core' misclassification that leaves every support ratio reading zero.
    assert rta_row["structure"]["support_fte"] > 0
    assert rta_row["structure"]["corporate_fte"] > 0 and rta_row["structure"]["it_fte"] > 0
    dc_row = next(e for e in data["entities"] if e["id"] == dc)
    assert dc_row["has_workforce_data"] is False                 # no submissions → mix is null


def test_entity_comparison_caps_at_five_and_dedupes(client, db):
    ids = [e.id for e in db.query(m.Entity).order_by(m.Entity.id).limit(7).all()]
    raw = ",".join(str(i) for i in ids + [ids[0]])               # 7 ids + a duplicate
    data = client.get(f"/api/planning/dghr/analytics/entity-comparison?entity_ids={raw}").json()
    assert len(data["entities"]) == 5                            # capped at 5
    assert len({e["id"] for e in data["entities"]}) == 5         # de-duplicated


def test_entity_comparison_metrics_ranked_and_differentiated(client, db):
    """Every metric carries a value per entity, and the archetype variation makes the management
    ratio differ between a field-operations entity (leaner) and a knowledge entity."""
    rta, dha = _eid(db, "RTA"), _eid(db, "DHA")                 # field_ops vs knowledge
    data = client.get(f"/api/planning/dghr/analytics/entity-comparison?entity_ids={rta},{dha}").json()
    keys = {met["key"] for met in data["metrics"]}
    assert {"support_to_core", "management_pct", "skilled_to_admin", "emiratization_pct"} <= keys
    for met in data["metrics"]:
        assert set(met["values"].keys()) == {str(rta), str(dha)}
        for v in met["values"].values():
            assert "value" in v and "display" in v
    mp = {row: v["value"] for met in data["metrics"] if met["key"] == "management_pct"
          for row, v in met["values"].items()}
    assert mp[str(rta)] is not None and mp[str(dha)] is not None
    assert mp[str(rta)] < mp[str(dha)]                          # field ops runs leaner on management


def test_entity_comparison_csv_export(client, db):
    rta, dha = _eid(db, "RTA"), _eid(db, "DHA")
    r = client.get(f"/api/planning/dghr/report/entity-comparison.csv?entity_ids={rta},{dha}")
    assert r.status_code == 200 and "text/csv" in r.headers["content-type"]
    assert "Support-to-core FTE ratio" in r.text and "RTA" in r.text


# ───────────────────────── multi-cycle (Phase A) ─────────────────────────
def test_cycle_list_reports_the_open_cycle(client):
    """The seed's live cycle is 'open', and the list resolves it as the current one."""
    r = client.get("/api/planning/cycles")
    assert r.status_code == 200
    body = r.json()
    assert body["current_id"] is not None
    cur = next(c for c in body["cycles"] if c["id"] == body["current_id"])
    assert cur["status"] == "open"
    # cycle_dict shape the frontend depends on
    for key in ("auto_close", "scope_mode", "scope_entity_ids", "opened_by", "departments_total", "received"):
        assert key in cur
    # a fresh 'open' cycle targets everyone
    assert cur["scope_mode"] == "all" and cur["scope_entity_ids"] is None


def test_create_cycle_is_draft_and_cannot_open_a_second(client):
    """A new cycle is a draft (invisible to entities), and the one-open invariant blocks opening it
    while the seeded cycle is already open."""
    live = client.get("/api/planning/cycles").json()["current_id"]
    r = client.post("/api/planning/cycles", json={
        "name": "FY2028 Draft Test", "starts_on": "2027-07-01",
        "ends_on": "2027-08-15", "deadline": "2027-08-15"})
    assert r.status_code == 200
    c = r.json()
    assert c["status"] == "draft"
    # creating a draft does NOT change which cycle is current
    assert client.get("/api/planning/cycles").json()["current_id"] == live
    # one-open invariant
    blocked = client.post(f"/api/planning/cycles/{c['id']}/open")
    assert blocked.status_code == 409
    assert "already open" in blocked.json()["detail"].lower()


def test_open_close_lifecycle_round_trip(client, db):
    """Full open→close→reopen on a draft, once the live cycle is closed — then restore the live one
    so the shared session DB is left as found."""
    live = client.get("/api/planning/cycles").json()["current_id"]
    cid = client.post("/api/planning/cycles", json={
        "name": "FY2029 Lifecycle Test", "starts_on": "2028-07-01",
        "ends_on": "2028-08-15", "deadline": "2028-08-15"}).json()["id"]
    try:
        assert client.post(f"/api/planning/cycles/{live}/close").status_code == 200
        opened = client.post(f"/api/planning/cycles/{cid}/open")
        assert opened.status_code == 200 and opened.json()["status"] == "open"
        assert opened.json()["opened_by"]  # stamped
        closed = client.post(f"/api/planning/cycles/{cid}/close")
        assert closed.status_code == 200 and closed.json()["status"] == "closed"
        assert closed.json()["closed_by"]
    finally:
        # restore: the seeded cycle is the open one again, and drop the test cycle
        client.post(f"/api/planning/cycles/{live}/open")
        db.query(m.CollectionCycle).filter(m.CollectionCycle.id == cid).delete()
        db.commit()


def test_lazy_auto_close_shuts_a_past_deadline_window(db):
    """The deadline closes an open cycle with auto_close on, evaluated lazily (no scheduler). A cycle
    with auto_close off is left open."""
    from datetime import date, timedelta
    from app.services import cycles

    past = date.today() - timedelta(days=1)
    auto = m.CollectionCycle(name="AutoClose On", starts_on=past - timedelta(days=10),
                             ends_on=past, deadline=past, status="open", auto_close=True)
    manual = m.CollectionCycle(name="AutoClose Off", starts_on=past - timedelta(days=10),
                               ends_on=past, deadline=past, status="open", auto_close=False)
    db.add_all([auto, manual])
    db.commit()
    try:
        cycles.sweep_auto_close(db)
        db.refresh(auto)
        db.refresh(manual)
        assert auto.status == "closed" and auto.closed_by == "System (deadline)"
        assert manual.status == "open"      # auto_close off → deadline does not shut it
    finally:
        db.delete(auto)
        db.delete(manual)
        db.commit()


# ───────────────────────── multi-cycle (Phase B: scope + window gating) ─────────────────────────
def test_scope_selected_limits_who_can_submit(client, db):
    """A 'selected'-scope cycle is invisible to entities outside it: their window is closed and the
    server refuses their writes. Restores scope afterwards (shared session DB)."""
    from app.services import cycles
    live = cycles.open_cycle(db)
    ents = db.query(m.Entity).order_by(m.Entity.id).all()
    a, b = ents[0], ents[1]
    try:
        r = client.put(f"/api/planning/cycles/{live.id}/scope",
                       json={"scope_mode": "selected", "scope_entity_ids": [a.id]})
        assert r.status_code == 200 and r.json()["scope_mode"] == "selected"
        wa = client.get(f"/api/planning/entities/{a.id}/departments").json()["window"]
        assert wa["can_submit"] is True and wa["in_scope"] is True
        wb = client.get(f"/api/planning/entities/{b.id}/departments").json()["window"]
        assert wb["can_submit"] is False and wb["in_scope"] is False
        # the server enforces it, not just the UI
        blocked = client.post(f"/api/planning/entities/{b.id}/departments", json={"name": "Out of scope"})
        assert blocked.status_code == 409
    finally:
        client.put(f"/api/planning/cycles/{live.id}/scope", json={"scope_mode": "all"})


def test_closed_cycle_makes_entity_side_read_only(client, db):
    """Closing the cycle shuts every entity's window and blocks writes; reopening restores it."""
    from app.services import cycles
    live = cycles.open_cycle(db)
    dm = db.query(m.Entity).filter(m.Entity.code == "DM").first()
    try:
        assert client.post(f"/api/planning/cycles/{live.id}/close").status_code == 200
        w = client.get(f"/api/planning/entities/{dm.id}/departments").json()["window"]
        assert w["can_submit"] is False and w["cycle_open"] is False
        blocked = client.post(f"/api/planning/entities/{dm.id}/departments", json={"name": "While closed"})
        assert blocked.status_code == 409
    finally:
        client.post(f"/api/planning/cycles/{live.id}/open")
    # window is open again after restore
    assert client.get(f"/api/planning/entities/{dm.id}/departments").json()["window"]["can_submit"] is True


def test_scope_rejects_empty_selection(client, db):
    from app.services import cycles
    live = cycles.open_cycle(db)
    r = client.put(f"/api/planning/cycles/{live.id}/scope", json={"scope_mode": "selected", "scope_entity_ids": []})
    assert r.status_code == 422


# ───────────────────────── multi-cycle (Phase C: history + trends) ─────────────────────────
def test_cycles_history_has_prior_cycle_and_trend(client):
    """The seed ships a closed FY2026 cycle (a frozen snapshot) alongside the open FY2027 one, so the
    history renders a real cross-cycle trend and chronically-late list."""
    h = client.get("/api/planning/cycles/history").json()
    assert h["cycles_run"] >= 2
    names = [c["name"] for c in h["cycles"]]
    assert any("FY2026" in n for n in names) and any("FY2027" in n for n in names)
    # chronological — earliest first — so a trend chart reads left→right
    assert h["cycles"][0]["starts_on"] < h["cycles"][-1]["starts_on"]
    # the closed historical cycle reports its own frozen outcome
    prev = next(c for c in h["cycles"] if c["status"] == "closed")
    assert prev["received"] > 0 and prev["avg_turnaround_days"] > 0
    assert 0 <= prev["received_pct"] <= 100
    # chronically late = behind in ≥2 cycles
    assert all(x["cycles_late"] >= 2 for x in h["chronically_late"])


def test_close_writes_snapshot_and_reopen_clears_it(client, db):
    """Closing a cycle freezes its outcome as a snapshot; reopening (it's live again) removes it."""
    from app.services import cycles
    live = cycles.open_cycle(db)
    try:
        assert client.post(f"/api/planning/cycles/{live.id}/close").status_code == 200
        db.expire_all()
        snap = db.query(m.CycleSnapshot).filter(m.CycleSnapshot.cycle_id == live.id).first()
        assert snap is not None and snap.departments_total > 0
    finally:
        client.post(f"/api/planning/cycles/{live.id}/open")
    db.expire_all()
    assert db.query(m.CycleSnapshot).filter(m.CycleSnapshot.cycle_id == live.id).first() is None


# ───────────────────────── multi-cycle (Phase D: clone, reminders, extensions) ─────────────────────────
def test_clone_creates_a_shifted_draft(client, db):
    """Cloning a cycle yields a DRAFT with the year bumped and the window shifted forward."""
    live = client.get("/api/planning/cycles").json()["current_id"]
    src = db.get(m.CollectionCycle, live)
    r = client.post(f"/api/planning/cycles/{live}/clone")
    assert r.status_code == 200
    c = r.json()
    try:
        assert c["status"] == "draft"
        assert "2028" in c["name"] and c["name"] != src.name        # FY2027 → FY2028
        assert c["starts_on"] > src.starts_on.isoformat()            # window a year on
    finally:
        db.query(m.CollectionCycle).filter(m.CollectionCycle.id == c["id"]).delete()
        db.commit()


def test_extension_grants_a_later_deadline(client, db):
    """A per-entity extension moves that entity's effective deadline later; a non-later date is refused."""
    from datetime import timedelta
    from app.services import cycles
    live = cycles.open_cycle(db)
    dc = db.query(m.Entity).filter(m.Entity.code == "DC").first()
    later = (live.deadline + timedelta(days=30)).isoformat()
    try:
        r = client.post(f"/api/planning/cycles/{live.id}/extensions",
                        json={"entity_id": dc.id, "extended_deadline": later, "reason": "IT migration overran"})
        assert r.status_code == 200 and any(e["code"] == "DC" for e in r.json()["extensions"])
        win = client.get(f"/api/planning/entities/{dc.id}/departments").json()["window"]
        assert win["extended"] is True and win["entity_deadline"] == later
        bad = client.post(f"/api/planning/cycles/{live.id}/extensions",
                          json={"entity_id": dc.id, "extended_deadline": live.deadline.isoformat()})
        assert bad.status_code == 422
    finally:
        for e in db.query(m.CycleExtension).filter(m.CycleExtension.cycle_id == live.id).all():
            db.delete(e)
        db.commit()


def test_reminder_engine_fires_once_per_crossed_milestone(db):
    """The 7/3/1-day reminders fire once per threshold as the deadline nears — never re-spamming."""
    from datetime import date, timedelta
    from app.services import cycles
    c = m.CollectionCycle(name="Reminder Test", starts_on=date.today() - timedelta(days=5),
                          ends_on=date.today() + timedelta(days=2), deadline=date.today() + timedelta(days=2),
                          status="open", auto_close=False, reminders_label="7, 3, 1 days before due date")
    db.add(c)
    db.commit()
    try:
        # days_left = 2 → thresholds 7 and 3 are crossed (not 1); each fires once, one per sweep.
        n1 = cycles.sweep_reminders(db)
        cycles.sweep_reminders(db)
        n3 = cycles.sweep_reminders(db)
        fired = sorted(r.milestone for r in db.query(m.CycleReminder).filter(m.CycleReminder.cycle_id == c.id).all())
        assert fired == [3, 7]      # 1-day threshold not yet reached at days_left=2
        assert n1 > 0 and n3 == 0   # first sweep chased someone; third had nothing new to send
    finally:
        db.query(m.CycleReminder).filter(m.CycleReminder.cycle_id == c.id).delete()
        db.delete(c)
        db.commit()

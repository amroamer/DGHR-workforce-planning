"""Consistency gate for the planning (department + sizing) model. Run: `python -m app.checks`.

Prints ✓ per assertion; exits non-zero if any fail. Everything is derived — no hardcoded KPIs —
so these assert INVARIANTS (things that must reconcile), not fixed demo numbers.
"""

from __future__ import annotations

import sys

from app.db import SessionLocal
from app import models as m
from app.planning_seed import TYPESETS, ENTITIES
from app.services import calc_config, cycles, human_capital, review, revisions, sizing, supply, trace, versioning

PASS = "✓"
FAIL = "✗"


def run_checks() -> int:
    db = SessionLocal()
    failures = 0

    def check(label: str, ok: bool, detail: str = "") -> None:
        nonlocal failures
        mark = PASS if ok else FAIL
        print(f"  {mark} {label}{(' — ' + detail) if detail else ''}")
        if not ok:
            failures += 1

    try:
        # ── structure ──
        check("typesets = %d" % len(TYPESETS), db.query(m.Typeset).count() == len(TYPESETS))
        check("entities = %d" % len(ENTITIES), db.query(m.Entity).count() == len(ENTITIES))
        expected_depts = sum(len(dlist) for _, _, dlist in ENTITIES)
        check("departments = %d" % expected_depts, db.query(m.Department).count() == expected_depts,
              str(db.query(m.Department).count()))

        subs = db.query(m.DepartmentSubmission).all()
        check("submissions exist", len(subs) > 0, str(len(subs)))

        # ── sizing invariants (per submission) ──
        bad_split, bad_gap = 0, 0
        for s in subs:
            sz = sizing.submission_sizing(db, s)
            if sum(x["fte"] for x in sz["family_split"]) != sz["required_fte"]:
                bad_split += 1
            # Tolerance, not equality: supply is fractional now (a half-timer is 0.5 FTE), so this
            # is a float comparison rather than an integer one.
            if abs(sz["gap"] - (sz["current_fte"] - sz["required_fte"])) > 0.011:
                bad_gap += 1
        check("family split reconciles with required FTE (all submissions)", bad_split == 0, f"{bad_split} bad")
        check("gap = current − required (all submissions)", bad_gap == 0, f"{bad_gap} bad")

        # ── measures: every Required FTE must know which period it states ──
        # The forecast measure and the projection's year-1 demand are two routes to the same
        # question ("what will next cycle need?"). They must never disagree, or the headline and the
        # chart beside it are telling a reviewer different things.
        bad_measure, bad_change, bad_proj = 0, 0, 0
        cycle0 = cycles.current_cycle(db)
        by0 = cycle0.starts_on.year if cycle0 else 2026
        for s in subs:
            sz = sizing.submission_sizing(db, s)
            keys = {x["key"] for x in sz["measures"]}
            if not {"current", "forecast", "planning_change"} <= keys:
                bad_measure += 1
            got = {x["key"]: x["value"] for x in sz["measures"]}
            if got.get("current") != sz["required_fte"]:
                bad_measure += 1
            if got.get("planning_change") != got.get("forecast", 0) - got.get("current", 0):
                bad_change += 1
            pr = sizing.submission_projection(db, s, base_year=by0)
            if len(pr["points"]) > 1 and pr["points"][1]["demand"] != sz["forecast_required_fte"]:
                bad_proj += 1
        check("every submission states all three measures", bad_measure == 0, f"{bad_measure} bad")
        check("planning change = forecast − current", bad_change == 0, f"{bad_change} bad")
        check("forecast measure = projection year-1 demand", bad_proj == 0, f"{bad_proj} bad")

        # ── government roll-up reconciles ──
        gov = sizing.government_sizing(db)
        check("gov gap = current − required", gov["totals"]["gap"] ==
              gov["totals"]["current_fte"] - gov["totals"]["required_fte"])
        check("gov required = Σ entity required",
              gov["totals"]["required_fte"] == sum(e["required_fte"] for e in gov["entities"]))

        # ── position basis + coverage ──
        # The whole point of `basis` is that a headline can never be read without its coverage, so
        # the coverage block must reconcile with the totals it describes under EVERY basis.
        by_basis = {b: sizing.government_sizing(db, basis=b) for b in sizing.BASIS_KEYS}
        for key, g in by_basis.items():
            c = g["coverage"]
            check(f"[{key}] gap = current − required",
                  g["totals"]["gap"] == g["totals"]["current_fte"] - g["totals"]["required_fte"])
            check(f"[{key}] coverage counted = totals departments",
                  c["departments_counted"] == g["totals"]["departments"],
                  f"{c['departments_counted']} vs {g['totals']['departments']}")
            check(f"[{key}] counted = actual + estimated",
                  c["departments_counted"] == c["departments_actual"] + c["departments_estimated"])
            check(f"[{key}] required = Σ entity required",
                  g["totals"]["required_fte"] == sum(e["required_fte"] for e in g["entities"]))
            check(f"[{key}] every entity carries a ladder status",
                  all(e["rollup_status"] in sizing.ROLLUP_LADDER for e in g["entities"]))

        total_depts = by_basis["received"]["coverage"]["departments_total"]
        check("approved ⊆ received (same active-submission basis)",
              by_basis["approved"]["coverage"]["departments_approved"] <=
              by_basis["received"]["coverage"]["departments_received"])
        check("approved position counts only approved departments",
              by_basis["approved"]["totals"]["departments"] ==
              by_basis["approved"]["coverage"]["departments_approved"])
        check("estimated position covers every department",
              by_basis["estimated"]["totals"]["departments"] == total_depts,
              f"{by_basis['estimated']['totals']['departments']} of {total_depts}")
        check("received + outstanding = total",
              by_basis["received"]["coverage"]["departments_received"] +
              by_basis["received"]["coverage"]["departments_outstanding"] == total_depts)
        check("only a fully-approved cycle is an official position",
              all(not g["coverage"]["official"] for k, g in by_basis.items() if k != "approved")
              and by_basis["approved"]["coverage"]["official"] ==
              (by_basis["approved"]["coverage"]["departments_approved"] == total_depts))
        # A partially-submitted entity must never read as submitted — the bug this basis work fixes.
        rollup = {e["entity_id"]: e for e in by_basis["received"]["entities"]}
        check("partial entities never report a 'fully' status",
              all(e["rollup_status"] in ("not_started", "in_progress", "partially_submitted")
                  for e in rollup.values() if e["received"] < e["dept_count"]),
              f"{sum(1 for e in rollup.values() if e['received'] < e['dept_count'])} partial")
        check("'complete' basis counts only fully-received entities",
              all(e["counted"] == 0 for e in by_basis["complete"]["entities"]
                  if e["received"] < e["dept_count"]))
        # A rung the seed never produces is a rung nobody has ever seen render. The seed assigns
        # these deliberately per entity (seed_clean._ENTITY_PLAN), so this guards that intent.
        seen_rungs = {e["rollup_status"] for e in by_basis["received"]["entities"]}
        missing = [r for r in sizing.ROLLUP_LADDER if r not in seen_rungs]
        check("seed exercises every rung of the roll-up ladder", not missing,
              f"missing: {', '.join(missing)}" if missing else f"all {len(sizing.ROLLUP_LADDER)}")
        check("at least one entity is complete (so the 'complete' basis has something to count)",
              by_basis["received"]["coverage"]["entities_complete"] > 0,
              f"{by_basis['received']['coverage']['entities_complete']} of "
              f"{by_basis['received']['coverage']['entities_total']}")

        # Panels on one screen must stand on the same departments as the headline beside them.
        # The bug this guards: the headline followed `basis` while Human Capital stayed pinned to
        # received, putting "Current FTE 6,421" next to a "4,741 headcount" on the same view.
        # Compared on AVAILABLE FTE, not headcount — headcount is people and supply is time, and
        # asserting those equal is what made the two concepts impossible to tell apart.
        for key in ("received", "approved", "complete"):
            h = human_capital.government_human_capital(db, basis=key)
            check(f"[{key}] HC available FTE = sizing current FTE",
                  abs(h["supply"]["available_fte"] - by_basis[key]["totals"]["current_fte"]) < 0.011,
                  f"{h['supply']['available_fte']} vs {by_basis[key]['totals']['current_fte']}")
        check("[estimated] HC stays on actuals rather than inventing a workforce profile",
              human_capital.government_human_capital(db, basis="estimated")["departments_counted"]
              == by_basis["received"]["coverage"]["departments_received"])

        # ── review workflow: versions, immutability, maker-checker ──
        # The bug these guard: save_submission blocked only status 'submitted', so an APPROVED
        # submission could be rewritten in place — staying approved, keeping its sign-off note, and
        # still feeding the Official government position with numbers nobody approved.
        all_subs = db.query(m.DepartmentSubmission).all()
        check("every submission has a version number",
              all(s.version and s.version >= 1 for s in all_subs))
        check("only drafts are editable",
              all(not versioning.is_editable(db, s) for s in all_subs if s.status != "draft"))
        check("no approved submission is editable",
              all(not versioning.is_editable(db, s) for s in all_subs if s.status == "approved"))
        # A version chain must be a chain: one successor each, and strictly increasing.
        bad_chain = 0
        for dept in db.query(m.Department).all():
            vs = versioning.versions(db, dept.id)
            for a, b in zip(vs, vs[1:]):
                if b.version <= a.version or b.supersedes_id != a.id:
                    bad_chain += 1
            for v in vs:
                if len(db.query(m.DepartmentSubmission).filter(
                        m.DepartmentSubmission.supersedes_id == v.id).all()) > 1:
                    bad_chain += 1
        check("version chains are linear (one successor, increasing)", bad_chain == 0, f"{bad_chain} bad")
        check("a superseded version keeps its own status (history is not rewritten)",
              all(s.status in m.SUBMISSION_STATUSES for s in all_subs))

        # THE control: an approval signed by whoever recommended it is not a second signature.
        self_signed = [s for s in all_subs
                       if s.status == "approved" and s.recommended_by_id
                       and s.recommended_by_id == s.decided_by_id]
        check("no approval is signed by the person who recommended it (maker-checker)",
              not self_signed, f"{len(self_signed)} self-signed")
        approved_subs = [s for s in all_subs if s.status == "approved"]
        check("every approved submission names its approver",
              all(s.decided_by_id and s.decided_by_name for s in approved_subs),
              f"{sum(1 for s in approved_subs if not s.decided_by_id)} unattributed")
        check("every approved submission was recommended first",
              all(s.recommended_by_id and s.recommendation == "approve" for s in approved_subs),
              f"{sum(1 for s in approved_subs if not s.recommended_by_id)} unrecommended")
        check("every approved submission carries a rationale",
              all((s.decision_note or "").strip() for s in approved_subs))
        check("maker-checker has at least two reviewers to check with",
              len(review.reviewers(db)) >= 2, f"{len(review.reviewers(db))} reviewers")

        # Element addressing must survive a save (rows are deleted/recreated) and a version copy.
        check("every driver carries a stable element key",
              all(d.element_key == m.element_key(d.name)
                  for d in db.query(m.SubmissionDriver).all()))
        check("every clarification addresses an element by key, not a destroyed row id",
              all((c.element_key or "").strip()
                  for c in db.query(m.SubmissionClarification).all()))
        # A recommendation stands on every element being signed off.
        recommended = [s for s in all_subs if s.status in ("recommended", "approved")]
        unbacked = [s for s in recommended if not review.review_state(db, s)["all_approved"]]
        check("no submission is recommended with an element still queried or unreviewed",
              not unbacked, f"{len(unbacked)} unbacked")

        # Every submission that left the entity carries a signed attestation — it can't be sent
        # without one, and the attestation is bound to the exact figures confirmed.
        sent = [s for s in all_subs if s.status != "draft"]
        check("every sent submission is attested by a named person",
              all(s.attested and (s.attested_by or "").strip() for s in sent),
              f"{sum(1 for s in sent if not s.attested)} unattested")
        check("no draft claims to be attested",
              all(not s.attested for s in all_subs if s.status == "draft"))
        # Provenance a reviewer can check: every driver states where its volume came from.
        check("every driver states a source",
              all((d.source or '').strip() for d in db.query(m.SubmissionDriver).all()))
        # Supporting evidence travels with the figures — some documents attach to a department.
        dept_docs = db.query(m.Upload).filter(m.Upload.kind == "document",
                                              m.Upload.department_id.isnot(None)).count()
        check("seed attaches documents to departments (not only entities)", dept_docs > 0,
              f"{dept_docs} department documents")

        # A state the seed never produces is a state nobody has seen render.
        check("seed exercises a version chain (a revision exists)",
              any(s.supersedes_id for s in all_subs),
              f"{sum(1 for s in all_subs if s.supersedes_id)} revisions")
        sla_days, escalate_after = review.sla(db)
        levels = {revisions.clarification_age(c, sla_days=sla_days, escalate_after=escalate_after)["level"]
                  for c in db.query(m.SubmissionClarification).all()}
        check("seed exercises clarification escalation", "escalated" in levels,
              f"levels seen: {', '.join(sorted(levels)) or 'none'}")

        # ── workforce profile invariants ──
        # NOTE: there is deliberately NO "headcount == current FTE" check any more. That assertion
        # used to pass only because headcount was BUILT by rounding the department's FTE, which made
        # part-time impossible to express — it encoded the bug as an invariant. FTE and headcount are
        # now separate measures, and what must hold between them is an INEQUALITY, not an equality.
        received = [s for s in subs if s.status in sizing.RECEIVED]
        bad_rows, bad_fte, bad_emr, bad_recon = 0, 0, 0, 0
        for s in received:
            rows = db.query(m.SubmissionWorkforceRow).filter(
                m.SubmissionWorkforceRow.submission_id == s.id).all()
            if len(rows) != len(human_capital.JOB_LEVELS):
                bad_rows += 1
            if any(float(r.fte or 0) > int(r.headcount or 0) + 1e-9 for r in rows):
                bad_fte += 1                       # time can never exceed the people supplying it
            if any(int(r.emirati_count) > int(r.headcount) for r in rows):
                bad_emr += 1
            dept = db.get(m.Department, s.department_id)
            if abs(sum(float(r.fte or 0) for r in rows) - float(dept.current_fte or 0)) > 0.011:
                bad_recon += 1                     # the profile must add up to the department's FTE
        check("every received submission has %d workforce rows" % len(human_capital.JOB_LEVELS),
              bad_rows == 0, f"{bad_rows} bad")
        check("FTE ≤ headcount at every job level", bad_fte == 0, f"{bad_fte} bad")
        check("workforce FTE reconciles with the department's establishment FTE",
              bad_recon == 0, f"{bad_recon} bad")
        check("Emirati count ≤ headcount everywhere", bad_emr == 0, f"{bad_emr} bad")

        # ── demographic bands (HC Overview donuts) ──
        # Each dimension must partition the department's filled headcount exactly, or a donut would
        # quietly disagree with the workforce total it splits. The nationality Emirati bucket must
        # also equal the real Emirati count, so that donut reconciles with the Emiratization %.
        bad_band_sum, bad_band_emr, band_dims_seen = 0, 0, set()
        for s in received:
            filled = sum(int(r.headcount or 0) for r in db.query(m.SubmissionWorkforceRow)
                         .filter(m.SubmissionWorkforceRow.submission_id == s.id).all())
            emirati = sum(int(r.emirati_count or 0) for r in db.query(m.SubmissionWorkforceRow)
                          .filter(m.SubmissionWorkforceRow.submission_id == s.id).all())
            bands = db.query(m.SubmissionWorkforceBand).filter(
                m.SubmissionWorkforceBand.submission_id == s.id).all()
            by_dim: dict[str, int] = {}
            emr_bucket = 0
            for b in bands:
                by_dim[b.dimension] = by_dim.get(b.dimension, 0) + int(b.headcount or 0)
                band_dims_seen.add(b.dimension)
                if b.dimension == "nationality" and b.bucket == "emirati":
                    emr_bucket += int(b.headcount or 0)
            # An un-entered dimension (all zero) is allowed; an entered one must reconcile exactly.
            if any(total not in (0, filled) for total in by_dim.values()):
                bad_band_sum += 1
            if by_dim.get("nationality") == filled and emr_bucket != emirati:
                bad_band_emr += 1
        check("every entered demographic dimension sums to filled headcount", bad_band_sum == 0,
              f"{bad_band_sum} bad")
        check("nationality Emirati bucket = real Emirati count", bad_band_emr == 0,
              f"{bad_band_emr} bad")
        missing_dims = [d for d in m.WORKFORCE_BAND_DIMENSIONS if d not in band_dims_seen]
        check("seed exercises every demographic dimension", not missing_dims,
              f"missing: {', '.join(missing_dims)}" if missing_dims else f"all {len(m.WORKFORCE_BAND_DIMENSIONS)}")

        # ── supply: establishment → people → adjustments → available ──
        bad_vac, bad_avail, bad_sign = 0, 0, 0
        part_time_seen = adjusted_seen = 0
        for s in received:
            sup = supply.submission_supply(db, s)
            if sup["vacancies"] != sup["approved_positions"] - sup["filled_positions"]:
                bad_vac += 1
            if abs(sup["available_fte"] - (sup["establishment_fte"] + sup["net_adjustment_fte"])) > 0.011:
                bad_avail += 1
            for a in sup["adjustments"]:
                # An adjustment excluded from supply must move nothing; a loan out must never add.
                if not a["counts_in_supply"] and a["signed_fte"] != 0:
                    bad_sign += 1
                if a["kind"] == "secondment_out" and a["signed_fte"] > 0:
                    bad_sign += 1
            part_time_seen += 1 if sup["part_time_fte_gap"] > 0 else 0
            adjusted_seen += 1 if sup["adjustments"] else 0
        # A roll-up that drops keys its consumers expect is a white screen, not a wrong number —
        # `_sum_supply` once omitted `flags`/`adjustments` and crashed the whole Government page.
        if received:
            one = supply.submission_supply(db, received[0])
            rolled = supply._sum_supply([one])
            missing_keys = sorted(set(one) - set(rolled))
            check("rolled-up supply keeps the same shape as a department's",
                  not missing_keys, f"missing: {', '.join(missing_keys)}" if missing_keys else "identical")
        check("vacancies = approved − filled (never stored)", bad_vac == 0, f"{bad_vac} bad")
        check("available = establishment FTE + net adjustments", bad_avail == 0, f"{bad_avail} bad")
        check("excluded adjustments move nothing; loans out never add", bad_sign == 0, f"{bad_sign} bad")
        # A concept the seed never exercises is a concept nobody has seen work.
        check("seed exercises part-time (FTE below headcount)", part_time_seen > 0,
              f"{part_time_seen} departments")
        check("seed exercises non-establishment capacity", adjusted_seen > 0,
              f"{adjusted_seen} departments")
        kinds_seen = {a.kind for a in db.query(m.WorkforceAdjustment).all()}
        missing_kinds = [k for k in m.ADJUSTMENT_KINDS if k not in kinds_seen]
        check("seed exercises every adjustment kind", not missing_kinds,
              f"missing: {', '.join(missing_kinds)}" if missing_kinds else f"all {len(m.ADJUSTMENT_KINDS)}")

        # ── Human Capital ↔ sizing reconciliation ──
        # Sizing's "current_fte" is AVAILABLE FTE (net of secondments), while HC reports the
        # establishment on payroll. They are different questions, so the bridge between them is
        # establishment + net adjustments, not equality.
        hc = human_capital.government_human_capital(db)
        gsup = hc["supply"]
        check("HC establishment FTE = Σ department establishment FTE (gov-wide)",
              abs(hc["fte"] - gsup["establishment_fte"]) < 0.011,
              f"{hc['fte']} vs {gsup['establishment_fte']}")
        check("gov available FTE = sizing current FTE",
              abs(gsup["available_fte"] - gov["totals"]["current_fte"]) < 0.011,
              f"{gsup['available_fte']} vs {gov['totals']['current_fte']}")
        check("HC headcount = Σ entity headcount",
              hc["headcount"] == sum(e["headcount"] for e in hc["entities"]))
        check("gov headcount ≥ establishment FTE (part-timers)",
              hc["headcount"] >= hc["fte"], f"{hc['headcount']} vs {hc['fte']}")
        check("Emiratization within 0–100%", 0 <= hc["emiratization_pct"] <= 100,
              f"{hc['emiratization_pct']}%")
        check("job-level mix sums to headcount",
              sum(b["headcount"] for b in hc["by_level"]) == hc["headcount"])

        # ── projection invariants ──
        cycle = cycles.current_cycle(db)
        base_year = cycle.starts_on.year if cycle else 2026
        proj = sizing.government_projection(db, base_year=base_year)
        horizon = sizing.horizon_years(db)
        check("projection has %d yearly points" % horizon,
              len(proj["points"]) == horizon, str(len(proj["points"])))
        check("projection year-0 gap = point-in-time gap",
              proj["points"][0]["gap"] == gov["totals"]["gap"],
              f"{proj['points'][0]['gap']} vs {gov['totals']['gap']}")
        for key in ("received", "approved", "complete"):
            p = sizing.government_projection(db, basis=key, base_year=base_year)
            check(f"[{key}] projection year-0 gap = point-in-time gap",
                  p["points"][0]["gap"] == by_basis[key]["totals"]["gap"],
                  f"{p['points'][0]['gap']} vs {by_basis[key]['totals']['gap']}")

        print()
        if failures == 0:
            print(f"All consistency checks passed {PASS}")
        else:
            print(f"{failures} check(s) FAILED {FAIL}")
        return 1 if failures else 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(run_checks())

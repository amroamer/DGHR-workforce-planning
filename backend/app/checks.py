"""Consistency gate (SPEC §7.7). Run: `python -m app.checks`.

Prints ✓ per assertion; exits non-zero if any fail. This is the Phase 0 gate.
"""

from __future__ import annotations

import sys

from sqlalchemy import func

from app.db import SessionLocal
from app import models as m

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
        entities = db.query(m.Entity).all()
        total = len(entities)
        check("entities total = 59", total == 59, str(total))

        # status distribution sums to 59
        from collections import Counter
        dist = Counter(e.status for e in entities)
        check("status counts sum to 59", sum(dist.values()) == 59, str(dict(dist)))

        received = sum(1 for e in entities if e.status in ("submitted", "under_review", "approved"))
        check("submissions received = 27", received == 27, str(received))
        check("27/59 ≈ 45.8%", abs(received / total * 100 - 45.8) < 0.2, f"{received/total*100:.1f}%")

        overdue = sum(1 for e in entities if e.overdue)
        check("overdue = 9", overdue == 9, str(overdue))

        ready = sum(1 for e in entities if e.completeness >= 80 and (e.quality_score or 0) >= 75
                    and e.status in ("submitted", "under_review"))
        blocked = total - ready
        check("forecasting-ready = 11", ready == 11, str(ready))
        check("forecasting 11 + 48 = 59", ready + blocked == 59, f"{ready}+{blocked}")

        # DM package mean = 68 (applicable packages)
        dm = db.query(m.Entity).filter(m.Entity.code == "DM").one()
        dm_pkgs = db.query(m.EntityPackage).filter(
            m.EntityPackage.entity_id == dm.id, m.EntityPackage.applicable.is_(True)
        ).all()
        dm_mean = sum(p.progress for p in dm_pkgs) / len(dm_pkgs) if dm_pkgs else 0
        check("DM applicable packages = 5", len(dm_pkgs) == 5, str(len(dm_pkgs)))
        check("DM package mean = 68", round(dm_mean) == 68, f"{dm_mean:.1f}")

        # workforce map split 1187 / 34 / 27 = 1248
        wf = db.query(m.WorkforceRecord).filter(m.WorkforceRecord.entity_id == dm.id).all()
        mapped = sum(1 for r in wf if r.map_status == "mapped")
        partial = sum(1 for r in wf if r.map_status == "partial")
        unmapped = sum(1 for r in wf if r.map_status == "unmapped")
        check("workforce total = 1248", len(wf) == 1248, str(len(wf)))
        check("workforce 1187 + 34 + 27 = 1248", (mapped, partial, unmapped) == (1187, 34, 27),
              f"{mapped}/{partial}/{unmapped}")

        # workforce issues 18 + 12 + 5 + 2 = 37
        def count_issue(tag: str) -> int:
            return sum(1 for r in wf if tag in (r.issues or []))
        mg, it, me, nf = (count_issue("missing_grade"), count_issue("inconsistent_title"),
                          count_issue("missing_employment_type"), count_issue("negative_zero_fte"))
        check("workforce issues 18+12+5+2 = 37", (mg, it, me, nf) == (18, 12, 5, 2),
              f"{mg}/{it}/{me}/{nf}")

        # rule_stats totals 1248 / 164
        rs = db.query(m.RuleStat).all()
        tp = sum(r.passed for r in rs)
        tf = sum(r.failed for r in rs)
        check("rule_stats passed = 1248", tp == 1248, str(tp))
        check("rule_stats failed = 164", tf == 164, str(tf))

        # packages 386 / 212 / 174
        pkgs = db.query(m.DataPackage).all()
        check("data packages = 8", len(pkgs) == 8, str(len(pkgs)))
        check("package fields 386 / 212 / 174",
              (sum(p.total_fields for p in pkgs), sum(p.mandatory_fields for p in pkgs),
               sum(p.optional_fields for p in pkgs)) == (386, 212, 174),
              f"{sum(p.total_fields for p in pkgs)}/{sum(p.mandatory_fields for p in pkgs)}/{sum(p.optional_fields for p in pkgs)}")

        # DM open cases = 3
        dm_open = db.query(m.Case).filter(m.Case.entity_id == dm.id, m.Case.status == "open").count()
        check("DM open cases = 3", dm_open == 3, str(dm_open))

        # pinned tracker rows exist
        pinned_codes = ["DHA", "RTA", "DM", "DP", "DEWA", "KHDA", "DCAA", "DC", "DSC", "DET"]
        present = {c for (c,) in db.query(m.Entity.code).filter(m.Entity.code.in_(pinned_codes)).all()}
        check("10 pinned tracker rows exist", set(pinned_codes) == present, str(sorted(present)))

        # vision preview tables
        check("skills_gap_preview has 5 ranked rows",
              db.query(m.SkillsGapPreview).count() == 5)
        check("scenario_preview has exactly 3", db.query(m.ScenarioPreview).count() == 3)
        vm_keys = {k for (k,) in db.query(m.VisionMetric.key).all()}
        needed = {"current_workforce", "forecast_demand_fy_plus1", "workforce_gaps", "growth",
                  "reduction", "budget_impact", "evidence_items_total", "evidence_missing"}
        check("vision_metrics keys complete", needed.issubset(vm_keys),
              str(sorted(needed - vm_keys)) if not needed.issubset(vm_keys) else "")

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

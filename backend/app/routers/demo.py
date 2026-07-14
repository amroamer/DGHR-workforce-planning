from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.seed import run_seed
from app.checks import run_checks
from app.services import cases as cases_svc
from app.services import workflow
from app import models as m

router = APIRouter(prefix="/api/demo", tags=["demo"])


@router.post("/reset")
def reset() -> dict:
    """Re-run the canonical seed (SPEC §14). Idempotent."""
    run_seed()
    return {"ok": True, "message": "Demo data reset to canonical §7 scenario."}


@router.post("/simulate-submissions")
def simulate_submissions(n: int = 3, db: Session = Depends(get_db)) -> dict:
    """Submit a package for N in-progress entities so dashboards move mid-pitch (§14)."""
    entities = db.query(m.Entity).filter(m.Entity.status == "in_progress").limit(n).all()
    submitted = []
    for e in entities:
        ep = db.query(m.EntityPackage).filter(
            m.EntityPackage.entity_id == e.id, m.EntityPackage.applicable.is_(True),
            m.EntityPackage.progress < 100,
        ).order_by(m.EntityPackage.progress.desc()).first()
        if ep:
            pkg = db.get(m.DataPackage, ep.package_id)
            cases_svc.submit_package(db, entity_id=e.id, package_key=pkg.key)
            submitted.append({"entity": e.name, "package": pkg.name})
    return {"ok": True, "submitted": submitted}


@router.post("/trigger-anomaly")
def trigger_anomaly(db: Session = Depends(get_db)) -> dict:
    """Add a fresh AI anomaly + DGHR alert + notification (§14)."""
    e = db.query(m.Entity).filter(m.Entity.code == "DEWA").first() or db.query(m.Entity).first()
    a = m.Anomaly(entity_id=e.id, title="Sudden drop in reported workload without headcount change",
                  detail="", package_key="workload_service", severity="High", confidence=93)
    db.add(a)
    db.add(m.Alert(severity="warning", title="New AI anomaly detected",
                   body=f"Workload–headcount mismatch flagged at {e.name}.",
                   created_at=datetime.utcnow()))
    workflow.notify(db, audience="dghr", kind="ai_flag", entity_id=e.id,
                    title="AI anomaly detected", body=f"Workload–headcount mismatch at {e.name} (93% confidence).")
    workflow.bump_last_updated(db)
    db.commit()
    return {"ok": True, "anomaly_id": a.id}


@router.post("/advance-trend")
def advance_trend(db: Session = Depends(get_db)) -> dict:
    """Append a point to the Collection Progress Trend (§14)."""
    state = db.get(m.AppState, 1)
    pts = list(state.trend_points or [])
    last = pts[-1]["value"] if pts else 46
    pts.append({"label": f"W{len(pts) + 1}", "value": min(100, last + 6)})
    state.trend_points = pts
    workflow.bump_last_updated(db)
    db.commit()
    return {"ok": True, "points": len(pts)}


@router.get("/seed-check")
def seed_check(db: Session = Depends(get_db)) -> dict:
    """Lightweight health signal for the DemoPanel (§14)."""
    code = run_checks()
    return {"passed": code == 0}

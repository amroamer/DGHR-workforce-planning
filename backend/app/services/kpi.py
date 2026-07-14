"""KPI computation (SPEC §6 formulas). No numeric metric literals live in the frontend —
every count/percentage the UI renders originates here.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app import models as m

RECEIVED_STATUSES = ("submitted", "under_review", "approved")

STATUS_ORDER = [
    ("not_started", "Not Started"),
    ("in_progress", "In Progress"),
    ("submitted", "Submitted"),
    ("under_review", "Under Review"),
    ("returned", "Returned"),
    ("approved", "Approved"),
]

# missing-data summary package keys → display labels (screen 01)
MISSING_KEYS = [
    ("org_structure", "Org Structure"),
    ("current_workforce", "Workforce Baseline"),
    ("workload_service", "Workload Data"),
    ("future_drivers", "Future Drivers"),
    ("evidence_documents", "Evidence / Sources"),
]

NEXT_ACTION = {
    "in_progress": "Send Reminder",
    "returned": "Review & Return",
    "not_started": "Escalate",
    "submitted": "Review Submission",
    "under_review": "Review Submission",
    "approved": "View",
}


def _is_ready(e: m.Entity) -> bool:
    return e.completeness >= 80 and (e.quality_score or 0) >= 75 and e.status in ("submitted", "under_review")


def command_center(db: Session, page: int = 1, page_size: int = 5) -> dict:
    entities = db.query(m.Entity).all()
    total = len(entities)
    received = sum(1 for e in entities if e.status in RECEIVED_STATUSES)
    overdue = sum(1 for e in entities if e.overdue)
    ready = sum(1 for e in entities if _is_ready(e))
    blocked = total - ready

    # Entities with missing data = ≥1 applicable package progress < 100 flagged critical (< 60).
    missing_entity_ids = {
        ep.entity_id
        for ep in db.query(m.EntityPackage).filter(
            m.EntityPackage.applicable.is_(True), m.EntityPackage.progress < 60
        ).all()
    }
    missing_data = len(missing_entity_ids)

    pct = round(received / total * 100) if total else 0

    # status donut
    from collections import Counter
    counts = Counter(e.status for e in entities)
    donut = [
        {"status": key, "label": label, "count": counts.get(key, 0),
         "pct": round(counts.get(key, 0) / total * 100, 1) if total else 0}
        for key, label in STATUS_ORDER
    ]

    # missing summary per package (entities with that applicable package progress < 60)
    missing_summary = []
    for key, label in MISSING_KEYS:
        cnt = db.query(m.EntityPackage).join(m.DataPackage).filter(
            m.DataPackage.key == key, m.EntityPackage.applicable.is_(True),
            m.EntityPackage.progress < 60,
        ).count()
        missing_summary.append({"key": key, "label": label, "count": cnt})

    # actions queue (prioritized): overdue first, then lowest completeness
    prioritized = sorted(entities, key=lambda e: (not e.overdue, e.completeness))
    start = (page - 1) * page_size
    page_items = prioritized[start:start + page_size]
    actions = [
        {
            "id": e.id, "name": e.name, "code": e.code, "status": e.status,
            "completeness": e.completeness, "quality_score": e.quality_score,
            "due_date": e.due_date.isoformat() if e.due_date else None,
            "overdue": e.overdue, "next_action": NEXT_ACTION.get(e.status, "View"),
        }
        for e in page_items
    ]

    alerts = [
        {"severity": a.severity, "title": a.title, "body": a.body,
         "created_at": a.created_at.isoformat() if a.created_at else None}
        for a in db.query(m.Alert).order_by(m.Alert.created_at.desc()).all()
    ]

    state = db.get(m.AppState, 1)
    trend = state.trend_points if state and state.trend_points else []

    return {
        "kpis": {
            "total_entities": total,
            "submissions_received": {"value": received, "pct": round(received / total * 100, 1) if total else 0},
            "missing_data": missing_data,
            "validation_ready": ready,
            "overdue_items": overdue,
            "overall_progress": {"pct": pct, "received": received, "total": total},
        },
        "status_donut": {"total": total, "segments": donut},
        "actions_queue": {
            "items": actions, "page": page, "page_size": page_size, "total": total,
        },
        "forecasting": {
            "ready": ready, "ready_pct": round(ready / total * 100, 1) if total else 0,
            "blocked": blocked, "blocked_pct": round(blocked / total * 100, 1) if total else 0,
        },
        "missing_summary": missing_summary,
        "alerts": alerts,
        "trend": trend,
    }

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

    # "Entities with Missing Data / Require attention" (screen 01 KPI) = entities that are
    # overdue or had a submission returned. (The mockup's headline 12 is inconsistent with its
    # own per-category summary of 18–31; see CONFLICTS.md C5. This yields the headline 12.)
    missing_data = sum(1 for e in entities if e.overdue or e.status == "returned")

    pct = round(received / total * 100) if total else 0

    # status donut
    from collections import Counter
    counts = Counter(e.status for e in entities)
    donut = [
        {"status": key, "label": label, "count": counts.get(key, 0),
         "pct": round(counts.get(key, 0) / total * 100, 1) if total else 0}
        for key, label in STATUS_ORDER
    ]

    # Missing Data Summary (screen 01) — curated per-category counts (mockup 18/22/25/31/20).
    # Seeded as display stats (not derivable: only DM has row-level package detail; and the
    # mockup's per-category counts are inconsistent with its own headline 12 — see CONFLICTS C5).
    ms_rows = (
        db.query(m.DashboardStat).filter(m.DashboardStat.group == "missing_summary")
        .order_by(m.DashboardStat.position).all()
    )
    missing_summary = [{"key": s.key, "label": s.label, "count": s.value_int} for s in ms_rows]

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

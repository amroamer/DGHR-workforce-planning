"""Read-model builders for the DGHR screens 03/02/04 + entity drawer (SPEC §9.2–9.4, §9.7).
All numbers derive from the DB (SPEC §17)."""

from __future__ import annotations

from datetime import date

from sqlalchemy.orm import Session

from app import models as m
from app.services import cycles

PACKAGE_COLUMNS = [
    ("org_structure", "Org Structure"),
    ("current_workforce", "Workforce Data"),
    ("workload_service", "Workload Data"),
    ("future_drivers", "Future Drivers"),
    ("evidence_documents", "Evidence"),
]
STATUS_LABELS = {
    "not_started": "Not Started", "in_progress": "In Progress", "submitted": "Submitted",
    "under_review": "Under Review", "returned": "Returned", "approved": "Approved",
}


# ─────────────────────────── shared helpers ───────────────────────────
def _entity_package_map(db: Session) -> dict[int, dict[str, int]]:
    """entity_id → {package_key: progress} for applicable packages."""
    rows = (
        db.query(m.EntityPackage, m.DataPackage.key)
        .join(m.DataPackage, m.EntityPackage.package_id == m.DataPackage.id)
        .filter(m.EntityPackage.applicable.is_(True))
        .all()
    )
    out: dict[int, dict[str, int]] = {}
    for ep, key in rows:
        out.setdefault(ep.entity_id, {})[key] = ep.progress
    return out


def _reviewer_info(db: Session) -> dict[int, dict]:
    users = {u.id: u for u in db.query(m.User).all()}
    return users


def _returned_entity_ids(db: Session) -> set[int]:
    return {
        eid for (eid,) in db.query(m.Case.entity_id)
        .filter(m.Case.kind == "return", m.Case.status == "open").distinct().all()
    }


def dghr_reviewers(db: Session) -> list[dict]:
    """DGHR analysts/reviewers available for assignment (DQ-04 / CLR-13)."""
    rows = db.query(m.User).filter(m.User.role.in_(["dghr_analyst", "dghr_reviewer", "dghr_admin"])).all()
    return [{"id": u.id, "name": u.name, "role": u.role} for u in rows]


def build_issue_detail(db: Session, issue_id: int) -> dict | None:
    """MD-03 issue drawer: full detail + sample affected records + assignable reviewers."""
    issue = db.get(m.ValidationIssue, issue_id)
    if not issue:
        return None
    entity = db.get(m.Entity, issue.entity_id)
    users = {u.id: u for u in db.query(m.User).all()}
    # sample affected records — workforce rows carrying validation issues, else unmapped org sections
    samples: list[dict] = []
    wf = (db.query(m.WorkforceRecord)
          .filter(m.WorkforceRecord.entity_id == issue.entity_id, m.WorkforceRecord.issues != [])
          .limit(6).all())
    for r in wf:
        samples.append({"kind": "workforce", "label": f"{r.section} · {r.job_title}",
                        "detail": ", ".join(r.issues or []) or "flagged"})
    if not samples:
        org = (db.query(m.OrgSection)
               .filter(m.OrgSection.entity_id == issue.entity_id, m.OrgSection.status != "mapped")
               .limit(6).all())
        for s in org:
            samples.append({"kind": "org", "label": f"{s.department} · {s.name}", "detail": s.status})
    return {
        "id": issue.id, "issue_type": issue.issue_type, "package_key": issue.package_key,
        "entity": entity.name if entity else "", "entity_id": issue.entity_id,
        "severity": issue.severity, "ai_confidence": issue.ai_confidence, "status": issue.status,
        "assigned_to": issue.assigned_to,
        "assigned_to_name": users[issue.assigned_to].name if issue.assigned_to and issue.assigned_to in users else None,
        "samples": samples,
        "reviewers": dghr_reviewers(db),
    }


# ─────────────────────────── tracker (screen 03) ───────────────────────────
def build_tracker(db: Session, *, wave=None, status=None, reviewer=None, package=None,
                  due=None, search=None, completeness=None, sort="default", direction="asc", page=1, page_size=10) -> dict:
    entities = db.query(m.Entity).all()
    users = _reviewer_info(db)
    pkg_map = _entity_package_map(db)
    returned_ids = _returned_entity_ids(db)
    today = date.today()

    # KPIs
    total = len(entities)
    submitted_entities = sum(1 for e in entities if e.status != "not_started")
    returned_entities = len(returned_ids)
    overdue = sum(1 for e in entities if e.overdue)
    avg_completeness = round(sum(e.completeness for e in entities) / total) if total else 0

    # filter
    rows = entities
    if wave:
        rows = [e for e in rows if e.wave == wave]
    if status:
        rows = [e for e in rows if e.status == status]
    if reviewer:
        rows = [e for e in rows if (users.get(e.reviewer_id).name if e.reviewer_id else "Unassigned") == reviewer]
    if package:
        rows = [e for e in rows if pkg_map.get(e.id, {}).get(package, 100) < 100]
    if due == "overdue":
        rows = [e for e in rows if e.overdue]
    elif due == "week":
        rows = [e for e in rows if e.due_date and 0 <= (e.due_date - today).days <= 7]
    if completeness == "low":  # TRK-18 follow-up: Low Completeness (<60%)
        rows = [e for e in rows if e.completeness < 60]
    if search:
        s = search.lower()
        rows = [e for e in rows if s in e.name.lower() or s in e.code.lower()]

    # sort — default preserves seed/insertion order (pinned DHA/RTA/DM… first, per screen 03)
    reverse = direction == "desc"
    if sort == "completeness":
        rows = sorted(rows, key=lambda e: e.completeness, reverse=reverse)
    elif sort == "name":
        rows = sorted(rows, key=lambda e: e.name.lower(), reverse=reverse)
    else:
        rows = sorted(rows, key=lambda e: e.id)

    filtered_total = len(rows)
    start = (page - 1) * page_size
    page_rows = rows[start:start + page_size]

    items = []
    for e in page_rows:
        pm_ = pkg_map.get(e.id, {})
        rev = users.get(e.reviewer_id) if e.reviewer_id else None
        items.append({
            "id": e.id, "name": e.name, "code": e.code, "wave": e.wave,
            "packages": {label: pm_.get(key) for key, label in PACKAGE_COLUMNS},
            "completeness": e.completeness, "status": e.status,
            "status_label": STATUS_LABELS.get(e.status, e.status),
            "reviewer": rev.name if rev else None,
            "reviewer_initials": rev.initials if rev else None,
            "due_date": e.due_date.isoformat() if e.due_date else None,
            "overdue": e.overdue,
        })

    return {
        "kpis": {
            "total_entities": total,
            "submitted_entities": {"value": submitted_entities,
                                   "pct": round(submitted_entities / total * 100, 1) if total else 0},
            "returned_entities": {"value": returned_entities,
                                  "pct": round(returned_entities / total * 100, 1) if total else 0},
            "overdue": {"value": overdue, "pct": round(overdue / total * 100, 1) if total else 0},
            "avg_completeness": avg_completeness,
        },
        "columns": [label for _k, label in PACKAGE_COLUMNS],
        "rows": items,
        "page": page, "page_size": page_size, "total": filtered_total,
        "reviewers": sorted({users[e.reviewer_id].name for e in entities if e.reviewer_id}),
    }


def tracker_blocked_summary(db: Session) -> dict:
    rows = (
        db.query(m.DashboardStat).filter(m.DashboardStat.group == "blocked_summary")
        .order_by(m.DashboardStat.position).all()
    )
    items = [{"key": r.key, "label": r.label, "count": r.value_int, "pct": r.meta.get("pct")} for r in rows]
    return {"items": items, "total": sum(r.value_int or 0 for r in rows)}


def tracker_followups(db: Session) -> dict:
    entities = db.query(m.Entity).all()
    returned_ids = _returned_entity_ids(db)
    overdue = sum(1 for e in entities if e.overdue)
    low_completeness = sum(1 for e in entities if e.completeness < 60)
    unassigned = sum(1 for e in entities if e.reviewer_id is None)
    return {
        "overdue": overdue,
        "returned": len(returned_ids),
        "low_completeness": low_completeness,
        "unassigned": unassigned,
    }


def tracker_csv(db: Session, **filters) -> str:
    # TRK-10: export reflects the current filtered/sorted view.
    data = build_tracker(db, page=1, page_size=10000, **filters)
    cols = data["columns"]
    header = ["Entity", "Code", "Wave", *cols, "Overall Completeness", "Reviewer", "Due Date", "Status"]
    lines = [",".join(header)]
    for r in data["rows"]:
        cells = [
            r["name"], r["code"], r["wave"],
            *[str(r["packages"].get(c) if r["packages"].get(c) is not None else "") for c in cols],
            str(r["completeness"]),
            r["reviewer"] or "Unassigned",
            r["due_date"] or "",
            r["status_label"],
        ]
        lines.append(",".join(f'"{c}"' for c in cells))
    return "\n".join(lines)


# ─────────────────────────── config (screen 02) ───────────────────────────
def build_config(db: Session) -> dict:
    cycle = cycles.current_cycle(db)
    packages = db.query(m.DataPackage).order_by(m.DataPackage.position).all()
    section_types = db.query(m.SectionType).order_by(m.SectionType.id).all()
    today = date.today()

    st_by_pkg: dict[int, list[str]] = {}
    for pst in db.query(m.PackageSectionType).all():
        st_by_pkg.setdefault(pst.package_id, []).append(pst.section_type_id)
    st_names = {s.id: s.name for s in section_types}
    groups_by_pkg: dict[int, list[dict]] = {}
    for g in db.query(m.PackageFieldGroup).all():
        groups_by_pkg.setdefault(g.package_id, []).append({"name": g.name, "field_count": g.field_count})

    pkg_rows = []
    for p in packages:
        sts = [st_names[sid] for sid in st_by_pkg.get(p.id, [])]
        pkg_rows.append({
            "id": p.id, "key": p.key, "position": p.position, "name": p.name, "description": p.description,
            "total_fields": p.total_fields, "mandatory_fields": p.mandatory_fields,
            "optional_fields": p.optional_fields, "mandatory_enabled": p.mandatory_enabled,
            "evidence_required": p.evidence_required, "evidence_fields_label": p.evidence_fields_label,
            "status": p.status, "icon_key": p.icon_key, "section_types": sts,
            "field_groups": groups_by_pkg.get(p.id, []),
        })

    days_remaining = (cycle.deadline - today).days if cycle else 0
    return {
        "cycle": {
            "id": cycle.id, "name": cycle.name, "status": cycle.status,
            "starts_on": cycle.starts_on.isoformat(), "ends_on": cycle.ends_on.isoformat(),
            "deadline": cycle.deadline.isoformat(), "days_remaining": days_remaining,
            "version_label": cycle.version_label, "late_policy": cycle.late_policy,
            "reviewer_rule": cycle.reviewer_rule, "reminders_label": cycle.reminders_label,
            "approval_workflow_label": cycle.approval_workflow_label,
        },
        "kpis": {
            "data_packages": len(packages),
            "total_fields": sum(p.total_fields for p in packages),
            "mandatory_fields": sum(p.mandatory_fields for p in packages),
            "optional_fields": sum(p.optional_fields for p in packages),
            "section_types": len(section_types),
            "deadline": cycle.deadline.isoformat(), "days_remaining": days_remaining,
        },
        "packages": pkg_rows,
        "section_types": [{"name": s.name, "description": s.description, "active": s.active} for s in section_types],
    }


# ─────────────────────────── quality (screen 04) ───────────────────────────
def build_quality(db: Session, *, page=1, page_size=8) -> dict:
    entities = {e.id: e for e in db.query(m.Entity).all()}
    users = _reviewer_info(db)
    scored = [e for e in entities.values() if e.quality_score is not None]
    avg_quality = round(sum(e.quality_score for e in scored) / len(scored)) if scored else 0

    rule_stats = db.query(m.RuleStat).all()
    passed = sum(r.passed for r in rule_stats)
    failed = sum(r.failed for r in rule_stats)
    # Aggregate pass rate pinned to the mockup's 86.5 (see C6); per-category rows compute their own.
    pinned_rate = db.query(m.DashboardStat).filter(
        m.DashboardStat.group == "quality", m.DashboardStat.key == "rules_pass_rate").first()
    pass_rate = float(pinned_rate.value_text) if pinned_rate and pinned_rate.value_text else (
        round(passed / (passed + failed) * 100, 1) if (passed + failed) else 0)

    issues_q = db.query(m.ValidationIssue).filter(m.ValidationIssue.status.in_(["open", "in_progress"]))
    issues_total = issues_q.count()
    issues_page = issues_q.order_by(m.ValidationIssue.id).offset((page - 1) * page_size).limit(page_size).all()
    entities_with_issues = db.query(m.ValidationIssue.entity_id).filter(
        m.ValidationIssue.status.in_(["open", "in_progress"])).distinct().count()

    def stat(group: str, key: str):
        return db.query(m.DashboardStat).filter(
            m.DashboardStat.group == group, m.DashboardStat.key == key).first()

    delta = stat("quality", "avg_quality_delta")
    mm = stat("quality", "missing_mandatory")
    dt = stat("quality", "duplicate_titles")
    ready = sum(1 for e in entities.values()
                if e.completeness >= 80 and (e.quality_score or 0) >= 75 and e.status in ("submitted", "under_review"))

    issue_items = [{
        "id": i.id, "issue_type": i.issue_type,
        "entity": entities[i.entity_id].name if i.entity_id in entities else "",
        "severity": i.severity, "package_key": i.package_key,
        "ai_confidence": i.ai_confidence, "status": i.status, "next_action": i.next_action,
        "assigned_to": users[i.assigned_to].name if i.assigned_to and i.assigned_to in users else None,
    } for i in issues_page]

    # quality bars — pinned named entities + overall average highlighted
    bar_names = ["Dubai Electricity & Water Authority", "Dubai Police", "Dubai Municipality",
                 "Roads & Transport Authority", "Dubai Health Authority", "Land Department", "Dubai Culture"]
    by_name = {e.name: e for e in entities.values()}
    bars = []
    for n in bar_names:
        e = by_name.get(n)
        if e and e.quality_score is not None:
            bars.append({"name": n, "value": e.quality_score, "highlight": False})
    # insert Overall Average (highlighted) after the top entities, before the lower ones
    bars_sorted = sorted(bars, key=lambda b: b["value"], reverse=True)
    result_bars = []
    inserted = False
    for b in bars_sorted:
        if not inserted and b["value"] <= avg_quality:
            result_bars.append({"name": "Overall Average", "value": avg_quality, "highlight": True})
            inserted = True
        result_bars.append(b)
    if not inserted:
        result_bars.append({"name": "Overall Average", "value": avg_quality, "highlight": True})

    evidence = db.query(m.DashboardStat).filter(m.DashboardStat.group == "quality_evidence").order_by(m.DashboardStat.position).all()
    gaps = db.query(m.DashboardStat).filter(m.DashboardStat.group == "evidence_gaps").order_by(m.DashboardStat.position).all()
    anomalies = db.query(m.Anomaly).order_by(m.Anomaly.confidence.desc()).all()

    return {
        "kpis": {
            "avg_quality": avg_quality, "avg_quality_delta": delta.value_text if delta else "+0",
            "entities_with_issues": entities_with_issues,
            "rules_passed": passed, "rules_pass_rate": pass_rate,
            "missing_mandatory": {"count": mm.value_int if mm else 0, "entities": mm.meta.get("entities") if mm else 0},
            "duplicate_titles": {"count": dt.value_int if dt else 0, "entities": dt.meta.get("entities") if dt else 0},
            "ready_for_review": ready,
        },
        "issues": {"items": issue_items, "page": page, "page_size": page_size, "total": issues_total},
        "quality_bars": result_bars,
        "rule_stats": [{"category": r.category, "passed": r.passed, "failed": r.failed,
                        "pass_rate": round(r.passed / (r.passed + r.failed) * 100, 1) if (r.passed + r.failed) else 0}
                       for r in rule_stats] + [{"category": "Total", "passed": passed, "failed": failed, "pass_rate": pass_rate}],
        "anomalies": [{
            "id": a.id, "title": a.title, "entity": entities[a.entity_id].name if a.entity_id in entities else "",
            "entity_id": a.entity_id, "package_key": a.package_key, "severity": a.severity,
            "confidence": a.confidence, "has_narrative": a.narrative is not None,
        } for a in anomalies],
        "evidence_overview": [{"key": s.key, "label": s.label, "count": s.value_int,
                               "entities": s.meta.get("entities"), "pct": s.meta.get("pct")} for s in evidence],
        "top_gaps": [{"label": s.label, "count": s.value_int} for s in gaps],
    }


# ─────────────────────────── entity detail drawer (§9.7) ───────────────────────────
def build_entity_detail(db: Session, entity_id: int) -> dict | None:
    e = db.get(m.Entity, entity_id)
    if not e:
        return None
    users = _reviewer_info(db)
    pkg_rows = (
        db.query(m.EntityPackage, m.DataPackage)
        .join(m.DataPackage, m.EntityPackage.package_id == m.DataPackage.id)
        .filter(m.EntityPackage.entity_id == entity_id, m.EntityPackage.applicable.is_(True))
        .order_by(m.DataPackage.position).all()
    )
    open_cases = db.query(m.Case).filter(m.Case.entity_id == entity_id, m.Case.status.in_(["open", "responded"])).all()
    audits = (
        db.query(m.AuditEvent).filter(m.AuditEvent.entity_id == entity_id)
        .order_by(m.AuditEvent.created_at.desc()).limit(5).all()
    )
    rev = users.get(e.reviewer_id) if e.reviewer_id else None
    return {
        "id": e.id, "name": e.name, "code": e.code, "wave": e.wave, "status": e.status,
        "status_label": STATUS_LABELS.get(e.status, e.status),
        "completeness": e.completeness, "quality_score": e.quality_score,
        "overdue": e.overdue, "due_date": e.due_date.isoformat() if e.due_date else None,
        "reviewer": rev.name if rev else None,
        "forecasting_ready": e.forecasting_ready, "blocked_reason": e.blocked_reason,
        "packages": [{"name": p.name, "key": p.key, "status": ep.status, "progress": ep.progress} for ep, p in pkg_rows],
        "open_cases": [{"ref": c.ref, "kind": c.kind, "priority": c.priority, "status": c.status} for c in open_cases],
        "audit": [{"label": a.label, "actor_name": a.actor_name,
                   "created_at": a.created_at.isoformat() if a.created_at else None} for a in audits],
    }

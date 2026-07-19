"""Read-model builders for the Entity portal screens 06–10 + My Submissions (SPEC §10)."""

from __future__ import annotations

from datetime import date

from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models as m
from app.services import cycles

# Home package display copy (screen 06 — verbatim) + route keys.
HOME_PACKAGES = {
    "org_structure": ("Organization Structure", "Provide your current organizational structure.", "org-structure"),
    "current_workforce": ("Current Workforce Data", "Submit headcount, demographics, and employment details.", "workforce"),
    "workload_service": ("Workload & Service Data", "Provide workload volumes and service performance data.", "workload"),
    "future_drivers": ("Future Demand Drivers", "Share factors expected to impact future demand.", "demand-drivers"),
    "evidence_documents": ("Evidence Upload", "Upload supporting documents and data evidence.", "demand-drivers?tab=evidence"),
}
STATUS_LABELS = {
    "not_started": "Not Started", "in_progress": "In Progress", "submitted": "Submitted",
    "under_review": "Under Review", "returned": "Returned", "approved": "Approved",
}
STRUCTURE_RULES = [
    "All sections must be assigned to a department",
    "Each section must have a Section Owner",
    "At least one HR Focal Point is required",
    "No duplicate section names within a department",
    "Only mapped sections with employees in scope",
]


def _applicable_packages(db: Session, entity_id: int):
    return (
        db.query(m.EntityPackage, m.DataPackage)
        .join(m.DataPackage, m.EntityPackage.package_id == m.DataPackage.id)
        .filter(m.EntityPackage.entity_id == entity_id, m.EntityPackage.applicable.is_(True))
        .order_by(m.DataPackage.position)
        .all()
    )


# ─────────────────────────── home (screen 06) ───────────────────────────
def build_home(db: Session, entity_id: int) -> dict:
    e = db.get(m.Entity, entity_id)
    cycle = cycles.current_cycle(db)
    pkgs = _applicable_packages(db, entity_id)
    today = date.today()

    open_cases = db.query(m.Case).filter(m.Case.entity_id == entity_id, m.Case.status == "open").count()
    ready = sum(1 for ep, _p in pkgs if ep.status in ("submitted", "under_review", "approved"))
    days_to_deadline = (cycle.deadline - today).days if cycle else 0

    def action(ep) -> str:
        if ep.status in ("submitted", "under_review", "approved") or ep.progress >= 100:
            return "View"
        if ep.status == "not_started" or ep.progress == 0:
            return "Start"
        return "Continue"

    submissions = []
    for i, (ep, p) in enumerate(pkgs, start=1):
        name, desc, route = HOME_PACKAGES.get(p.key, (p.name, p.description, "home"))
        submissions.append({
            "position": i, "key": p.key, "name": name, "description": desc, "route": route,
            "status": ep.status, "status_label": STATUS_LABELS.get(ep.status, ep.status),
            "progress": ep.progress, "action": action(ep),
        })

    messages = [
        {"id": n.id, "kind": n.kind, "title": n.title, "body": n.body,
         "created_at": n.created_at.isoformat() if n.created_at else None, "read": n.read}
        for n in db.query(m.Notification).filter(
            m.Notification.audience == "entity", m.Notification.entity_id == entity_id
        ).order_by(m.Notification.created_at.desc()).all()
    ]

    deadlines = []
    if cycle:
        deadlines = [
            {"label": "Future Demand Drivers", "date": cycle.deadline.isoformat(), "days_left": days_to_deadline},
            {"label": "Evidence Upload", "date": cycle.deadline.isoformat(), "days_left": days_to_deadline},
            {"label": "Final Submission", "date": (cycle.deadline).isoformat(), "days_left": days_to_deadline + 7},
        ]

    return {
        "entity": {"name": e.name, "code": e.code},
        "kpis": {
            "submission_progress": e.completeness,
            "required_packages": len(pkgs),
            "pending_clarifications": open_cases,
            "days_to_deadline": days_to_deadline,
            "deadline_date": cycle.deadline.isoformat() if cycle else None,
            "ready_for_review": ready,
        },
        "required_submissions": submissions,
        "messages": messages,
        "deadlines": deadlines,
    }


# ─────────────────────────── org structure (screen 07) ───────────────────────────
def build_org_structure(db: Session, entity_id: int, *, search=None, sector=None,
                        department=None, status=None, page=1, page_size=8) -> dict:
    e = db.get(m.Entity, entity_id)
    all_sections = db.query(m.OrgSection).filter(m.OrgSection.entity_id == entity_id).order_by(m.OrgSection.id).all()
    total = len(all_sections)

    sectors = sorted({s.sector for s in all_sections})
    departments = sorted({s.department for s in all_sections})
    unmapped = sum(1 for s in all_sections if s.status == "unmapped")
    missing_owner = sum(1 for s in all_sections if not s.owner_name)
    missing_focal = sum(1 for s in all_sections if not s.hr_focal_point)
    completeness = round((total - unmapped) / total * 100) if total else 0

    # tree
    tree: dict[str, dict[str, list]] = {}
    for s in all_sections:
        tree.setdefault(s.sector, {}).setdefault(s.department, []).append(s)

    def node_status(sections: list) -> str:
        if any(x.status == "unmapped" for x in sections):
            return "unmapped"
        if any(x.status == "partial" for x in sections):
            return "partial"
        return "mapped"

    tree_out = []
    for sec, depts in tree.items():
        dept_nodes = []
        for dept, secs in depts.items():
            dept_nodes.append({
                "name": dept, "status": node_status(secs),
                "sections": [{"id": x.id, "name": x.name, "status": x.status} for x in secs[:20]],
            })
        tree_out.append({"name": sec, "status": node_status([x for d in depts.values() for x in d]), "departments": dept_nodes})

    # filtered table
    rows = all_sections
    if sector:
        rows = [s for s in rows if s.sector == sector]
    if department:
        rows = [s for s in rows if s.department == department]
    if status:
        rows = [s for s in rows if s.status == status]
    if search:
        q = search.lower()
        rows = [s for s in rows if q in s.name.lower() or q in s.department.lower()]
    filtered_total = len(rows)
    page_rows = rows[(page - 1) * page_size: page * page_size]

    comments = db.query(m.PackageComment).filter(
        m.PackageComment.entity_id == entity_id, m.PackageComment.package_key == "org_structure"
    ).all()

    return {
        "entity": {"name": e.name, "code": e.code},
        "kpis": {
            "sectors": len(sectors), "departments": len(departments), "sections": total,
            "unmapped": unmapped, "completeness": completeness,
        },
        "tree": tree_out,
        "sections": {
            "columns": ["Sector", "Department", "Section", "Section Owner", "HR Focal Point", "In Scope", "Employee Count", "Status"],
            "rows": [{
                "id": s.id, "sector": s.sector, "department": s.department, "name": s.name,
                "owner_name": s.owner_name, "owner_initials": s.owner_initials,
                "hr_focal_point": s.hr_focal_point, "in_scope": s.in_scope,
                "employee_count": s.employee_count, "status": s.status,
            } for s in page_rows],
            "page": page, "page_size": page_size, "total": filtered_total,
        },
        "sectors": sectors, "departments": departments,
        "rules": STRUCTURE_RULES,
        "alerts": [
            {"label": f"{unmapped} sections are not mapped to a department", "count": unmapped},
            {"label": f"{missing_owner} sections are missing Section Owner", "count": missing_owner},
            {"label": f"{missing_focal} sections are missing HR Focal Point", "count": missing_focal},
        ],
        "comments": [{"author_name": c.author_name, "author_role": c.author_role, "body": c.body,
                      "created_at": c.created_at.isoformat() if c.created_at else None} for c in comments],
    }


# ─────────────────────────── workforce (screen 08) ───────────────────────────
def build_workforce(db: Session, entity_id: int, *, search=None, section=None,
                    employment_type=None, status=None, page=1, page_size=25) -> dict:
    e = db.get(m.Entity, entity_id)
    base = db.query(m.WorkforceRecord).filter(m.WorkforceRecord.entity_id == entity_id)
    all_records = base.all()
    total = len(all_records)

    mapped = sum(1 for r in all_records if r.map_status == "mapped")
    partial = sum(1 for r in all_records if r.map_status == "partial")
    unmapped = sum(1 for r in all_records if r.map_status == "unmapped")
    open_issues = sum(1 for r in all_records if r.issues)
    vacancies = int(sum(float(r.vacancies) for r in all_records))

    def issue_count(tag: str) -> int:
        return sum(1 for r in all_records if tag in (r.issues or []))

    completeness = round((total - unmapped - partial - open_issues) / total * 100) if total else 0
    pct = lambda n: round(n / total * 100, 1) if total else 0  # noqa: E731

    # filtered + paged query (server-side)
    q = base
    if section:
        q = q.filter(m.WorkforceRecord.section == section)
    if employment_type:
        q = q.filter(m.WorkforceRecord.employment_type == employment_type)
    if status:
        q = q.filter(m.WorkforceRecord.map_status == status)
    if search:
        like = f"%{search}%"
        q = q.filter(
            func.lower(m.WorkforceRecord.job_title).like(func.lower(like))
            | func.lower(func.coalesce(m.WorkforceRecord.job_family, "")).like(func.lower(like))
        )
    filtered_total = q.count()
    page_records = q.order_by(m.WorkforceRecord.id).offset((page - 1) * page_size).limit(page_size).all()

    sections = sorted({r.section for r in all_records})

    upload = db.query(m.Upload).filter(
        m.Upload.entity_id == entity_id, m.Upload.kind == "hr_extract"
    ).order_by(m.Upload.uploaded_at.desc()).first()

    return {
        "entity": {"name": e.name, "code": e.code},
        "kpis": {
            "imported_records": total,
            "mapped_titles": {"count": mapped, "pct": pct(mapped)},
            "open_issues": open_issues,
            "vacancies": {"count": vacancies, "pct": round(vacancies / total * 100, 1) if total else 0},
            "completeness": completeness,
        },
        "mapping_summary": [
            {"key": "mapped", "label": "Mapped to Standard", "count": mapped, "pct": pct(mapped)},
            {"key": "partial", "label": "Partially Mapped", "count": partial, "pct": pct(partial)},
            {"key": "unmapped", "label": "Unmapped", "count": unmapped, "pct": pct(unmapped)},
        ],
        "validation_summary": [
            {"label": "Missing Grades", "count": issue_count("missing_grade")},
            {"label": "Inconsistent Job Titles", "count": issue_count("inconsistent_title")},
            {"label": "Missing Employment Type", "count": issue_count("missing_employment_type")},
            {"label": "Negative or Zero FTE", "count": issue_count("negative_zero_fte")},
        ],
        "records": {
            "rows": [{
                "id": r.id, "section": r.section, "job_title": r.job_title, "job_family": r.job_family,
                "grade": r.grade, "current_fte": float(r.current_fte), "vacancies": float(r.vacancies),
                "employment_type": r.employment_type, "critical_role": r.critical_role, "map_status": r.map_status,
            } for r in page_records],
            "page": page, "page_size": page_size, "total": filtered_total,
        },
        "sections": sections,
        "upload": ({
            "filename": upload.filename,
            "uploaded_at": upload.uploaded_at.isoformat() if upload.uploaded_at else None,
            "uploaded_by": upload.uploaded_by,
        } if upload else {
            "filename": "HR_Extract_May2025.xlsx", "uploaded_at": None, "uploaded_by": "Sara Al Mansoori",
        }),
    }


# ─────────────────────────── workload (screen 09) ───────────────────────────
COVERAGE = [("Customer Service", 92), ("Inspection & Compliance", 88), ("Human Resources", 85),
            ("Finance", 70), ("Information Technology", 90), ("Other Sections", 75)]


def build_workload(db: Session, entity_id: int) -> dict:
    e = db.get(m.Entity, entity_id)
    sections = db.query(m.WorkloadSection).filter(m.WorkloadSection.entity_id == entity_id).order_by(m.WorkloadSection.id).all()
    total = len(sections)
    complete = sum(1 for s in sections if s.status == "complete")
    metrics = sum(s.metrics_count for s in sections)
    missing_drivers = (total - complete) * 2  # ~2 metrics without a demand driver per incomplete section
    avg_coverage = round(sum(v for _n, v in COVERAGE) / len(COVERAGE)) if COVERAGE else 0

    def trend(s: m.WorkloadSection):
        if s.prev_volume and s.current_volume is not None and s.prev_volume != 0:
            delta = (s.current_volume - s.prev_volume) / s.prev_volume * 100
            return {"pct": round(delta, 1), "delta": s.current_volume - s.prev_volume}
        return {"pct": 0.0, "delta": 0}

    return {
        "entity": {"name": e.name, "code": e.code},
        "kpis": {
            "sections_covered": {"value": total, "total": total},
            "workload_metrics": metrics,
            "missing_drivers": missing_drivers,
            "avg_completeness": avg_coverage,
        },
        "rows": [{
            "id": s.id, "name": s.name, "metrics_count": s.metrics_count, "service_type": s.service_type,
            "key_metric": s.key_metric, "current_volume": s.current_volume, "unit": s.unit,
            "trend": trend(s), "monthly_pattern": s.monthly_pattern, "peak_label": s.peak_label,
            "complexity": s.complexity, "source_system": s.source_system, "status": s.status,
        } for s in sections],
        "coverage": {"average": avg_coverage, "items": [{"name": n, "value": v} for n, v in COVERAGE]},
    }


# ─────────────────────────── demand drivers & evidence (screen 10) ───────────────────────────
def build_drivers(db: Session, entity_id: int) -> dict:
    e = db.get(m.Entity, entity_id)
    drivers = db.query(m.DemandDriver).filter(m.DemandDriver.entity_id == entity_id).order_by(m.DemandDriver.id).all()
    evidence = db.query(m.EvidenceDoc).filter(m.EvidenceDoc.entity_id == entity_id).order_by(m.EvidenceDoc.id).all()
    comments = db.query(m.PackageComment).filter(
        m.PackageComment.entity_id == entity_id, m.PackageComment.package_key == "future_drivers"
    ).all()

    def stat(key: str) -> int:
        s = db.query(m.DashboardStat).filter(m.DashboardStat.group == "drivers", m.DashboardStat.key == key).first()
        return s.value_int if s else 0

    return {
        "entity": {"name": e.name, "code": e.code},
        "kpis": {
            "strategic_initiatives": stat("strategic_initiatives"),
            "automation_impacts": stat("automation_impacts"),
            "policy_changes": stat("policy_changes"),
            "evidence_documents": len(evidence),
            "outstanding_gaps": stat("outstanding_gaps"),
            "evidence_coverage": stat("evidence_coverage"),
        },
        "drivers": [{
            "id": d.id, "category": d.category, "description": d.description,
            "impact": d.impact, "horizon": d.horizon, "status": d.status,
            "linked_sections": [s for s in (d.linked_sections or "").split(",") if s],
        } for d in drivers],
        "evidence": [{
            "id": ev.id, "filename": ev.filename, "source_org": ev.source_org,
            "linked_label": ev.linked_label, "quality": ev.quality,
            "linked_driver_id": ev.linked_driver_id,
            "uploaded_at": ev.uploaded_at.isoformat() if ev.uploaded_at else None,
        } for ev in evidence[:12]],
        "evidence_total": len(evidence),
        "comments": [{"author_name": c.author_name, "author_role": c.author_role, "body": c.body,
                      "related_label": c.related_label} for c in comments],
    }


# ─────────────────────────── my submissions (screen 10.7) ───────────────────────────
def build_my_submissions(db: Session, entity_id: int) -> dict:
    e = db.get(m.Entity, entity_id)
    pkgs = _applicable_packages(db, entity_id)
    rows = []
    for ep, p in pkgs:
        name, _desc, route = HOME_PACKAGES.get(p.key, (p.name, "", "home"))
        comments = db.query(m.PackageComment).filter(
            m.PackageComment.entity_id == entity_id, m.PackageComment.package_key == p.key
        ).count()
        rows.append({
            "key": p.key, "name": name, "status": ep.status,
            "status_label": STATUS_LABELS.get(ep.status, ep.status), "progress": ep.progress,
            "updated_at": ep.updated_at.isoformat() if ep.updated_at else None,
            "comments": comments, "route": route,
            "action": "View" if ep.status in ("submitted", "under_review", "approved") else ("Start" if ep.progress == 0 else "Continue"),
        })
    return {"entity": {"name": e.name, "code": e.code}, "rows": rows}

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.services import cases as cases_svc
from app.services import entity_views
from app.services import workflow
from app import models as m


def _require_entity(db: Session, entity_id: int) -> m.Entity:
    e = db.get(m.Entity, entity_id)
    if not e:
        raise HTTPException(404, "Entity not found")
    return e

router = APIRouter(prefix="/api/entity", tags=["entity"])


@router.get("/{entity_id}/badges")
def badges(entity_id: int, db: Session = Depends(get_db)) -> dict:
    """Sidebar badge counts (SPEC §4.2 — Clarifications badge = open cases)."""
    open_cases = db.query(m.Case).filter(
        m.Case.entity_id == entity_id, m.Case.status == "open"
    ).count()
    return {"open_cases": open_cases}


@router.get("/{entity_id}/home")
def home(entity_id: int, db: Session = Depends(get_db)) -> dict:
    return entity_views.build_home(db, entity_id)


@router.get("/{entity_id}/org-structure")
def org_structure(
    entity_id: int,
    search: str | None = None,
    sector: str | None = None,
    department: str | None = None,
    status: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(8, ge=1, le=100),
    db: Session = Depends(get_db),
) -> dict:
    return entity_views.build_org_structure(
        db, entity_id, search=search, sector=sector, department=department,
        status=status, page=page, page_size=page_size,
    )


@router.get("/{entity_id}/workforce")
def workforce(
    entity_id: int,
    search: str | None = None,
    section: str | None = None,
    employment_type: str | None = None,
    status: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db),
) -> dict:
    return entity_views.build_workforce(
        db, entity_id, search=search, section=section, employment_type=employment_type,
        status=status, page=page, page_size=page_size,
    )


@router.get("/{entity_id}/workload")
def workload(entity_id: int, db: Session = Depends(get_db)) -> dict:
    return entity_views.build_workload(db, entity_id)


@router.get("/{entity_id}/drivers")
def drivers(entity_id: int, db: Session = Depends(get_db)) -> dict:
    return entity_views.build_drivers(db, entity_id)


@router.get("/{entity_id}/my-submissions")
def my_submissions(entity_id: int, db: Session = Depends(get_db)) -> dict:
    return entity_views.build_my_submissions(db, entity_id)


class WorkforcePatch(BaseModel):
    job_family: str | None = None
    grade: int | None = None
    employment_type: str | None = None
    critical_role: bool | None = None
    map_status: str | None = None


@router.patch("/{entity_id}/workforce/{record_id}")
def patch_workforce(entity_id: int, record_id: int, body: WorkforcePatch, db: Session = Depends(get_db)) -> dict:
    r = db.get(m.WorkforceRecord, record_id)
    if not r or r.entity_id != entity_id:
        from fastapi import HTTPException
        raise HTTPException(404, "Record not found")
    if body.job_family is not None:
        r.job_family = body.job_family
    if body.grade is not None:
        r.grade = body.grade
    if body.employment_type is not None:
        r.employment_type = body.employment_type
    if body.critical_role is not None:
        r.critical_role = body.critical_role
    if body.map_status is not None:
        r.map_status = body.map_status
    db.commit()
    return {"ok": True, "id": r.id, "map_status": r.map_status}


@router.delete("/{entity_id}/workforce/{record_id}")
def delete_workforce(entity_id: int, record_id: int, db: Session = Depends(get_db)) -> dict:
    r = db.get(m.WorkforceRecord, record_id)
    if not r or r.entity_id != entity_id:
        raise HTTPException(404, "Record not found")
    db.delete(r)
    db.commit()
    return {"ok": True}


@router.get("/{entity_id}/workforce/export.csv", response_class=PlainTextResponse)
def workforce_export(entity_id: int, db: Session = Depends(get_db)) -> PlainTextResponse:
    rows = db.query(m.WorkforceRecord).filter(m.WorkforceRecord.entity_id == entity_id).order_by(m.WorkforceRecord.id).all()
    header = ["Section", "Job Title", "Job Family", "Grade", "Current FTE", "Vacancies", "Employment Type", "Critical", "Status"]
    lines = [",".join(header)]
    for r in rows:
        cells = [r.section, r.job_title, r.job_family or "", str(r.grade or ""), str(r.current_fte),
                 str(r.vacancies), r.employment_type or "", "Yes" if r.critical_role else "No", r.map_status]
        lines.append(",".join(f'"{c}"' for c in cells))
    return PlainTextResponse("\n".join(lines),
                             headers={"Content-Disposition": "attachment; filename=workforce.csv"}, media_type="text/csv")


class CommentCreate(BaseModel):
    package_key: str
    body: str
    related_label: str | None = None


@router.post("/{entity_id}/comments")
def add_comment(entity_id: int, body: CommentCreate, db: Session = Depends(get_db)) -> dict:
    """OS-10 / DD-08 — entity SME adds a comment/reply on a package."""
    _require_entity(db, entity_id)
    c = m.PackageComment(entity_id=entity_id, package_key=body.package_key,
                         author_name="Entity SME", author_role="Entity Contact",
                         body=body.body, related_label=body.related_label)
    db.add(c)
    workflow.bump_last_updated(db)
    db.commit()
    return {"ok": True, "id": c.id}


class OrgSectionCreate(BaseModel):
    sector: str
    department: str
    name: str
    employee_count: int | None = None


@router.post("/{entity_id}/org-structure")
def add_org_section(entity_id: int, body: OrgSectionCreate, db: Session = Depends(get_db)) -> dict:
    _require_entity(db, entity_id)
    s = m.OrgSection(entity_id=entity_id, sector=body.sector, department=body.department,
                     name=body.name, employee_count=body.employee_count, in_scope=True,
                     status="mapped")
    db.add(s)
    workflow.bump_last_updated(db)
    db.commit()
    return {"ok": True, "id": s.id}


class OrgSectionPatch(BaseModel):
    name: str | None = None
    owner_name: str | None = None
    hr_focal_point: str | None = None
    in_scope: bool | None = None
    employee_count: int | None = None
    status: str | None = None


@router.patch("/{entity_id}/org-structure/{section_id}")
def patch_org_section(entity_id: int, section_id: int, body: OrgSectionPatch, db: Session = Depends(get_db)) -> dict:
    s = db.get(m.OrgSection, section_id)
    if not s or s.entity_id != entity_id:
        raise HTTPException(404, "Section not found")
    for f in ("name", "owner_name", "hr_focal_point", "in_scope", "employee_count", "status"):
        v = getattr(body, f)
        if v is not None:
            setattr(s, f, v)
    if body.in_scope is False:  # OS-08 "Mark not in scope"
        s.status = "not_in_scope"
    workflow.bump_last_updated(db)
    db.commit()
    return {"ok": True, "id": s.id}


@router.delete("/{entity_id}/org-structure/{section_id}")
def delete_org_section(entity_id: int, section_id: int, db: Session = Depends(get_db)) -> dict:
    s = db.get(m.OrgSection, section_id)
    if not s or s.entity_id != entity_id:
        raise HTTPException(404, "Section not found")
    db.delete(s)
    workflow.bump_last_updated(db)
    db.commit()
    return {"ok": True}


class WorkloadSectionCreate(BaseModel):
    name: str
    unit: str = ""
    current_volume: int | None = None


@router.post("/{entity_id}/workload")
def add_workload_section(entity_id: int, body: WorkloadSectionCreate, db: Session = Depends(get_db)) -> dict:
    _require_entity(db, entity_id)
    s = m.WorkloadSection(entity_id=entity_id, name=body.name, service_type=body.name,
                          key_metric=body.name, unit=body.unit, current_volume=body.current_volume,
                          status="draft")
    db.add(s)
    workflow.bump_last_updated(db)
    db.commit()
    return {"ok": True, "id": s.id}


class WorkloadSectionPatch(BaseModel):
    current_volume: int | None = None
    unit: str | None = None
    status: str | None = None


@router.patch("/{entity_id}/workload/{section_id}")
def patch_workload_section(entity_id: int, section_id: int, body: WorkloadSectionPatch, db: Session = Depends(get_db)) -> dict:
    s = db.get(m.WorkloadSection, section_id)
    if not s or s.entity_id != entity_id:
        raise HTTPException(404, "Section not found")
    for f in ("current_volume", "unit", "status"):
        v = getattr(body, f)
        if v is not None:
            setattr(s, f, v)
    workflow.bump_last_updated(db)
    db.commit()
    return {"ok": True, "id": s.id}


@router.post("/{entity_id}/workload/validate")
def validate_workload(entity_id: int, db: Session = Depends(get_db)) -> dict:
    """WL-05: flag sections with null/zero volume as missing-data."""
    sections = db.query(m.WorkloadSection).filter(m.WorkloadSection.entity_id == entity_id).all()
    missing = 0
    for s in sections:
        if not s.current_volume:
            s.status = "missing_data"
            missing += 1
        elif s.status == "missing_data":
            s.status = "complete"
    workflow.bump_last_updated(db)
    db.commit()
    return {"ok": True, "missing_data": missing}


class DriverCreate(BaseModel):
    category: str
    description: str
    impact: str = "Medium"
    horizon: str = "1–3 years"


@router.post("/{entity_id}/drivers")
def add_driver(entity_id: int, body: DriverCreate, db: Session = Depends(get_db)) -> dict:
    _require_entity(db, entity_id)
    d = m.DemandDriver(entity_id=entity_id, category=body.category, description=body.description,
                       impact=body.impact, horizon=body.horizon, status="in_progress")
    db.add(d)
    workflow.bump_last_updated(db)
    db.commit()
    return {"ok": True, "id": d.id}


class DriverPatch(BaseModel):
    category: str | None = None
    description: str | None = None
    impact: str | None = None
    horizon: str | None = None
    status: str | None = None
    linked_sections: list[str] | None = None  # DD-07: forecast sections this driver affects


@router.patch("/{entity_id}/drivers/{driver_id}")
def patch_driver(entity_id: int, driver_id: int, body: DriverPatch, db: Session = Depends(get_db)) -> dict:
    d = db.get(m.DemandDriver, driver_id)
    if not d or d.entity_id != entity_id:
        raise HTTPException(404, "Driver not found")
    for f in ("category", "description", "impact", "horizon", "status"):
        v = getattr(body, f)
        if v is not None:
            setattr(d, f, v)
    if body.linked_sections is not None:
        d.linked_sections = ",".join(s.strip() for s in body.linked_sections if s.strip())
    workflow.bump_last_updated(db)
    db.commit()
    return {"ok": True, "id": d.id}


@router.delete("/{entity_id}/drivers/{driver_id}")
def delete_driver(entity_id: int, driver_id: int, db: Session = Depends(get_db)) -> dict:
    d = db.get(m.DemandDriver, driver_id)
    if not d or d.entity_id != entity_id:
        raise HTTPException(404, "Driver not found")
    # keep any linked evidence, just detach it (FK: evidence_docs.linked_driver_id → demand_drivers.id)
    db.query(m.EvidenceDoc).filter(m.EvidenceDoc.linked_driver_id == driver_id).update(
        {m.EvidenceDoc.linked_driver_id: None})
    db.delete(d)
    workflow.bump_last_updated(db)
    db.commit()
    return {"ok": True}


class SaveDraft(BaseModel):
    progress: int | None = None


@router.post("/{entity_id}/packages/{key}/submit")
def submit_package(entity_id: int, key: str, db: Session = Depends(get_db)) -> dict:
    return cases_svc.submit_package(db, entity_id=entity_id, package_key=key)


@router.post("/{entity_id}/packages/{key}/save-draft")
def save_draft(entity_id: int, key: str, body: SaveDraft, db: Session = Depends(get_db)) -> dict:
    return cases_svc.save_draft(db, entity_id=entity_id, package_key=key, progress=body.progress)

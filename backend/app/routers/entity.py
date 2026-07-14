from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.services import entity_views
from app import models as m

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

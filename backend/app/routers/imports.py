from __future__ import annotations

import os
from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.services import import_engine
from app.services.import_engine import ImportError422
from app.services import workflow
from app import models as m

router = APIRouter(prefix="/api/entity", tags=["imports"])

UPLOAD_DIR = "/app/uploads"


@router.post("/{entity_id}/workforce/import")
async def workforce_import(entity_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)) -> dict:
    data = await file.read()
    try:
        result = import_engine.import_workforce(db, entity_id, data, file.filename or "upload.xlsx")
    except ImportError422 as e:
        raise HTTPException(422, e.detail) from e
    workflow.bump_last_updated(db)
    return result


@router.post("/{entity_id}/workforce/validate")
def workforce_validate(entity_id: int, db: Session = Depends(get_db)) -> dict:
    records = db.query(m.WorkforceRecord).filter(m.WorkforceRecord.entity_id == entity_id).all()
    summary = {"missing_grade": 0, "inconsistent_title": 0, "missing_employment_type": 0, "negative_zero_fte": 0}
    for r in records:
        for tag in (r.issues or []):
            if tag in summary:
                summary[tag] += 1
    return {"issues_summary": summary, "open_issues": sum(1 for r in records if r.issues)}


@router.post("/{entity_id}/org-structure/import")
async def org_import(entity_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)) -> dict:
    data = await file.read()
    try:
        return import_engine.import_org_structure(db, entity_id, data, file.filename or "org.xlsx")
    except ImportError422 as e:
        raise HTTPException(422, e.detail) from e


@router.post("/{entity_id}/workload/import")
async def workload_import(entity_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)) -> dict:
    data = await file.read()
    try:
        return import_engine.import_workload(db, entity_id, data, file.filename or "workload.xlsx")
    except ImportError422 as e:
        raise HTTPException(422, e.detail) from e


@router.get("/{entity_id}/workforce/template.xlsx")
def workforce_template(entity_id: int) -> Response:
    return Response(import_engine.workforce_template(),
                    media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": "attachment; filename=workforce_template.xlsx"})


@router.get("/{entity_id}/org-structure/template.xlsx")
def org_template(entity_id: int) -> Response:
    return Response(import_engine.org_template(),
                    media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": "attachment; filename=org_structure_template.xlsx"})


@router.post("/{entity_id}/evidence")
async def upload_evidence(
    entity_id: int,
    file: UploadFile = File(...),
    linked_label: str = Form(""),
    quality: str = Form("Medium"),
    db: Session = Depends(get_db),
) -> dict:
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    data = await file.read()
    safe = f"{entity_id}_{int(datetime.utcnow().timestamp())}_{file.filename}"
    path = os.path.join(UPLOAD_DIR, safe)
    with open(path, "wb") as f:
        f.write(data)
    doc = m.EvidenceDoc(entity_id=entity_id, filename=file.filename or safe, source_org="Entity Upload",
                        linked_label=linked_label, quality=quality, uploaded_by="Sara Al Mansoori", filepath=path)
    db.add(doc)
    workflow.bump_last_updated(db)
    db.commit()
    return {"ok": True, "id": doc.id, "filename": doc.filename}


class EvidencePatch(BaseModel):
    linked_label: str | None = None
    quality: str | None = None


@router.patch("/{entity_id}/evidence/{doc_id}")
def patch_evidence(entity_id: int, doc_id: int, body: EvidencePatch, db: Session = Depends(get_db)) -> dict:
    """DD-05: relink evidence (change the linked forecast section / quality)."""
    doc = db.get(m.EvidenceDoc, doc_id)
    if not doc or doc.entity_id != entity_id:
        raise HTTPException(404, "Evidence not found")
    if body.linked_label is not None:
        doc.linked_label = body.linked_label
    if body.quality is not None:
        doc.quality = body.quality
    workflow.bump_last_updated(db)
    db.commit()
    return {"ok": True, "id": doc.id}


@router.delete("/{entity_id}/evidence/{doc_id}")
def delete_evidence(entity_id: int, doc_id: int, db: Session = Depends(get_db)) -> dict:
    """DD-05: remove an evidence document."""
    doc = db.get(m.EvidenceDoc, doc_id)
    if not doc or doc.entity_id != entity_id:
        raise HTTPException(404, "Evidence not found")
    try:
        if doc.filepath and os.path.exists(doc.filepath):
            os.remove(doc.filepath)
    except OSError:
        pass  # file already gone — the DB row is the source of truth
    db.delete(doc)
    workflow.bump_last_updated(db)
    db.commit()
    return {"ok": True}

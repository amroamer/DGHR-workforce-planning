from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import cors_origins
from app.db import get_db
from app.routers import ai, cases, demo, dghr, entity, imports, notifications, planning
from app.services import workflow
from sqlalchemy.orm import Session
from fastapi import Depends

app = FastAPI(
    title="DGHR Workforce Planning Portal API",
    version="0.1.0",
    description="Layer A — Data Collection & Orchestration Engine. See SPEC.md §8.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health", tags=["system"])
def health() -> dict:
    return {"status": "ok", "service": "dghr-portal-backend"}


@app.get("/api/meta/last-updated", tags=["system"])
def meta_last_updated(db: Session = Depends(get_db)) -> dict:
    ts = workflow.last_updated(db)
    return {"last_updated": ts.isoformat()}


@app.get("/api/meta/persona-entities", tags=["system"])
def persona_entities(db: Session = Depends(get_db)) -> dict:
    """Resolve entity codes (DM/DHA) → ids for the persona switcher (SPEC §1)."""
    from app import models as m

    rows = db.query(m.Entity).filter(m.Entity.code.in_(["DM", "DHA"])).all()
    return {r.code: {"id": r.id, "name": r.name} for r in rows}


@app.get("/api/meta/entities", tags=["system"])
def meta_entities(db: Session = Depends(get_db)) -> list[dict]:
    """All entities for the persona picker — act as any of them (no auth, SPEC §1)."""
    from app import models as m

    rows = db.query(m.Entity).order_by(m.Entity.name).all()
    return [{"id": r.id, "name": r.name, "code": r.code, "wave": r.wave} for r in rows]


app.include_router(dghr.router)
app.include_router(entity.router)
app.include_router(cases.router)
app.include_router(imports.router)
app.include_router(ai.router)
app.include_router(notifications.router)
app.include_router(demo.router)
app.include_router(planning.router)

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.seed import run_seed
from app.checks import run_checks

router = APIRouter(prefix="/api/demo", tags=["demo"])


@router.post("/reset")
def reset() -> dict:
    """Re-run the canonical seed (SPEC §14). Idempotent."""
    run_seed()
    return {"ok": True, "message": "Demo data reset to canonical §7 scenario."}


@router.get("/seed-check")
def seed_check(db: Session = Depends(get_db)) -> dict:
    """Lightweight health signal for the DemoPanel (§14)."""
    code = run_checks()
    return {"passed": code == 0}

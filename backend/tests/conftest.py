"""L2 contract-test fixtures. Uses FastAPI TestClient against the real app + DB."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.db import SessionLocal
from app.seed_clean import seed_clean
from app import models as m


@pytest.fixture(scope="session", autouse=True)
def _fresh_db():
    # Clean Planning scenario (entities + departments + typesets only); restore it after the suite.
    seed_clean()
    yield
    seed_clean()


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def db():
    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()


def entity_id_by_code(db, code: str) -> int:
    return db.query(m.Entity).filter(m.Entity.code == code).first().id

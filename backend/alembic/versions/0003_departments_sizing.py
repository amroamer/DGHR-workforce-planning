"""add Planning department + sizing tables (typesets, departments, submissions, drivers, floors, clarifications)

Idempotent: create_all only creates tables that don't yet exist, so a fresh DB (0001 already
ran create_all over current metadata) is a no-op here, and an existing DB gains the new tables.

Revision ID: 0003_departments_sizing
Revises: 0002_driver_linked_sections
Create Date: 2026-07-15
"""
from __future__ import annotations

from alembic import op

from app.db import Base
from app import models  # noqa: F401  (registers all models on Base.metadata)

revision = "0003_departments_sizing"
down_revision = "0002_driver_linked_sections"
branch_labels = None
depends_on = None

_NEW_TABLES = [
    "typesets", "departments", "department_submissions",
    "submission_drivers", "mandate_floors", "submission_clarifications",
]


def upgrade() -> None:
    bind = op.get_bind()
    tables = [Base.metadata.tables[name] for name in _NEW_TABLES]
    Base.metadata.create_all(bind=bind, tables=tables)


def downgrade() -> None:
    bind = op.get_bind()
    tables = [Base.metadata.tables[name] for name in reversed(_NEW_TABLES)]
    Base.metadata.drop_all(bind=bind, tables=tables)

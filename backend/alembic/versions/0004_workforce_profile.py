"""add workforce-profile table (submission_workforce_rows) for the Human Capital Overview

Idempotent create: create_all only creates tables that don't yet exist, so a fresh DB
(0001 ran create_all over current metadata) is a no-op here, and an existing DB gains the table.

Revision ID: 0004_workforce_profile
Revises: 0003_departments_sizing
Create Date: 2026-07-16
"""
from __future__ import annotations

from alembic import op

from app.db import Base
from app import models  # noqa: F401  (registers all models on Base.metadata)

revision = "0004_workforce_profile"
down_revision = "0003_departments_sizing"
branch_labels = None
depends_on = None

_NEW_TABLES = ["submission_workforce_rows"]


def upgrade() -> None:
    bind = op.get_bind()
    tables = [Base.metadata.tables[name] for name in _NEW_TABLES]
    Base.metadata.create_all(bind=bind, tables=tables)


def downgrade() -> None:
    bind = op.get_bind()
    tables = [Base.metadata.tables[name] for name in reversed(_NEW_TABLES)]
    Base.metadata.drop_all(bind=bind, tables=tables)

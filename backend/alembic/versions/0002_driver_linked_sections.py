"""add demand_drivers.linked_sections (DD-07: link drivers to forecast sections)

Idempotent: 0001 runs Base.metadata.create_all from the *current* models, so a
fresh DB already has this column — the ADD COLUMN IF NOT EXISTS makes this a no-op
there, while an existing DB created before this column gets it added.

Revision ID: 0002_driver_linked_sections
Revises: 0001_initial
Create Date: 2026-07-15
"""
from __future__ import annotations

from alembic import op

revision = "0002_driver_linked_sections"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE demand_drivers "
        "ADD COLUMN IF NOT EXISTS linked_sections VARCHAR(240) NOT NULL DEFAULT ''"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE demand_drivers DROP COLUMN IF EXISTS linked_sections")

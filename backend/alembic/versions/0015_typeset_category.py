"""typeset support/core category (20072026): typesets.category

Adds a support|core classification to each department typeset, powering the cross-entity
comparison report's support-to-core and corporate-support-share ratios. `corporate` (HR/finance/
procurement/facilities) and `digital` (IT) are the corporate-support functions; the other 8 are
core service delivery. The column is backfilled here so the classification exists even without a
reseed; app.planning_seed sets it declaratively on a fresh seed.

Revision ID: 0015_typeset_category
Revises: 0014_entity_logo
Create Date: 2026-07-20
"""
from __future__ import annotations

from alembic import op

revision = "0015_typeset_category"
down_revision = "0014_entity_logo"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE typesets ADD COLUMN IF NOT EXISTS category VARCHAR(16)")
    op.execute(
        "UPDATE typesets SET category = "
        "CASE WHEN key IN ('corporate', 'digital') THEN 'support' ELSE 'core' END "
        "WHERE category IS NULL"
    )
    op.execute("ALTER TABLE typesets ALTER COLUMN category SET DEFAULT 'core'")


def downgrade() -> None:
    op.execute("ALTER TABLE typesets DROP COLUMN IF EXISTS category")

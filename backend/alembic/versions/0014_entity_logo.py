"""entity brand logos (19072026): entities.logo_url

Adds a nullable path to each entity's official brand mark (served from frontend/public/logos,
keyed by the slugified entity code). NULL means no asset is held — the UI renders an initials chip.
Backfilled by app.seed from the canonical code→file map; this migration only adds the column.

Revision ID: 0014_entity_logo
Revises: 0013_screen_change_requests
Create Date: 2026-07-19
"""
from __future__ import annotations

from alembic import op

revision = "0014_entity_logo"
down_revision = "0013_screen_change_requests"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE entities ADD COLUMN IF NOT EXISTS logo_url VARCHAR(200)")


def downgrade() -> None:
    op.execute("ALTER TABLE entities DROP COLUMN IF EXISTS logo_url")

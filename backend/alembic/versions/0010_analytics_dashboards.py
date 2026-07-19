"""add analytics-dashboard tables (submission_workforce_bands, market_reference)

Two new tables behind the three executive dashboards:
  submission_workforce_bands — demographic distributions (gender/age/grade/region/nationality)
                               that make the Human Capital Overview donuts real; child of a
                               submission, so it versions and reconciles with headcount.
  market_reference           — illustrative labour-market / education reference data behind the
                               Demand & Supply analysis tabs (kept in its own table so it can never
                               be mistaken for collected data).

Idempotent create: create_all only creates tables that don't yet exist, so a fresh DB (0001 ran
create_all over current metadata) is a no-op here, and an existing DB gains the two tables.

Chained after 0009_multi_cycle (a concurrent feature that also branched from 0008) so alembic has a
single linear head.

Revision ID: 0010_analytics_dashboards
Revises: 0009_multi_cycle
Create Date: 2026-07-17
"""
from __future__ import annotations

from alembic import op

from app.db import Base
from app import models  # noqa: F401  (registers all models on Base.metadata)

revision = "0010_analytics_dashboards"
down_revision = "0009_multi_cycle"
branch_labels = None
depends_on = None

_NEW_TABLES = ["submission_workforce_bands", "market_reference"]


def upgrade() -> None:
    bind = op.get_bind()
    tables = [Base.metadata.tables[name] for name in _NEW_TABLES]
    Base.metadata.create_all(bind=bind, tables=tables)


def downgrade() -> None:
    bind = op.get_bind()
    tables = [Base.metadata.tables[name] for name in reversed(_NEW_TABLES)]
    Base.metadata.drop_all(bind=bind, tables=tables)

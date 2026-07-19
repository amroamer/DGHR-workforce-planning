"""calculation provenance: DB-held formulas/params/scenarios, overrides, and attribution columns

Two halves, both in service of "trace every FTE back to its inputs":

  1. New tables — calc_methods / calc_scenarios / calc_parameters hold the formulas, rounding rules,
     scenario factors and engine constants that used to be literals in services/sizing.py, each with
     a source, an effective date and an owner. calc_overrides records a human overruling the engine,
     keeping the calculated value beside the override.
  2. New columns — typesets.version (which revision of the archetype a department was sized against)
     and the "who entered / who submitted" attribution the trace names.

Columns are added idempotently (IF NOT EXISTS) so this is safe on a DB where 0001's create_all
already built the current metadata.

Revision ID: 0005_calc_provenance
Revises: 0004_workforce_profile
Create Date: 2026-07-17
"""
from __future__ import annotations

from alembic import op

from app.db import Base
from app import models  # noqa: F401  (registers all models on Base.metadata)

revision = "0005_calc_provenance"
down_revision = "0004_workforce_profile"
branch_labels = None
depends_on = None

_NEW_TABLES = ["calc_methods", "calc_measures", "calc_scenarios", "calc_parameters", "calc_overrides"]

# (table, column, DDL type + default)
_NEW_COLUMNS = [
    ("typesets", "version", "VARCHAR(16) NOT NULL DEFAULT '1.0'"),
    ("typesets", "effective_from", "DATE"),
    ("submission_drivers", "source", "VARCHAR(120) NOT NULL DEFAULT ''"),
    ("submission_drivers", "entered_by_id", "INTEGER REFERENCES users(id)"),
    ("submission_drivers", "entered_by_name", "VARCHAR(120) NOT NULL DEFAULT ''"),
    ("submission_drivers", "entered_at", "TIMESTAMPTZ"),
    ("department_submissions", "submitted_by_id", "INTEGER REFERENCES users(id)"),
    ("department_submissions", "submitted_by_name", "VARCHAR(120) NOT NULL DEFAULT ''"),
    ("department_submissions", "decided_by_name", "VARCHAR(120) NOT NULL DEFAULT ''"),
]


def upgrade() -> None:
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind, tables=[Base.metadata.tables[n] for n in _NEW_TABLES])
    for table, column, ddl in _NEW_COLUMNS:
        op.execute(f'ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {ddl}')


def downgrade() -> None:
    bind = op.get_bind()
    for table, column, _ in reversed(_NEW_COLUMNS):
        op.execute(f'ALTER TABLE {table} DROP COLUMN IF EXISTS {column}')
    Base.metadata.drop_all(bind=bind, tables=[Base.metadata.tables[n] for n in reversed(_NEW_TABLES)])

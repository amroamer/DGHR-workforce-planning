"""split supply into establishment / people / non-establishment capacity

Current FTE and headcount were the same number — headcount was built by rounding a department's FTE
(services/human_capital.build_workforce_rows), so no part-time reality could be expressed, and no
vacancy or secondment could move a gap. Three concepts were collapsed into one column:

  1. departments.approved_positions — the AUTHORISED establishment. Vacancies are derived
     (approved − filled), never stored, so the triple cannot drift.
  2. submission_workforce_rows.fte — TIME, beside the existing headcount (PEOPLE). Six half-time
     professionals are 6 headcount and 3.0 FTE.
  3. workforce_adjustments — capacity that isn't the department's own filled establishment:
     secondments in/out, contractors, temporary resources, outsourced capacity. This replaces the
     free-text note "Two staff seconded to the digital programme until March" with a row carrying an
     amount, a window, both ends of the move, and whether it counts toward available supply.

Backfill: existing rows get fte = headcount (every incumbent full-time) and approved_positions =
filled headcount (no vacancies). That is the only reading of the old data that is defensible — it
asserts nothing the old schema didn't already imply, and leaves every pre-existing figure unchanged.

Columns are added idempotently (IF NOT EXISTS), per 0005's pattern.

Revision ID: 0006_workforce_supply
Revises: 0005_calc_provenance
Create Date: 2026-07-17
"""
from __future__ import annotations

from alembic import op

from app.db import Base
from app import models  # noqa: F401  (registers all models on Base.metadata)

revision = "0006_workforce_supply"
down_revision = "0005_calc_provenance"
branch_labels = None
depends_on = None

_NEW_TABLES = ["workforce_adjustments"]

# (table, column, DDL type + default)
_NEW_COLUMNS = [
    ("departments", "approved_positions", "INTEGER NOT NULL DEFAULT 0"),
    ("submission_workforce_rows", "fte", "NUMERIC(8, 2) NOT NULL DEFAULT 0"),
]


def upgrade() -> None:
    bind = op.get_bind()
    for table, column, ddl in _NEW_COLUMNS:
        op.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {ddl}")
    Base.metadata.create_all(bind=bind, tables=[Base.metadata.tables[n] for n in _NEW_TABLES])

    # Backfill the only defensible reading of the old data: everyone full-time, nothing vacant.
    # Guarded on the old value so re-running can't overwrite real part-time/vacancy data later.
    op.execute("UPDATE submission_workforce_rows SET fte = headcount WHERE fte = 0")
    op.execute("""
        UPDATE departments d SET approved_positions = COALESCE((
            SELECT SUM(w.headcount)
            FROM submission_workforce_rows w
            JOIN department_submissions s ON s.id = w.submission_id
            WHERE s.department_id = d.id
        ), ROUND(d.current_fte))
        WHERE d.approved_positions = 0
    """)


def downgrade() -> None:
    bind = op.get_bind()
    Base.metadata.drop_all(bind=bind, tables=[Base.metadata.tables[n] for n in reversed(_NEW_TABLES)])
    for table, column, _ in reversed(_NEW_COLUMNS):
        op.execute(f"ALTER TABLE {table} DROP COLUMN IF EXISTS {column}")

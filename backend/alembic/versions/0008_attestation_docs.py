"""submission attestation + department-scoped documents

Two additions serving the "complete submission summary" on the entity review page:

  1. department_submissions.attested / attested_by / attested_at — a submission can no longer be sent
     without a named person confirming the figures are complete, sourced and owner-approved. Because
     a version is immutable, the attestation is pinned to exactly the numbers confirmed.
  2. uploads.department_id — a supporting document can belong to a specific department's submission,
     not only the whole entity, so evidence travels with the figures it supports. Null keeps the old
     entity-wide behaviour.

Backfill: nothing. Existing submissions stay unattested (attested defaults false) — asserting an
attestation nobody actually gave would be the opposite of the point. Existing uploads keep a null
department_id, i.e. entity-wide, which is what they were.

Columns are added idempotently (IF NOT EXISTS), per 0005-0007.

Revision ID: 0008_attestation_docs
Revises: 0007_review_workflow
Create Date: 2026-07-17
"""
from __future__ import annotations

from alembic import op

revision = "0008_attestation_docs"
down_revision = "0007_review_workflow"
branch_labels = None
depends_on = None

_NEW_COLUMNS = [
    ("department_submissions", "attested", "BOOLEAN NOT NULL DEFAULT FALSE"),
    ("department_submissions", "attested_by", "VARCHAR(120) NOT NULL DEFAULT ''"),
    ("department_submissions", "attested_at", "TIMESTAMPTZ"),
    ("uploads", "department_id", "INTEGER REFERENCES departments(id)"),
]


def upgrade() -> None:
    for table, column, ddl in _NEW_COLUMNS:
        op.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {ddl}")


def downgrade() -> None:
    for table, column, _ in reversed(_NEW_COLUMNS):
        op.execute(f"ALTER TABLE {table} DROP COLUMN IF EXISTS {column}")

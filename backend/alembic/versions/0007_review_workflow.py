"""submission versioning, immutability, two-stage sign-off and element-level decisions

A submitted record was freely editable: save_submission blocked only status 'submitted', so an
APPROVED submission could be rewritten in place — silently, while staying approved and still feeding
the "Official government position". A record you can quietly edit is not a record. This makes
submissions append-only versions instead:

  1. department_submissions.version / supersedes_id — v1 is submitted and approved and then never
     changes; a revision is v2, a copy, and v1 survives as what was actually signed off.
  2. Two-stage sign-off — recommendation/recommended_by_id + decided_by_id. `decided_by_id` did not
     exist, which is exactly why maker-checker was unenforceable: there was no approver identity to
     compare against the reviewer's. `decided_by_name` was never even written at runtime, so every
     real approval displayed "not recorded".
  3. submission_element_decisions — partial approval, addressed with the element scheme
     clarifications already use.
  4. element_key on drivers/mandates/clarifications — a STABLE pointer. element_id was a bare
     Integer with no FK, and every save deletes and recreates driver rows, so element-level
     clarifications and calc overrides silently detached from what they pointed at (and could land on
     a recycled id). This is a live bug today, independent of versioning.
  5. audit_events.submission_id / verb — audit was prose in a String(200) with nothing to filter on.

Backfill: every existing submission becomes v1 with no predecessor; element_key is derived from each
row's own name/role by the same slug rule the app uses, so existing threads keep pointing at their
element. Nothing is asserted that the old data didn't already say.

Columns are added idempotently (IF NOT EXISTS), per 0005/0006's pattern.

Revision ID: 0007_review_workflow
Revises: 0006_workforce_supply
Create Date: 2026-07-17
"""
from __future__ import annotations

from alembic import op

from app.db import Base
from app import models  # noqa: F401  (registers all models on Base.metadata)

revision = "0007_review_workflow"
down_revision = "0006_workforce_supply"
branch_labels = None
depends_on = None

_NEW_TABLES = ["submission_element_decisions"]

# (table, column, DDL type + default)
_NEW_COLUMNS = [
    # version chain
    ("department_submissions", "version", "INTEGER NOT NULL DEFAULT 1"),
    ("department_submissions", "supersedes_id", "INTEGER REFERENCES department_submissions(id)"),
    # stage 1 — reviewer recommends
    ("department_submissions", "recommendation", "VARCHAR(16) NOT NULL DEFAULT ''"),
    ("department_submissions", "recommendation_note", "TEXT NOT NULL DEFAULT ''"),
    ("department_submissions", "recommended_at", "TIMESTAMPTZ"),
    ("department_submissions", "recommended_by_id", "INTEGER REFERENCES users(id)"),
    ("department_submissions", "recommended_by_name", "VARCHAR(120) NOT NULL DEFAULT ''"),
    # stage 2 — a different person decides
    ("department_submissions", "decided_by_id", "INTEGER REFERENCES users(id)"),
    ("department_submissions", "conditions", "JSONB NOT NULL DEFAULT '[]'::jsonb"),
    # stable element addressing
    ("submission_drivers", "element_key", "VARCHAR(80) NOT NULL DEFAULT ''"),
    ("mandate_floors", "element_key", "VARCHAR(80) NOT NULL DEFAULT ''"),
    ("submission_clarifications", "element_key", "VARCHAR(80) NOT NULL DEFAULT ''"),
    ("submission_clarifications", "resolved_at", "TIMESTAMPTZ"),
    ("submission_clarifications", "resolved_by_name", "VARCHAR(120) NOT NULL DEFAULT ''"),
    # queryable audit
    ("audit_events", "submission_id", "INTEGER REFERENCES department_submissions(id)"),
    ("audit_events", "verb", "VARCHAR(32) NOT NULL DEFAULT ''"),
]

# The slug rule from models.element_key(), expressed in SQL so the backfill and the app agree.
# lower → non-alphanumerics to '-' → collapse runs → trim → 80 chars.
_SLUG = """
    LEFT(TRIM(BOTH '-' FROM REGEXP_REPLACE(LOWER({col}), '[^a-z0-9]+', '-', 'g')), 80)
"""


def upgrade() -> None:
    bind = op.get_bind()
    for table, column, ddl in _NEW_COLUMNS:
        op.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {ddl}")
    Base.metadata.create_all(bind=bind, tables=[Base.metadata.tables[n] for n in _NEW_TABLES])

    # Existing rows are v1 of their own chain — true by construction, since nothing could create a
    # second row before now.
    op.execute("UPDATE department_submissions SET version = 1 WHERE version IS NULL OR version = 0")

    # Derive stable keys from the names the rows already carry.
    op.execute(f"UPDATE submission_drivers SET element_key = {_SLUG.format(col='name')} WHERE element_key = ''")
    op.execute(f"UPDATE mandate_floors SET element_key = {_SLUG.format(col='role')} WHERE element_key = ''")
    # A clarification pointing at a driver/mandate inherits that row's key; everything else keys on
    # its own element_type ("profile", "supply", "notes", "submission" are one-per-submission).
    op.execute(f"""
        UPDATE submission_clarifications c SET element_key = COALESCE((
            SELECT {_SLUG.format(col='d.name')} FROM submission_drivers d WHERE d.id = c.element_id
        ), '') WHERE c.element_key = '' AND c.element_type = 'driver'
    """)
    op.execute(f"""
        UPDATE submission_clarifications c SET element_key = COALESCE((
            SELECT {_SLUG.format(col='f.role')} FROM mandate_floors f WHERE f.id = c.element_id
        ), '') WHERE c.element_key = '' AND c.element_type = 'mandate'
    """)
    op.execute("""
        UPDATE submission_clarifications SET element_key = element_type
        WHERE element_key = '' AND element_type IN ('profile', 'supply', 'notes', 'submission')
    """)


def downgrade() -> None:
    bind = op.get_bind()
    Base.metadata.drop_all(bind=bind, tables=[Base.metadata.tables[n] for n in reversed(_NEW_TABLES)])
    for table, column, _ in reversed(_NEW_COLUMNS):
        op.execute(f"ALTER TABLE {table} DROP COLUMN IF EXISTS {column}")

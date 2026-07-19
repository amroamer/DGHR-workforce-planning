"""multi-cycle — cycles become first-class, ad-hoc and repeatable

The planning module treated CollectionCycle as a singleton (every read was `.first()`, and there was
no way to create a second one). This makes a cycle a real object DGHR opens on demand and closes:

  1. collection_cycles gains lifecycle stamps (opened_at/by, closed_at/by), an auto_close flag
     (deadline closes the window when on), and scope_mode (all entities vs a chosen subset).
  2. cycle_entity_scope — the subset of entities a 'selected'-scope cycle targets.

Status vocabulary is migrated from active/published → draft/open (closed stays closed): a live
'published' cycle becomes 'open' and has opened_at backfilled from its planned start, so the first
cycle isn't blank in the new history view. Columns are added idempotently (IF NOT EXISTS), per 0005–0008.

Revision ID: 0009_multi_cycle
Revises: 0008_attestation_docs
Create Date: 2026-07-17
"""
from __future__ import annotations

from alembic import op

revision = "0009_multi_cycle"
down_revision = "0008_attestation_docs"
branch_labels = None
depends_on = None

_NEW_COLUMNS = [
    ("collection_cycles", "opened_at", "TIMESTAMPTZ"),
    ("collection_cycles", "opened_by", "VARCHAR(120) NOT NULL DEFAULT ''"),
    ("collection_cycles", "closed_at", "TIMESTAMPTZ"),
    ("collection_cycles", "closed_by", "VARCHAR(120) NOT NULL DEFAULT ''"),
    ("collection_cycles", "auto_close", "BOOLEAN NOT NULL DEFAULT TRUE"),
    ("collection_cycles", "scope_mode", "VARCHAR(16) NOT NULL DEFAULT 'all'"),
]


def upgrade() -> None:
    for table, column, ddl in _NEW_COLUMNS:
        op.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {ddl}")
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS cycle_entity_scope (
            id SERIAL PRIMARY KEY,
            cycle_id INTEGER NOT NULL REFERENCES collection_cycles(id),
            entity_id INTEGER NOT NULL REFERENCES entities(id),
            CONSTRAINT uq_cycle_entity UNIQUE (cycle_id, entity_id)
        )
        """
    )
    # Vocabulary migration + backfill of the actual-open timestamp for the one live cycle.
    op.execute("UPDATE collection_cycles SET status = 'open' WHERE status = 'published'")
    op.execute("UPDATE collection_cycles SET status = 'draft' WHERE status = 'active'")
    op.execute(
        "UPDATE collection_cycles SET opened_at = starts_on "
        "WHERE status = 'open' AND opened_at IS NULL"
    )


def downgrade() -> None:
    op.execute("UPDATE collection_cycles SET status = 'published' WHERE status = 'open'")
    op.execute("UPDATE collection_cycles SET status = 'active' WHERE status = 'draft'")
    op.execute("DROP TABLE IF EXISTS cycle_entity_scope")
    for table, column, _ in reversed(_NEW_COLUMNS):
        op.execute(f"ALTER TABLE {table} DROP COLUMN IF EXISTS {column}")

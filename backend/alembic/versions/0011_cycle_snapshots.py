"""cycle_snapshots — per-cycle frozen outcomes for the history + trends screen

A closed cycle's numbers (received-rate, approval turnaround, who finished late) are true only as of
its close; they can't be recomputed once the next cycle's submissions move on. So closing a cycle
records a snapshot, and the history view reads snapshots for past cycles and computes live for the
open one. One row per cycle, ON DELETE CASCADE so removing a cycle removes its snapshot.

Also hardens cycle_entity_scope's FK with ON DELETE CASCADE (0009 created it without), so deleting a
cycle cleans up both children.

Revision ID: 0011_cycle_snapshots
Revises: 0010_analytics_dashboards
Create Date: 2026-07-17
"""
from __future__ import annotations

from alembic import op

revision = "0011_cycle_snapshots"
down_revision = "0010_analytics_dashboards"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS cycle_snapshots (
            id SERIAL PRIMARY KEY,
            cycle_id INTEGER NOT NULL UNIQUE REFERENCES collection_cycles(id) ON DELETE CASCADE,
            departments_total INTEGER NOT NULL DEFAULT 0,
            received INTEGER NOT NULL DEFAULT 0,
            approved INTEGER NOT NULL DEFAULT 0,
            avg_turnaround_days NUMERIC(6,1) NOT NULL DEFAULT 0,
            late_entity_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
            captured_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
        )
        """
    )
    # Harden the 0009 scope FK to cascade on cycle delete (safe if the constraint name matches).
    op.execute(
        """
        DO $$
        BEGIN
            ALTER TABLE cycle_entity_scope DROP CONSTRAINT IF EXISTS cycle_entity_scope_cycle_id_fkey;
            ALTER TABLE cycle_entity_scope
                ADD CONSTRAINT cycle_entity_scope_cycle_id_fkey
                FOREIGN KEY (cycle_id) REFERENCES collection_cycles(id) ON DELETE CASCADE;
        END $$;
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS cycle_snapshots")

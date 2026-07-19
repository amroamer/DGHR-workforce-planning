"""cycle_reminders + cycle_extensions — the reminder engine and per-entity deadline extensions

Two Phase-D additions:
  cycle_reminders   — one row per (cycle, milestone) actually sent, so the 7/3/1-day auto-reminders
                      fire once per threshold instead of re-spamming on every poll.
  cycle_extensions  — a per-entity later deadline within a cycle; it also defers auto-close until the
                      latest extension expires, so a laggard gets extra time without shutting the
                      window on everyone.

Both cascade on cycle delete.

Revision ID: 0012_cycle_reminders_extensions
Revises: 0011_cycle_snapshots
Create Date: 2026-07-17
"""
from __future__ import annotations

from alembic import op

revision = "0012_cycle_reminders_extensions"
down_revision = "0011_cycle_snapshots"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS cycle_reminders (
            id SERIAL PRIMARY KEY,
            cycle_id INTEGER NOT NULL REFERENCES collection_cycles(id) ON DELETE CASCADE,
            milestone INTEGER NOT NULL,
            reminded INTEGER NOT NULL DEFAULT 0,
            sent_at TIMESTAMPTZ,
            CONSTRAINT uq_cycle_reminder UNIQUE (cycle_id, milestone)
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS cycle_extensions (
            id SERIAL PRIMARY KEY,
            cycle_id INTEGER NOT NULL REFERENCES collection_cycles(id) ON DELETE CASCADE,
            entity_id INTEGER NOT NULL REFERENCES entities(id),
            extended_deadline DATE NOT NULL,
            reason VARCHAR(240) NOT NULL DEFAULT '',
            granted_by VARCHAR(120) NOT NULL DEFAULT 'DGHR Admin',
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now(),
            CONSTRAINT uq_cycle_extension UNIQUE (cycle_id, entity_id)
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS cycle_extensions")
    op.execute("DROP TABLE IF EXISTS cycle_reminders")

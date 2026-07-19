"""screen change requests (18072026): per-position rows, champion, reminder receipts

Batched schema for the WFP screen change requests:
  submission_position_rows  — S3: the scrollable per-role breakdown (role, grade band, headcount)
                              and, via `structural`, the manager/director/ED/DG/CEO count (S5).
  entities.champion_name    — the entity's HR champion who reviews the consolidated submission (S10-14/S18).
  department_submissions.champion_verified_at / _by
                            — the champion's verification on the consolidated report (Phase E).
  reminder_receipts         — S19: per-recipient reminder tracking with read receipts.

Tenure distributions (S5/S9) reuse submission_workforce_bands with dimension='tenure', so they need
no schema — only seed data.

Revision ID: 0013_screen_change_requests
Revises: 0012_cycle_reminders_extensions
Create Date: 2026-07-18
"""
from __future__ import annotations

from alembic import op

revision = "0013_screen_change_requests"
down_revision = "0012_cycle_reminders_extensions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS submission_position_rows (
            id SERIAL PRIMARY KEY,
            submission_id INTEGER NOT NULL REFERENCES department_submissions(id) ON DELETE CASCADE,
            role VARCHAR(120) NOT NULL,
            grade_band VARCHAR(32) NOT NULL DEFAULT '',
            job_level VARCHAR(32) NOT NULL DEFAULT '',
            seniority VARCHAR(32) NOT NULL DEFAULT 'staff',
            structural BOOLEAN NOT NULL DEFAULT FALSE,
            headcount INTEGER NOT NULL DEFAULT 0,
            position INTEGER NOT NULL DEFAULT 0
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_position_rows_submission ON submission_position_rows(submission_id)")

    op.execute("ALTER TABLE entities ADD COLUMN IF NOT EXISTS champion_name VARCHAR(120)")
    op.execute("ALTER TABLE department_submissions ADD COLUMN IF NOT EXISTS champion_verified_at TIMESTAMPTZ")
    op.execute("ALTER TABLE department_submissions ADD COLUMN IF NOT EXISTS champion_verified_by VARCHAR(120) NOT NULL DEFAULT ''")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS reminder_receipts (
            id SERIAL PRIMARY KEY,
            cycle_id INTEGER NOT NULL REFERENCES collection_cycles(id) ON DELETE CASCADE,
            entity_id INTEGER NOT NULL REFERENCES entities(id),
            recipient_name VARCHAR(120) NOT NULL,
            recipient_role VARCHAR(24) NOT NULL DEFAULT 'contributor',
            milestone INTEGER,
            sent_at TIMESTAMPTZ DEFAULT now(),
            read_at TIMESTAMPTZ
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_reminder_receipts_cycle ON reminder_receipts(cycle_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS reminder_receipts")
    op.execute("ALTER TABLE department_submissions DROP COLUMN IF EXISTS champion_verified_by")
    op.execute("ALTER TABLE department_submissions DROP COLUMN IF EXISTS champion_verified_at")
    op.execute("ALTER TABLE entities DROP COLUMN IF EXISTS champion_name")
    op.execute("DROP TABLE IF EXISTS submission_position_rows")

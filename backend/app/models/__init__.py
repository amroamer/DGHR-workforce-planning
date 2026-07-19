"""SQLAlchemy models — DGHR Workforce Planning Portal (SPEC §6, incl. §7.6 preview tables)."""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


# ─────────────────────────── Users & Entities ───────────────────────────
class User(Base, TimestampMixin):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    initials: Mapped[str] = mapped_column(String(8))
    role: Mapped[str] = mapped_column(String(32))  # dghr_admin|dghr_analyst|dghr_reviewer|entity_admin|entity_contact
    entity_id: Mapped[int | None] = mapped_column(ForeignKey("entities.id"), nullable=True)
    avatar_color: Mapped[str] = mapped_column(String(16), default="#2563EB")


class Entity(Base, TimestampMixin):
    __tablename__ = "entities"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    code: Mapped[str] = mapped_column(String(16))
    wave: Mapped[str] = mapped_column(String(4))  # W1|W2|W3
    reviewer_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(24), default="not_started")
    overdue: Mapped[bool] = mapped_column(Boolean, default=False)
    completeness: Mapped[int] = mapped_column(Integer, default=0)
    quality_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    forecasting_ready: Mapped[bool] = mapped_column(Boolean, default=False)
    blocked_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    # The entity's HR champion: reviews the consolidated department submissions (S10-14/S18).
    champion_name: Mapped[str | None] = mapped_column(String(120), nullable=True)

    reviewer: Mapped[User | None] = relationship("User", foreign_keys=[reviewer_id])


# ─────────────────────────── Cycle & Packages ───────────────────────────
class CollectionCycle(Base, TimestampMixin):
    __tablename__ = "collection_cycles"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    starts_on: Mapped[date] = mapped_column(Date)
    ends_on: Mapped[date] = mapped_column(Date)
    deadline: Mapped[date] = mapped_column(Date)
    # Lifecycle. draft = being configured (invisible to entities); open = live, submissions accepted;
    # closed = window shut; archived = kept only for history/trends. At most one 'open' at a time
    # (enforced on open), so "which cycle is live" has exactly one answer — see services/cycles.py.
    status: Mapped[str] = mapped_column(String(16), default="draft")  # draft|open|closed|archived
    # The target dates (starts_on/deadline) say what was PLANNED; these say what actually happened —
    # a cycle opened ad hoc rarely opens exactly on its planned start.
    opened_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    opened_by: Mapped[str] = mapped_column(String(120), default="")
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    closed_by: Mapped[str] = mapped_column(String(120), default="")
    # Closing is manual AND automatic: when auto_close is on, the deadline shuts the window
    # (evaluated lazily — the stack has no scheduler); DGHR can always close early by hand.
    auto_close: Mapped[bool] = mapped_column(Boolean, default=True)
    # An open cycle targets every entity, or a chosen subset held in CycleEntityScope rows.
    scope_mode: Mapped[str] = mapped_column(String(16), default="all")  # all|selected
    version_label: Mapped[str] = mapped_column(String(16), default="v2.1")
    late_policy: Mapped[str] = mapped_column(String(64), default="Allow with approval")
    reviewer_rule: Mapped[str] = mapped_column(String(64), default="By Section Type")
    reminders_label: Mapped[str] = mapped_column(String(64), default="7, 3, 1 days before due date")
    approval_workflow_label: Mapped[str] = mapped_column(
        String(64), default="Reviewer → Approver → DGHR"
    )


class CycleEntityScope(Base):
    """Which entities a cycle targets when scope_mode='selected'. Absent for 'all' cycles."""
    __tablename__ = "cycle_entity_scope"
    id: Mapped[int] = mapped_column(primary_key=True)
    cycle_id: Mapped[int] = mapped_column(ForeignKey("collection_cycles.id", ondelete="CASCADE"))
    entity_id: Mapped[int] = mapped_column(ForeignKey("entities.id"))
    __table_args__ = (UniqueConstraint("cycle_id", "entity_id", name="uq_cycle_entity"),)


class CycleSnapshot(Base, TimestampMixin):
    """A cycle's OUTCOME, frozen when it closes — the record the history/trends screen reads for a
    past cycle. It exists because a closed cycle's numbers can't be recomputed from live data once
    the next cycle's submissions move on: received-rate, approval turnaround and who finished late are
    true only as of the close. Written by services/cycles.write_snapshot on close, cleared on reopen.
    One per cycle; ON DELETE CASCADE so removing a cycle removes its snapshot."""
    __tablename__ = "cycle_snapshots"
    id: Mapped[int] = mapped_column(primary_key=True)
    cycle_id: Mapped[int] = mapped_column(
        ForeignKey("collection_cycles.id", ondelete="CASCADE"), unique=True)
    departments_total: Mapped[int] = mapped_column(Integer, default=0)
    received: Mapped[int] = mapped_column(Integer, default=0)
    approved: Mapped[int] = mapped_column(Integer, default=0)
    avg_turnaround_days: Mapped[float] = mapped_column(Numeric(6, 1), default=0)
    # entity CODES that hadn't fully submitted at close — the raw material for "chronically late".
    late_entity_codes: Mapped[list] = mapped_column(JSONB, default=list)
    captured_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class CycleReminder(Base):
    """One log row per (cycle, milestone) reminder actually sent — so the 7/3/1-day auto-reminders
    fire once per threshold and never re-spam on every poll. `milestone` is days-before-deadline."""
    __tablename__ = "cycle_reminders"
    id: Mapped[int] = mapped_column(primary_key=True)
    cycle_id: Mapped[int] = mapped_column(ForeignKey("collection_cycles.id", ondelete="CASCADE"))
    milestone: Mapped[int] = mapped_column(Integer)        # days before deadline (7, 3, 1, 0)
    reminded: Mapped[int] = mapped_column(Integer, default=0)   # how many entities were chased
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    __table_args__ = (UniqueConstraint("cycle_id", "milestone", name="uq_cycle_reminder"),)


class CycleExtension(Base, TimestampMixin):
    """A per-entity deadline extension within a cycle — some entities always ask. It gives that entity
    a later effective deadline, and defers the cycle's auto-close until the latest extension expires,
    so a laggard gets its extra time without the window slamming shut on everyone."""
    __tablename__ = "cycle_extensions"
    id: Mapped[int] = mapped_column(primary_key=True)
    cycle_id: Mapped[int] = mapped_column(ForeignKey("collection_cycles.id", ondelete="CASCADE"))
    entity_id: Mapped[int] = mapped_column(ForeignKey("entities.id"))
    extended_deadline: Mapped[date] = mapped_column(Date)
    reason: Mapped[str] = mapped_column(String(240), default="")
    granted_by: Mapped[str] = mapped_column(String(120), default="DGHR Admin")
    __table_args__ = (UniqueConstraint("cycle_id", "entity_id", name="uq_cycle_extension"),)


class SectionType(Base, TimestampMixin):
    __tablename__ = "section_types"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    description: Mapped[str] = mapped_column(String(160))
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class DataPackage(Base, TimestampMixin):
    __tablename__ = "data_packages"
    id: Mapped[int] = mapped_column(primary_key=True)
    cycle_id: Mapped[int] = mapped_column(ForeignKey("collection_cycles.id"))
    position: Mapped[int] = mapped_column(Integer)
    key: Mapped[str] = mapped_column(String(32))
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(String(240))
    total_fields: Mapped[int] = mapped_column(Integer)
    mandatory_fields: Mapped[int] = mapped_column(Integer)
    optional_fields: Mapped[int] = mapped_column(Integer)
    mandatory_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    evidence_required: Mapped[str] = mapped_column(String(16), default="yes")  # yes|optional
    evidence_fields_label: Mapped[str] = mapped_column(String(32), default="")
    status: Mapped[str] = mapped_column(String(16), default="configured")
    icon_key: Mapped[str] = mapped_column(String(32), default="package")


class PackageFieldGroup(Base):
    __tablename__ = "package_field_groups"
    id: Mapped[int] = mapped_column(primary_key=True)
    package_id: Mapped[int] = mapped_column(ForeignKey("data_packages.id"))
    name: Mapped[str] = mapped_column(String(120))
    field_count: Mapped[int] = mapped_column(Integer)


class PackageSectionType(Base):
    __tablename__ = "package_section_types"
    package_id: Mapped[int] = mapped_column(ForeignKey("data_packages.id"), primary_key=True)
    section_type_id: Mapped[int] = mapped_column(
        ForeignKey("section_types.id"), primary_key=True
    )


class EntityPackage(Base, TimestampMixin):
    __tablename__ = "entity_packages"
    id: Mapped[int] = mapped_column(primary_key=True)
    entity_id: Mapped[int] = mapped_column(ForeignKey("entities.id"))
    package_id: Mapped[int] = mapped_column(ForeignKey("data_packages.id"))
    applicable: Mapped[bool] = mapped_column(Boolean, default=True)
    status: Mapped[str] = mapped_column(String(24), default="not_started")
    progress: Mapped[int] = mapped_column(Integer, default=0)


# ─────────────────────────── Entity submission data ───────────────────────────
class OrgSection(Base):
    __tablename__ = "org_sections"
    id: Mapped[int] = mapped_column(primary_key=True)
    entity_id: Mapped[int] = mapped_column(ForeignKey("entities.id"))
    sector: Mapped[str] = mapped_column(String(120))
    department: Mapped[str] = mapped_column(String(120))
    name: Mapped[str] = mapped_column(String(120))
    owner_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    owner_initials: Mapped[str | None] = mapped_column(String(8), nullable=True)
    hr_focal_point: Mapped[str | None] = mapped_column(String(120), nullable=True)
    in_scope: Mapped[bool] = mapped_column(Boolean, default=True)
    employee_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="mapped")  # mapped|unmapped|partial|not_in_scope


class JobFamily(Base):
    __tablename__ = "job_families"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80))


class StandardJobTitle(Base):
    __tablename__ = "standard_job_titles"
    id: Mapped[int] = mapped_column(primary_key=True)
    family_id: Mapped[int] = mapped_column(ForeignKey("job_families.id"))
    title: Mapped[str] = mapped_column(String(120))
    aliases: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)


class WorkforceRecord(Base):
    __tablename__ = "workforce_records"
    id: Mapped[int] = mapped_column(primary_key=True)
    entity_id: Mapped[int] = mapped_column(ForeignKey("entities.id"))
    section: Mapped[str] = mapped_column(String(120))
    job_title: Mapped[str] = mapped_column(String(160))
    job_family: Mapped[str | None] = mapped_column(String(80), nullable=True)
    grade: Mapped[int | None] = mapped_column(Integer, nullable=True)
    current_fte: Mapped[float] = mapped_column(Numeric(6, 2), default=0)
    vacancies: Mapped[float] = mapped_column(Numeric(6, 2), default=0)
    employment_type: Mapped[str | None] = mapped_column(String(24), nullable=True)
    critical_role: Mapped[bool] = mapped_column(Boolean, default=False)
    map_status: Mapped[str] = mapped_column(String(16), default="mapped")  # mapped|partial|unmapped
    issues: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)


class WorkloadSection(Base):
    __tablename__ = "workload_sections"
    id: Mapped[int] = mapped_column(primary_key=True)
    entity_id: Mapped[int] = mapped_column(ForeignKey("entities.id"))
    name: Mapped[str] = mapped_column(String(120))
    metrics_count: Mapped[int] = mapped_column(Integer, default=0)
    service_type: Mapped[str] = mapped_column(String(80))
    key_metric: Mapped[str] = mapped_column(String(120))
    current_volume: Mapped[int | None] = mapped_column(Integer, nullable=True)
    prev_volume: Mapped[int | None] = mapped_column(Integer, nullable=True)
    unit: Mapped[str] = mapped_column(String(40), default="")
    complexity: Mapped[str] = mapped_column(String(16), default="Medium")  # Low|Medium|High
    source_system: Mapped[str] = mapped_column(String(80), default="")
    status: Mapped[str] = mapped_column(String(16), default="complete")  # complete|draft|missing_data|overdue
    monthly_pattern: Mapped[list[int]] = mapped_column(ARRAY(Integer), default=list)
    peak_label: Mapped[str] = mapped_column(String(40), default="")


class DemandDriver(Base):
    __tablename__ = "demand_drivers"
    id: Mapped[int] = mapped_column(primary_key=True)
    entity_id: Mapped[int] = mapped_column(ForeignKey("entities.id"))
    category: Mapped[str] = mapped_column(String(80))
    description: Mapped[str] = mapped_column(String(240))
    impact: Mapped[str] = mapped_column(String(16))  # High|Medium|Low
    horizon: Mapped[str] = mapped_column(String(24))
    status: Mapped[str] = mapped_column(String(16), default="in_progress")  # in_progress|captured
    linked_sections: Mapped[str] = mapped_column(String(240), default="")  # comma-joined forecast section labels (DD-07)


class EvidenceDoc(Base):
    __tablename__ = "evidence_docs"
    id: Mapped[int] = mapped_column(primary_key=True)
    entity_id: Mapped[int] = mapped_column(ForeignKey("entities.id"))
    filename: Mapped[str] = mapped_column(String(200))
    source_org: Mapped[str] = mapped_column(String(120), default="")
    linked_driver_id: Mapped[int | None] = mapped_column(
        ForeignKey("demand_drivers.id"), nullable=True
    )
    linked_label: Mapped[str] = mapped_column(String(120), default="")
    quality: Mapped[str] = mapped_column(String(16), default="Medium")  # High|Medium|Low
    uploaded_by: Mapped[str] = mapped_column(String(120), default="")
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    filepath: Mapped[str] = mapped_column(String(300), default="")


# ─────────────────────────── Validation & quality ───────────────────────────
class ValidationIssue(Base):
    __tablename__ = "validation_issues"
    id: Mapped[int] = mapped_column(primary_key=True)
    entity_id: Mapped[int] = mapped_column(ForeignKey("entities.id"))
    package_key: Mapped[str] = mapped_column(String(32))
    issue_type: Mapped[str] = mapped_column(String(80))
    severity: Mapped[str] = mapped_column(String(16))  # High|Medium|Low
    ai_confidence: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(16), default="open")  # open|in_progress|cleared
    next_action: Mapped[str] = mapped_column(String(16), default="Review")  # Review|Investigate
    assigned_to: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)


class RuleStat(Base):
    __tablename__ = "rule_stats"
    id: Mapped[int] = mapped_column(primary_key=True)
    category: Mapped[str] = mapped_column(String(40))
    passed: Mapped[int] = mapped_column(Integer)
    failed: Mapped[int] = mapped_column(Integer)


class Anomaly(Base):
    __tablename__ = "anomalies"
    id: Mapped[int] = mapped_column(primary_key=True)
    entity_id: Mapped[int] = mapped_column(ForeignKey("entities.id"))
    title: Mapped[str] = mapped_column(String(200))
    detail: Mapped[str] = mapped_column(Text, default="")
    package_key: Mapped[str] = mapped_column(String(32))
    severity: Mapped[str] = mapped_column(String(16))
    confidence: Mapped[int] = mapped_column(Integer, default=0)
    narrative: Mapped[str | None] = mapped_column(Text, nullable=True)


# ─────────────────────────── Cases & governance ───────────────────────────
class Case(Base, TimestampMixin):
    __tablename__ = "cases"
    id: Mapped[int] = mapped_column(primary_key=True)
    ref: Mapped[str] = mapped_column(String(24), unique=True)
    kind: Mapped[str] = mapped_column(String(16))  # clarification|return
    entity_id: Mapped[int] = mapped_column(ForeignKey("entities.id"))
    package_label: Mapped[str] = mapped_column(String(120))
    priority: Mapped[str] = mapped_column(String(16), default="Medium")
    category: Mapped[str] = mapped_column(String(80), default="")
    status: Mapped[str] = mapped_column(String(16), default="open")  # open|responded|resolved
    assigned_to: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    issue_summary: Mapped[str] = mapped_column(Text, default="")
    corrections: Mapped[list] = mapped_column(JSONB, default=list)
    returned_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    resolved_on: Mapped[date | None] = mapped_column(Date, nullable=True)


class CaseMessage(Base):
    __tablename__ = "case_messages"
    id: Mapped[int] = mapped_column(primary_key=True)
    case_id: Mapped[int] = mapped_column(ForeignKey("cases.id"))
    author_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    side: Mapped[str] = mapped_column(String(8))  # dghr|entity
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class PackageComment(Base):
    __tablename__ = "package_comments"
    id: Mapped[int] = mapped_column(primary_key=True)
    entity_id: Mapped[int] = mapped_column(ForeignKey("entities.id"))
    package_key: Mapped[str] = mapped_column(String(32))
    author_name: Mapped[str] = mapped_column(String(120))
    author_role: Mapped[str] = mapped_column(String(80))
    body: Mapped[str] = mapped_column(Text)
    related_label: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class AuditEvent(Base):
    __tablename__ = "audit_events"
    id: Mapped[int] = mapped_column(primary_key=True)
    case_id: Mapped[int | None] = mapped_column(ForeignKey("cases.id"), nullable=True)
    entity_id: Mapped[int | None] = mapped_column(ForeignKey("entities.id"), nullable=True)
    # Everything used to be baked into an English sentence, so nothing could be filtered, counted or
    # attached to the thing it happened to. `verb` is the machine-readable action; `submission_id`
    # is what a submission's own history is queried by.
    submission_id: Mapped[int | None] = mapped_column(
        ForeignKey("department_submissions.id"), nullable=True)
    verb: Mapped[str] = mapped_column(String(32), default="")
    label: Mapped[str] = mapped_column(String(200))
    actor_name: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(primary_key=True)
    audience: Mapped[str] = mapped_column(String(8))  # dghr|entity
    entity_id: Mapped[int | None] = mapped_column(ForeignKey("entities.id"), nullable=True)
    kind: Mapped[str] = mapped_column(String(24))  # clarification|announcement|reminder|status|ai_flag
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    read: Mapped[bool] = mapped_column(Boolean, default=False)


class Alert(Base):
    __tablename__ = "alerts"
    id: Mapped[int] = mapped_column(primary_key=True)
    severity: Mapped[str] = mapped_column(String(16))  # danger|warning|info
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Upload(Base):
    __tablename__ = "uploads"
    id: Mapped[int] = mapped_column(primary_key=True)
    entity_id: Mapped[int] = mapped_column(ForeignKey("entities.id"))
    # A document can now belong to a specific department's submission, not just the whole entity, so
    # evidence travels with the figures it supports. Null = an entity-wide document (the old behaviour).
    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id"), nullable=True)
    kind: Mapped[str] = mapped_column(String(24))
    filename: Mapped[str] = mapped_column(String(200))
    path: Mapped[str] = mapped_column(String(300), default="")
    uploaded_by: Mapped[str] = mapped_column(String(120), default="")
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    meta: Mapped[dict] = mapped_column(JSONB, default=dict)


# ─────────────────────────── Layer-B preview tables (§7.6) ───────────────────────────
class VisionMetric(Base):
    __tablename__ = "vision_metrics"
    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(48))
    label: Mapped[str] = mapped_column(String(120))
    value_numeric: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    value_text: Mapped[str | None] = mapped_column(String(120), nullable=True)
    unit: Mapped[str] = mapped_column(String(24), default="")
    grouping: Mapped[str] = mapped_column(String(48), default="")


class SkillsGapPreview(Base):
    __tablename__ = "skills_gap_preview"
    id: Mapped[int] = mapped_column(primary_key=True)
    skill: Mapped[str] = mapped_column(String(80))
    gap_fte: Mapped[int] = mapped_column(Integer)
    rank: Mapped[int] = mapped_column(Integer)


class ScenarioPreview(Base):
    __tablename__ = "scenario_preview"
    id: Mapped[int] = mapped_column(primary_key=True)
    scenario: Mapped[str] = mapped_column(String(24))  # baseline|high_growth|efficiency
    headcount: Mapped[int] = mapped_column(Integer)
    cost_aed_b: Mapped[float] = mapped_column(Numeric(6, 2))
    gaps: Mapped[int] = mapped_column(Integer)


class InsightQuote(Base):
    __tablename__ = "insight_quotes"
    id: Mapped[int] = mapped_column(primary_key=True)
    body: Mapped[str] = mapped_column(Text)
    tag: Mapped[str] = mapped_column(String(40), default="")


class DashboardStat(Base):
    """Pinned aggregate display stats that aren't derivable from row-level seeded data
    (e.g. cross-entity evidence counts on screen 04, blocked-reason breakdown on screen 03).
    Kept in the DB so no metric is hardcoded in the frontend."""

    __tablename__ = "dashboard_stats"
    id: Mapped[int] = mapped_column(primary_key=True)
    group: Mapped[str] = mapped_column(String(48))  # e.g. quality_evidence, blocked_summary
    key: Mapped[str] = mapped_column(String(64))
    label: Mapped[str] = mapped_column(String(120), default="")
    value_int: Mapped[int | None] = mapped_column(Integer, nullable=True)
    value_text: Mapped[str | None] = mapped_column(String(120), nullable=True)
    meta: Mapped[dict] = mapped_column(JSONB, default=dict)
    position: Mapped[int] = mapped_column(Integer, default=0)


# ─────────────────────────── App-level singletons ───────────────────────────
class AppState(Base):
    """Single-row helper for global 'last updated' + trend series."""

    __tablename__ = "app_state"
    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    last_updated: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    trend_points: Mapped[list] = mapped_column(JSONB, default=list)  # [{label, value}]


# ═══════════════════════ Planning: departments + sizing engine ═══════════════════════
# New model that sits inside each Entity. A Department has a typeset, a current-FTE
# (supply), and one submission built through the 5-step stepper. The sizing engine
# turns each submission's drivers + statutory floors into a required-FTE (services/sizing.py).
class Typeset(Base):
    """One of the 10 government department types. Carries default drivers + standard params."""

    __tablename__ = "typesets"
    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(48))            # policy_strategy | project_delivery | ...
    name: Mapped[str] = mapped_column(String(80))           # "Policy & strategy"
    position: Mapped[int] = mapped_column(Integer, default=0)
    primary_family: Mapped[str] = mapped_column(String(16), default="demand")
    description: Mapped[str] = mapped_column(String(240), default="")
    # template drivers a new department starts from: [{name, unit, family, params}]
    default_drivers: Mapped[list] = mapped_column(JSONB, default=list)
    # A department is sized against its typeset's standard drivers + params, so a Required FTE is
    # only reproducible if you know WHICH revision of that classification produced it. Every trace
    # reports this next to the formula version.
    version: Mapped[str] = mapped_column(String(16), default="1.0")
    effective_from: Mapped[date | None] = mapped_column(Date, nullable=True)


class Department(Base, TimestampMixin):
    __tablename__ = "departments"
    id: Mapped[int] = mapped_column(primary_key=True)
    entity_id: Mapped[int] = mapped_column(ForeignKey("entities.id"))
    name: Mapped[str] = mapped_column(String(160))
    typeset_id: Mapped[int | None] = mapped_column(ForeignKey("typesets.id"), nullable=True)
    # ── supply, split into the three concepts it used to collapse into one number ──
    # `current_fte` is the FILLED ESTABLISHMENT in full-time-equivalent terms: the time actually on
    # the department's own payroll. It is NOT a headcount (part-timers make FTE < headcount) and NOT
    # the authorised establishment (vacancies make filled < approved). It stays on Department rather
    # than the submission because it is known for every department, including ones that never
    # submitted — services/sizing._estimated_sizing scales it for the outstanding ones.
    current_fte: Mapped[float] = mapped_column(Numeric(8, 2), default=0)
    # Authorised posts. Vacancies = approved_positions − filled positions, and are always DERIVED
    # (services/supply.py) so an approved/filled/vacant triple can never drift out of step.
    approved_positions: Mapped[int] = mapped_column(Integer, default=0)
    head_name: Mapped[str] = mapped_column(String(120), default="")


# A submission's life. `draft` is the ONLY editable state — everything else is a record of something
# that was said to DGHR, and a record you can quietly edit is not a record. Changing anything after
# submission creates a NEW VERSION (services/versioning.revise) rather than rewriting history.
SUBMISSION_STATUSES = ("draft", "submitted", "in_clarification", "recommended", "approved", "rejected")
EDITABLE_STATUSES = ("draft",)
# Counted as "arrived" for the government position. `recommended` is in review but the data HAS
# arrived, so it counts exactly as `submitted` does.
RECEIVED_STATUSES = ("submitted", "in_clarification", "recommended", "approved")


class DepartmentSubmission(Base, TimestampMixin):
    """ONE VERSION of a department's submission — not "the" submission.

    Versions are append-only. v1 is submitted and approved; if anything must change, v2 is created as
    a copy and edited, and v1 survives untouched as the immutable record of what was actually
    submitted and signed off. `supersedes_id` chains them. Nothing ever edits a version that has left
    the entity's hands, so an approved figure can never change underneath the approval that blessed it.
    """

    __tablename__ = "department_submissions"
    id: Mapped[int] = mapped_column(primary_key=True)
    department_id: Mapped[int] = mapped_column(ForeignKey("departments.id"))
    cycle_id: Mapped[int | None] = mapped_column(ForeignKey("collection_cycles.id"), nullable=True)
    # see SUBMISSION_STATUSES
    status: Mapped[str] = mapped_column(String(24), default="draft")
    notes: Mapped[str] = mapped_column(Text, default="")

    # ── version chain ──
    version: Mapped[int] = mapped_column(Integer, default=1)
    supersedes_id: Mapped[int | None] = mapped_column(
        ForeignKey("department_submissions.id"), nullable=True)
    supersedes: Mapped["DepartmentSubmission | None"] = relationship(
        "DepartmentSubmission", remote_side=[id], foreign_keys=[supersedes_id])

    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Who stands behind this submission — the people a trace names.
    submitted_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    submitted_by_name: Mapped[str] = mapped_column(String(120), default="")
    submitted_by: Mapped[User | None] = relationship("User", foreign_keys=[submitted_by_id])
    # The signed attestation captured at submit. A submission cannot be sent without it, and because
    # a version is immutable the attestation is fixed to exactly the figures that were confirmed —
    # not a box someone ticked once against numbers that later changed.
    attested: Mapped[bool] = mapped_column(Boolean, default=False)
    attested_by: Mapped[str] = mapped_column(String(120), default="")
    attested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # ── stage 1: a reviewer RECOMMENDS ──
    # The Cycle screen has always advertised "Reviewer → Approver → DGHR"; this is that chain, made
    # real. A recommendation is not an approval: it is one person's opinion, awaiting a second.
    recommendation: Mapped[str] = mapped_column(String(16), default="")   # "" | approve | reject
    recommendation_note: Mapped[str] = mapped_column(Text, default="")
    recommended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    recommended_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    recommended_by_name: Mapped[str] = mapped_column(String(120), default="")
    recommended_by: Mapped[User | None] = relationship("User", foreign_keys=[recommended_by_id])

    # ── stage 2: a DIFFERENT person decides ──
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    decision_note: Mapped[str] = mapped_column(Text, default="")   # reject reason / approve rationale
    # `decided_by_id` is what makes maker-checker enforceable at all: without an approver identity
    # there is nothing to compare the reviewer's against.
    decided_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    decided_by_name: Mapped[str] = mapped_column(String(120), default="")
    decided_by: Mapped[User | None] = relationship("User", foreign_keys=[decided_by_id])
    # Binding caveats attached at approval: ["Revisit if the e-permits build slips past March", …].
    # An approval carrying conditions is still an approval — but it says what it depends on.
    conditions: Mapped[list] = mapped_column(JSONB, default=list)

    # ── champion verification (S10-14): the entity's HR champion verifies the consolidated report
    # before it goes to DGHR. Distinct from the two-stage DGHR maker-checker above. ──
    champion_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    champion_verified_by: Mapped[str] = mapped_column(String(120), default="")


# Element addressing. A clarification, an override or a review decision points AT something — a
# driver, the workforce profile, the notes. It used to point at a raw driver id, but saving a
# submission deletes and recreates every driver row, so the pointer silently detached (and could
# even land on a recycled id). Copying a submission into v2 breaks it the same way.
#
# `element_key` is a stable slug that survives both: it is generated from the element's name once and
# carried forward on every copy, so a thread about "Service transactions" is still about that driver
# three versions later.
ELEMENT_TYPES = ("driver", "mandate", "profile", "supply", "notes", "submission")


def element_key(name: str) -> str:
    """Stable slug for an element, from its name. Deterministic — same name, same key, forever."""
    out = "".join(c.lower() if c.isalnum() else "-" for c in (name or "").strip())
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-")[:80] or "unnamed"


class SubmissionDriver(Base):
    __tablename__ = "submission_drivers"
    id: Mapped[int] = mapped_column(primary_key=True)
    submission_id: Mapped[int] = mapped_column(ForeignKey("department_submissions.id"))
    # Stable across saves and version copies — see element_key() above.
    element_key: Mapped[str] = mapped_column(String(80), default="")
    name: Mapped[str] = mapped_column(String(200))
    unit: Mapped[str] = mapped_column(String(48), default="")
    family: Mapped[str] = mapped_column(String(16), default="demand")   # demand|ratio|coverage|project
    volume: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    forecast: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    # standard inputs used by the family formula:
    # {minutes_per_unit, productive_hours, quality_allowance, serving_ratio, shifts, relief_factor, team_size, fte_override}
    params: Mapped[dict] = mapped_column(JSONB, default=dict)
    position: Mapped[int] = mapped_column(Integer, default=0)
    # Provenance for the trace's "input value and source" + "person who entered or changed it".
    # A volume is only as defensible as where it came from and who typed it.
    source: Mapped[str] = mapped_column(String(120), default="")   # "Entity submission — stepper" | "Typeset default"
    entered_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    entered_by_name: Mapped[str] = mapped_column(String(120), default="")
    entered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    entered_by: Mapped[User | None] = relationship("User", foreign_keys=[entered_by_id])


class MandateFloor(Base):
    __tablename__ = "mandate_floors"
    id: Mapped[int] = mapped_column(primary_key=True)
    submission_id: Mapped[int] = mapped_column(ForeignKey("department_submissions.id"))
    element_key: Mapped[str] = mapped_column(String(80), default="")   # stable — see element_key()
    role: Mapped[str] = mapped_column(String(200))
    legal_basis: Mapped[str] = mapped_column(String(200), default="")
    positions: Mapped[int] = mapped_column(Integer, default=0)


class SubmissionClarification(Base):
    """Element-level clarification thread: DGHR (or entity reply) attached to a specific
    element of a submission — a driver, a mandate, the profile, the supply chain, or the notes."""

    __tablename__ = "submission_clarifications"
    id: Mapped[int] = mapped_column(primary_key=True)
    submission_id: Mapped[int] = mapped_column(ForeignKey("department_submissions.id"))
    element_type: Mapped[str] = mapped_column(String(16))   # see ELEMENT_TYPES
    # `element_id` is the driver/mandate row id AT THE TIME OF ASKING — kept for the audit record,
    # but it is NOT how the thread is addressed: those rows are replaced on every save. `element_key`
    # is the durable pointer.
    element_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    element_key: Mapped[str] = mapped_column(String(80), default="")
    element_label: Mapped[str] = mapped_column(String(200), default="")
    message: Mapped[str] = mapped_column(Text, default="")
    author: Mapped[str] = mapped_column(String(120), default="DGHR")
    side: Mapped[str] = mapped_column(String(8), default="dghr")   # dghr|entity
    status: Mapped[str] = mapped_column(String(16), default="open")  # open|answered|resolved
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_by_name: Mapped[str] = mapped_column(String(120), default="")
    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("submission_clarifications.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


# ── review decisions, element by element ──
# Partial approval, addressed with the SAME element scheme clarifications already use. Deliberately
# NOT the entity roll-up's `partially_approved` (services/sizing.ROLLUP_LADDER): that word describes
# an entity as a container of departments. This is one reviewer signing off one part of one
# submission. The two vocabularies compose; neither replaces the other.
#
# A submission can only be recommended once EVERY reviewable element is approved, so "partially
# approved" never leaks into a total — a part-approved submission is honestly still in review.
ELEMENT_DECISIONS = ("approved", "queried")


class SubmissionElementDecision(Base):
    """One reviewer's verdict on ONE element of ONE version. Append-only: a later row on the same
    element supersedes an earlier one, and the earlier one stays as history."""

    __tablename__ = "submission_element_decisions"
    id: Mapped[int] = mapped_column(primary_key=True)
    submission_id: Mapped[int] = mapped_column(ForeignKey("department_submissions.id"))
    element_type: Mapped[str] = mapped_column(String(16))   # see ELEMENT_TYPES
    element_key: Mapped[str] = mapped_column(String(80), default="")
    element_label: Mapped[str] = mapped_column(String(200), default="")
    decision: Mapped[str] = mapped_column(String(16))       # see ELEMENT_DECISIONS
    note: Mapped[str] = mapped_column(Text, default="")
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    actor_name: Mapped[str] = mapped_column(String(120), default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    actor: Mapped[User | None] = relationship("User", foreign_keys=[actor_id])


class SubmissionWorkforceRow(Base):
    """Workforce-profile line entered in the stepper's 'Workforce profile' step — one row per
    job level. Rolls up (submission → entity → government) into the Human Capital Overview:
    headcount, job-level mix, Emiratization %, and annual cost. Child of the submission, so it
    versions and is reviewed exactly like drivers and mandate floors."""

    __tablename__ = "submission_workforce_rows"
    id: Mapped[int] = mapped_column(primary_key=True)
    submission_id: Mapped[int] = mapped_column(ForeignKey("department_submissions.id"))
    job_level: Mapped[str] = mapped_column(String(32))   # managers|professionals|associate_professionals|clerical_support
    # headcount = PEOPLE (bodies in post). fte = TIME (their full-time-equivalent).
    # These are different measures and only coincide when every person is full-time: six half-time
    # professionals are 6 headcount and 3.0 FTE. They were one number until this split — headcount
    # was literally built by rounding the department's FTE — so no part-time reality could be told.
    headcount: Mapped[int] = mapped_column(Integer, default=0)
    fte: Mapped[float] = mapped_column(Numeric(8, 2), default=0)
    emirati_count: Mapped[int] = mapped_column(Integer, default=0)
    annual_cost_aed: Mapped[float] = mapped_column(Numeric(16, 2), default=0)  # total annual cost for this level
    position: Mapped[int] = mapped_column(Integer, default=0)


# S5: roles counted as "structurally driven" — a common source of organisational creep in FTE sizing.
STRUCTURAL_SENIORITY = ("ceo", "dg", "executive_director", "director", "manager")


class SubmissionPositionRow(Base):
    """S3: the scrollable per-position breakdown under the total FTE — each role, its headcount and
    its grade band (e.g. general grades 1-10 / 1-15). `seniority` + `structural` also drive the
    structurally-driven-roles count (S5): managers, directors, executive directors, DGs, CEOs."""

    __tablename__ = "submission_position_rows"
    id: Mapped[int] = mapped_column(primary_key=True)
    submission_id: Mapped[int] = mapped_column(ForeignKey("department_submissions.id"))
    role: Mapped[str] = mapped_column(String(120))
    grade_band: Mapped[str] = mapped_column(String(32), default="")     # e.g. "Grades 1-5"
    job_level: Mapped[str] = mapped_column(String(32), default="")       # managers|professionals|...
    seniority: Mapped[str] = mapped_column(String(32), default="staff")  # see STRUCTURAL_SENIORITY | staff
    structural: Mapped[bool] = mapped_column(Boolean, default=False)
    headcount: Mapped[int] = mapped_column(Integer, default=0)
    position: Mapped[int] = mapped_column(Integer, default=0)


class ReminderReceipt(Base):
    """S19: per-recipient reminder tracking. A reminder is sent to the entity's champion and to the
    people who fill in the forms; `read_at` records whether it was opened."""

    __tablename__ = "reminder_receipts"
    id: Mapped[int] = mapped_column(primary_key=True)
    cycle_id: Mapped[int] = mapped_column(ForeignKey("collection_cycles.id"))
    entity_id: Mapped[int] = mapped_column(ForeignKey("entities.id"))
    recipient_name: Mapped[str] = mapped_column(String(120))
    recipient_role: Mapped[str] = mapped_column(String(24), default="contributor")  # champion|contributor
    milestone: Mapped[int | None] = mapped_column(Integer, nullable=True)  # days before deadline
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


# Capacity that is NOT the department's own filled establishment.
# secondment_out lends people away; the rest bring capacity in. `counts_in_supply` is the entity's
# declaration of whether the capacity is really available to plan against.
ADJUSTMENT_KINDS = ("secondment_in", "secondment_out", "contractor", "temporary", "outsourced")
# Only secondment_out subtracts. Stored FTE is always POSITIVE — the sign is a property of the kind,
# not of the number, so "2.0 FTE seconded out" can never be entered as a confusing -2.0.
ADJUSTMENT_SIGN = {k: (-1 if k == "secondment_out" else 1) for k in ADJUSTMENT_KINDS}
ADJUSTMENT_LABEL = {
    "secondment_in": "Seconded in",
    "secondment_out": "Seconded out",
    "contractor": "Contractors",
    "temporary": "Temporary resources",
    "outsourced": "Outsourced capacity",
}


class WorkforceAdjustment(Base, TimestampMixin):
    """A time-bounded change to a department's available capacity — a secondment, contractor,
    temporary resource or outsourced arrangement.

    This table exists because "Two staff seconded to the digital programme until March" was a
    free-text note (seed_clean._NOTES). Prose is invisible to arithmetic: the department's supply
    read 2 FTE too high and nothing could tell. Structuring it means the loan has an amount, a
    window, both ends of the move, and an explicit say in whether it counts toward supply.
    """

    __tablename__ = "workforce_adjustments"
    id: Mapped[int] = mapped_column(primary_key=True)
    submission_id: Mapped[int] = mapped_column(ForeignKey("department_submissions.id"))
    kind: Mapped[str] = mapped_column(String(24))          # see ADJUSTMENT_KINDS
    label: Mapped[str] = mapped_column(String(160), default="")
    fte: Mapped[float] = mapped_column(Numeric(8, 2), default=0)      # always positive; kind carries the sign
    headcount: Mapped[int] = mapped_column(Integer, default=0)        # people involved, if known
    starts_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    ends_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    # Both ends of the move. Null for capacity that comes from outside government (a contractor has
    # no source department; an outsourced service has no receiving one).
    source_department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id"), nullable=True)
    receiving_department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id"), nullable=True)
    counts_in_supply: Mapped[bool] = mapped_column(Boolean, default=True)
    note: Mapped[str] = mapped_column(Text, default="")
    position: Mapped[int] = mapped_column(Integer, default=0)


# ═══════════════════════ Calculation provenance ═══════════════════════
# Every FTE on screen must be traceable back to its inputs, so the things that PRODUCE it —
# the formula, the rounding rule, the scenario factors, the engine constants — are DB rows with an
# owner, a source and an effective date. A constant living in a Python module can't be versioned,
# attributed or shown to an auditor; a row can. The engine reads these at call time.
class CalcMethod(Base, TimestampMixin):
    """The formula for one workload family — the auditable definition behind every Required FTE.

    `expression` is evaluated by services/formula.py over the driver's volume + params, so the
    formula a user is shown in "View calculation" IS the formula that ran. Changing a method means
    inserting a new version, never editing code.
    """

    __tablename__ = "calc_methods"
    id: Mapped[int] = mapped_column(primary_key=True)
    family: Mapped[str] = mapped_column(String(16))         # demand|ratio|coverage|project|mandate
    version: Mapped[str] = mapped_column(String(16), default="1.0")
    label: Mapped[str] = mapped_column(String(80))
    # Safe arithmetic over `volume` + the driver's params, e.g.
    #   "volume * (minutes_per_unit / 60) / productive_hours * quality_allowance"
    expression: Mapped[str] = mapped_column(Text)
    rounding: Mapped[str] = mapped_column(String(16), default="none")   # ceil|floor|round_half_up|none
    rounding_note: Mapped[str] = mapped_column(String(200), default="")
    # [{key,label,unit,default}] — drives both the trace's parameter table and the stepper's inputs.
    param_specs: Mapped[list] = mapped_column(JSONB, default=list)
    description: Mapped[str] = mapped_column(String(300), default="")
    source: Mapped[str] = mapped_column(String(200), default="")        # methodology doc + clause
    effective_from: Mapped[date | None] = mapped_column(Date, nullable=True)
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    owner: Mapped[User | None] = relationship("User", foreign_keys=[owner_id])


class CalcMeasure(Base, TimestampMixin):
    """A period a Required-FTE can be stated for.

    A driver carries two volumes — this year's actual and next year's forecast — so "Required FTE"
    is ambiguous until you say WHICH volume produced it. That ambiguity is dangerous: the headline
    was always the current-volume figure, while the forecast the entity typed silently did nothing
    to it. Measures make the period explicit and selectable instead of implied.

    `volume_field` names the SubmissionDriver column the measure reads. A derived measure (planning
    change) reads none and is computed from `expression` over the other measures' results.
    """

    __tablename__ = "calc_measures"
    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(24))            # current | forecast | planning_change
    label: Mapped[str] = mapped_column(String(80))
    short_label: Mapped[str] = mapped_column(String(40), default="")
    volume_field: Mapped[str] = mapped_column(String(24), default="")   # "volume" | "forecast" | ""
    expression: Mapped[str] = mapped_column(String(120), default="")    # derived: "forecast - current"
    description: Mapped[str] = mapped_column(String(300), default="")
    period_note: Mapped[str] = mapped_column(String(160), default="")   # what period it represents
    source: Mapped[str] = mapped_column(String(200), default="")
    position: Mapped[int] = mapped_column(Integer, default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class CalcScenario(Base, TimestampMixin):
    """A re-pricing scenario. `factors` = {family: multiplier}; families absent never scale."""

    __tablename__ = "calc_scenarios"
    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(24))            # base|demand|prod
    label: Mapped[str] = mapped_column(String(60))
    factors: Mapped[dict] = mapped_column(JSONB, default=dict)
    note: Mapped[str] = mapped_column(String(240), default="")
    position: Mapped[int] = mapped_column(Integer, default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class CalcParameter(Base, TimestampMixin):
    """A single engine constant (attrition rate, projection horizon, variance threshold, final
    rounding rule…). Every one carries the source and owner that make it defensible."""

    __tablename__ = "calc_parameters"
    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(48), unique=True)
    label: Mapped[str] = mapped_column(String(120))
    value: Mapped[str] = mapped_column(String(80))          # stringly-typed; cast via value_type
    value_type: Mapped[str] = mapped_column(String(12), default="float")  # float|int|str
    unit: Mapped[str] = mapped_column(String(24), default="")
    description: Mapped[str] = mapped_column(String(300), default="")
    source: Mapped[str] = mapped_column(String(200), default="")
    effective_from: Mapped[date | None] = mapped_column(Date, nullable=True)
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    owner: Mapped[User | None] = relationship("User", foreign_keys=[owner_id])


class CalcOverride(Base):
    """A human overriding a calculated value. The "any overrides" + "who changed it" half of the
    trace: keeps the machine's answer next to the human's, with a reason and a name against it."""

    __tablename__ = "calc_overrides"
    id: Mapped[int] = mapped_column(primary_key=True)
    scope: Mapped[str] = mapped_column(String(16))          # driver|submission
    ref_id: Mapped[int] = mapped_column(Integer)            # driver id / submission id
    field: Mapped[str] = mapped_column(String(24), default="fte")
    calculated_value: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    override_value: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    reason: Mapped[str] = mapped_column(Text, default="")
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    actor_name: Mapped[str] = mapped_column(String(120), default="")
    actor_role: Mapped[str] = mapped_column(String(32), default="")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    actor: Mapped[User | None] = relationship("User", foreign_keys=[actor_id])


# ═══════════════════════ Executive analytics dashboards ═══════════════════════
# The demographic distributions behind the Human Capital Overview donuts, and the illustrative
# labour-market reference data behind the Demand/Supply analysis tabs. See services/analytics.py.

# One row per (submission, dimension, bucket). Child of the submission — so it VERSIONS and is
# reviewed exactly like the workforce rows, drivers and adjustments. Rolls up submission → entity →
# government by summing headcount per (dimension, bucket). Kept as its own normalized table rather
# than columns on SubmissionWorkforceRow because these are per-department distributions along several
# independent axes with a variable number of buckets — columns would explode the row and couldn't
# carry, say, five nationality groups. Captured per department (not per job level): the donuts are
# entity/government aggregates, so a department-level split keeps the stepper light and still sums.
WORKFORCE_BAND_DIMENSIONS = ("gender", "age_band", "grade_band", "region", "nationality", "tenure")


class SubmissionWorkforceBand(Base):
    __tablename__ = "submission_workforce_bands"
    id: Mapped[int] = mapped_column(primary_key=True)
    submission_id: Mapped[int] = mapped_column(ForeignKey("department_submissions.id"))
    dimension: Mapped[str] = mapped_column(String(16))    # see WORKFORCE_BAND_DIMENSIONS
    bucket: Mapped[str] = mapped_column(String(32))        # stable key, e.g. "female", "under_30"
    label: Mapped[str] = mapped_column(String(80), default="")
    # PEOPLE in this bucket. For each dimension, Σ bucket headcount == the submission's filled
    # headcount (Σ workforce-row headcount) — an invariant asserted in checks.py, so a distribution
    # can never quietly disagree with the workforce total it partitions.
    headcount: Mapped[int] = mapped_column(Integer, default=0)
    position: Mapped[int] = mapped_column(Integer, default=0)


class MarketReference(Base):
    """Illustrative labour-market / education reference data the executive dashboards show that the
    platform does NOT collect — skill trends, hiring companies, graduate mix, universities, global
    hotspots. It lives in the DB (seeded, owned, versionable) so it honours the everything-from-DB
    rule, and every panel built on it is labelled "Illustrative reference" in the UI. Deliberately in
    its OWN table, never rolled up from entity submissions, so it can never be mistaken for collected
    data — the hybrid boundary is a table boundary."""

    __tablename__ = "market_reference"
    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(24))          # skill_growing | company_hiring | university | …
    bucket: Mapped[str] = mapped_column(String(48), default="")
    label: Mapped[str] = mapped_column(String(120))
    value_numeric: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    value_text: Mapped[str | None] = mapped_column(String(120), nullable=True)
    pct_change: Mapped[float | None] = mapped_column(Numeric(6, 1), nullable=True)  # YoY / ranking move
    rank: Mapped[int] = mapped_column(Integer, default=0)
    scope: Mapped[str] = mapped_column(String(16), default="")   # e.g. local|global for universities
    meta: Mapped[dict] = mapped_column(JSONB, default=dict)

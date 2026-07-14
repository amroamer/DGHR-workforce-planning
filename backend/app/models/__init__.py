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

    reviewer: Mapped[User | None] = relationship("User", foreign_keys=[reviewer_id])


# ─────────────────────────── Cycle & Packages ───────────────────────────
class CollectionCycle(Base, TimestampMixin):
    __tablename__ = "collection_cycles"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    starts_on: Mapped[date] = mapped_column(Date)
    ends_on: Mapped[date] = mapped_column(Date)
    deadline: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(16), default="active")  # active|published|closed
    version_label: Mapped[str] = mapped_column(String(16), default="v2.1")
    late_policy: Mapped[str] = mapped_column(String(64), default="Allow with approval")
    reviewer_rule: Mapped[str] = mapped_column(String(64), default="By Section Type")
    reminders_label: Mapped[str] = mapped_column(String(64), default="7, 3, 1 days before due date")
    approval_workflow_label: Mapped[str] = mapped_column(
        String(64), default="Reviewer → Approver → DGHR"
    )


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


# ─────────────────────────── App-level singletons ───────────────────────────
class AppState(Base):
    """Single-row helper for global 'last updated' + trend series."""

    __tablename__ = "app_state"
    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    last_updated: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    trend_points: Mapped[list] = mapped_column(JSONB, default=list)  # [{label, value}]

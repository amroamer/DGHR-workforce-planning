"""The engine's calculation configuration, loaded from the DB.

Formulas, rounding rules, scenario factors and engine constants used to be module-level literals in
sizing.py. They are rows now, because a number that will influence a government workforce decision
has to be answerable to "who set this, when, and on what authority?" — and a Python constant cannot
answer that. This module is the single door the engine reads them through.

Cached on `Session.info` (SQLAlchemy's per-session scratch dict): a request loads the config once
instead of re-querying inside the per-department sizing loop, and the next request picks up any
admin edit without a restart or a stale global.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any

from sqlalchemy.orm import Session

from app import models as m

_CACHE_KEY = "calc_config"


@dataclass(frozen=True)
class Method:
    """One family's formula, exactly as stored."""

    id: int
    family: str
    version: str
    label: str
    expression: str
    rounding: str
    rounding_note: str
    param_specs: list
    description: str
    source: str
    effective_from: date | None
    owner_name: str

    @property
    def ref(self) -> str:
        """How the trace cites this method — "demand v1.0"."""
        return f"{self.family} v{self.version}"


@dataclass(frozen=True)
class Parameter:
    key: str
    label: str
    value: Any
    unit: str
    description: str
    source: str
    effective_from: date | None
    owner_name: str


@dataclass(frozen=True)
class Scenario:
    key: str
    label: str
    factors: dict
    note: str


@dataclass(frozen=True)
class Measure:
    """A period a Required-FTE can be stated for. `volume_field` is the driver column it reads;
    a derived measure reads none and is computed from `expression` over the others."""

    key: str
    label: str
    short_label: str
    volume_field: str
    expression: str
    description: str
    period_note: str
    source: str

    @property
    def derived(self) -> bool:
        return not self.volume_field


@dataclass(frozen=True)
class CalcConfig:
    methods: dict[str, Method] = field(default_factory=dict)
    scenarios: dict[str, Scenario] = field(default_factory=dict)
    params: dict[str, Parameter] = field(default_factory=dict)
    measures: tuple[Measure, ...] = ()

    # ── engine accessors ──
    def method(self, family: str) -> Method | None:
        return self.methods.get(family)

    def factor(self, scenario: str, family: str) -> float:
        s = self.scenarios.get(scenario) or self.scenarios.get("base")
        return float(s.factors.get(family, 1.0)) if s else 1.0

    def num(self, key: str, default: float = 0.0) -> float:
        p = self.params.get(key)
        try:
            return float(p.value) if p is not None else default
        except (TypeError, ValueError):
            return default

    def text(self, key: str, default: str = "") -> str:
        p = self.params.get(key)
        return str(p.value) if p is not None else default

    def measure(self, key: str) -> Measure | None:
        return next((x for x in self.measures if x.key == key), None)

    @property
    def sized_measures(self) -> tuple[Measure, ...]:
        """Measures the engine actually sizes (i.e. that read a volume column)."""
        return tuple(x for x in self.measures if not x.derived)

    @property
    def families(self) -> tuple[str, ...]:
        """Families in their configured order — replaces the old WORKLOAD_FAMILIES literal."""
        return tuple(sorted(self.methods, key=lambda f: (self.methods[f].id,)))


def _cast(row: m.CalcParameter) -> Any:
    if row.value_type == "int":
        try:
            return int(float(row.value))
        except (TypeError, ValueError):
            return 0
    if row.value_type == "float":
        try:
            return float(row.value)
        except (TypeError, ValueError):
            return 0.0
    return row.value


def load(db: Session) -> CalcConfig:
    methods = {
        r.family: Method(
            id=r.id, family=r.family, version=r.version, label=r.label, expression=r.expression,
            rounding=r.rounding, rounding_note=r.rounding_note, param_specs=list(r.param_specs or []),
            description=r.description, source=r.source, effective_from=r.effective_from,
            owner_name=r.owner.name if r.owner else "",
        )
        for r in db.query(m.CalcMethod).filter(m.CalcMethod.active.is_(True))
        .order_by(m.CalcMethod.id).all()
    }
    scenarios = {
        r.key: Scenario(key=r.key, label=r.label, factors=dict(r.factors or {}), note=r.note)
        for r in db.query(m.CalcScenario).filter(m.CalcScenario.active.is_(True))
        .order_by(m.CalcScenario.position, m.CalcScenario.id).all()
    }
    params = {
        r.key: Parameter(
            key=r.key, label=r.label, value=_cast(r), unit=r.unit, description=r.description,
            source=r.source, effective_from=r.effective_from,
            owner_name=r.owner.name if r.owner else "",
        )
        for r in db.query(m.CalcParameter).order_by(m.CalcParameter.key).all()
    }
    measures = tuple(
        Measure(key=r.key, label=r.label, short_label=r.short_label or r.label,
                volume_field=r.volume_field, expression=r.expression, description=r.description,
                period_note=r.period_note, source=r.source)
        for r in db.query(m.CalcMeasure).filter(m.CalcMeasure.active.is_(True))
        .order_by(m.CalcMeasure.position, m.CalcMeasure.id).all()
    )
    return CalcConfig(methods=methods, scenarios=scenarios, params=params, measures=measures)


def config(db: Session) -> CalcConfig:
    cfg = db.info.get(_CACHE_KEY)
    if cfg is None:
        cfg = load(db)
        db.info[_CACHE_KEY] = cfg
    return cfg


def invalidate(db: Session) -> None:
    """Call after writing any calc_* row so the same request sees its own edit."""
    db.info.pop(_CACHE_KEY, None)


def valid_scenario(db: Session, key: str | None) -> str:
    """Coerce a query-string scenario to one the engine can actually price."""
    cfg = config(db)
    return key if key in cfg.scenarios else ("base" if "base" in cfg.scenarios else
                                             (next(iter(cfg.scenarios), "base")))


def scenario_options(db: Session) -> list[dict]:
    """The picker's options — from the rows that define them, so a label can never describe a
    factor the engine didn't apply."""
    cfg = config(db)
    return [{"key": s.key, "label": s.label, "note": s.note, "factors": s.factors}
            for s in sorted(cfg.scenarios.values(), key=lambda s: (s.key != "base", s.label))]


# ─────────────────────────── overrides ───────────────────────────
def active_overrides(db: Session, scope: str, ref_ids: list[int]) -> dict[int, m.CalcOverride]:
    """Latest active override per ref — a value can be overridden more than once; only the newest
    one is in force, and the trace shows the rest as history."""
    if not ref_ids:
        return {}
    rows = (
        db.query(m.CalcOverride)
        .filter(m.CalcOverride.scope == scope, m.CalcOverride.ref_id.in_(ref_ids),
                m.CalcOverride.active.is_(True))
        .order_by(m.CalcOverride.id)
        .all()
    )
    return {r.ref_id: r for r in rows}  # later rows win

"""Seeds the calculation configuration: the formulas, rounding rules, scenarios and engine
constants the sizing engine reads at run time.

These used to be literals inside services/sizing.py. They live here as authoring input and in the
DB as the operative definition, which is the difference that matters: the running application never
reads a number from code, and every value on screen can be traced to a row that carries a source, an
effective date and an owner. Changing the method is a data change with an audit trail, not a deploy.

`source` cites the methodology clause each rule implements, that citation is what a trace shows an
auditor who asks "says who?".
"""

from __future__ import annotations

from datetime import date

from sqlalchemy.orm import Session

from app import models as m

METHOD_EFFECTIVE_FROM = date(2026, 7, 1)

# ─────────────────────────── per-family formulas ───────────────────────────
# `expression` is evaluated by services/formula.py over the driver's volume + params. The variable
# names MUST match the keys in SubmissionDriver.params (and the typeset default_drivers that seed
# them), because that mapping is what lets the trace put a source against every input.
METHODS: list[dict] = [
    dict(
        family="demand",
        label="Workload build-up",
        expression="volume * (minutes_per_unit / 60) / productive_hours * quality_allowance",
        rounding="ceil",
        rounding_note="A part-post cannot process a transaction, so a demand build-up rounds UP to "
                      "the next whole post.",
        description="Annual volume × handling time, divided by the productive hours one FTE offers "
                    "in a year, uplifted for quality and rework.",
        source="Workforce Sizing Methodology v1.0 §3.1, Demand-driven roles",
        param_specs=[
            {"key": "minutes_per_unit", "label": "Handling time per unit", "unit": "minutes", "default": 20},
            {"key": "productive_hours", "label": "Productive hours per FTE per year", "unit": "hours", "default": 1600},
            {"key": "quality_allowance", "label": "Quality & rework allowance", "unit": "× multiplier", "default": 1.0},
        ],
    ),
    dict(
        family="ratio",
        label="Serving ratio",
        expression="volume / serving_ratio",
        rounding="none",
        rounding_note="Held unrounded; only the department total is rounded to whole posts.",
        description="Population served divided by how many each FTE can support.",
        source="Workforce Sizing Methodology v1.0 §3.2, Ratio-based support roles",
        param_specs=[
            {"key": "serving_ratio", "label": "Served per FTE", "unit": "per FTE", "default": 100},
        ],
    ),
    dict(
        family="coverage",
        label="Shift coverage",
        expression="volume * shifts * relief_factor",
        rounding="none",
        rounding_note="Held unrounded; only the department total is rounded to whole posts.",
        description="Posts to be covered × shifts per day × the relief factor that funds leave, "
                    "training and sickness.",
        source="Workforce Sizing Methodology v1.0 §3.3, Coverage & rostered posts",
        param_specs=[
            {"key": "shifts", "label": "Shifts per day", "unit": "shifts", "default": 1.0},
            {"key": "relief_factor", "label": "Relief factor", "unit": "× multiplier", "default": 1.0},
        ],
    ),
    dict(
        family="project",
        label="Project team build-up",
        expression="volume * team_size",
        rounding="none",
        rounding_note="Held unrounded; only the department total is rounded to whole posts.",
        description="Number of projects in the portfolio × the standard team size for that project "
                    "class.",
        source="Workforce Sizing Methodology v1.0 §3.4, Project & programme delivery",
        param_specs=[
            {"key": "team_size", "label": "FTE per project", "unit": "FTE", "default": 1.0},
        ],
    ),
    dict(
        family="mandate",
        label="Statutory positions",
        expression="volume",
        rounding="none",
        rounding_note="A statutory post count is already whole, it is a legal minimum, not an estimate.",
        description="Each unit is a post required by law; the count is the requirement.",
        source="Workforce Sizing Methodology v1.0 §3.5, Statutory minimums",
        param_specs=[],
    ),
]

# ─────────────────────────── measures (which period a figure states) ───────────────────────────
# A driver holds two volumes, so "Required FTE" means nothing until you say which one produced it.
# These rows name the periods, and `volume_field` tells the engine which column to read, so adding
# a period is a data change, and no screen can show a figure without being able to say what it is.
MEASURES: list[dict] = [
    dict(
        key="current", label="Current required FTE", short_label="Current",
        volume_field="volume", position=0,
        description="What this year's actual workload requires, sized from the 12-month volume the "
                    "entity reported.",
        period_note="This cycle, from reported 12-month volumes.",
        source="Workforce Sizing Methodology v1.0 §4.1, Department total",
    ),
    dict(
        key="forecast", label="Forecast required FTE", short_label="Forecast",
        volume_field="forecast", position=1,
        description="What next cycle's workload will require, sized from the entity's own 12-month "
                    "forecast. Not an approved establishment, a sizing of a stated expectation.",
        period_note="Next cycle, from the entity's own forecast volumes.",
        source="Workforce Sizing Methodology v1.0 §6.1, Growth assumptions",
    ),
    dict(
        key="planning_change", label="Planning change", short_label="Change",
        volume_field="", expression="forecast - current", position=2,
        description="The workforce movement implied between the two periods. A planning signal, not "
                    "an approval to recruit.",
        period_note="Difference between this cycle and next.",
        source="Workforce Sizing Methodology v1.0 §6, Planning horizon",
    ),
]

# ─────────────────────────── scenarios ───────────────────────────
# Only demand & project scale with volume. Coverage, ratio and statutory floors do not, a 24/7 desk
# still needs its shifts covered and a law still names its minimum, whatever the volume does.
SCENARIOS: list[dict] = [
    dict(key="base", label="Baseline", factors={}, position=0,
         note="The position as submitted, with no re-pricing applied."),
    dict(key="demand", label="Demand +15%", factors={"demand": 1.15, "project": 1.15}, position=1,
         note="Tests a 15% rise in transactional and project volumes. Coverage, ratio and statutory "
              "floors are unaffected, they do not scale with volume."),
    dict(key="prod", label="Productivity +8%", factors={"demand": 0.92}, position=2,
         note="Tests an 8% improvement in handling time on demand-driven work only."),
]

# ─────────────────────────── engine constants ───────────────────────────
PARAMETERS: list[dict] = [
    dict(key="sizing.final_rounding", label="Department total rounding", value="round_half_up",
         value_type="str", unit="",
         description="How a department's Required FTE is rounded to whole posts once the workload "
                     "build-up and any statutory floor have been compared.",
         source="Workforce Sizing Methodology v1.0 §4.2, Rounding"),
    dict(key="sizing.variance_flag_threshold", label="Sizing variance review threshold", value="0.15",
         value_type="float", unit="proportion",
         description="A department whose gap exceeds this share of its Required FTE is flagged for "
                     "analyst review.",
         source="Workforce Sizing Methodology v1.0 §5.1, Review triggers"),
    dict(key="projection.attrition_rate", label="Annual attrition (unbackfilled)", value="0.08",
         value_type="float", unit="per year",
         description="The rate at which today's workforce erodes each year if leavers are not "
                     "replaced. Applied to supply in the multi-year projection.",
         source="DGHR workforce statistics FY2022–FY2026, government-wide average"),
    dict(key="projection.horizon_years", label="Projection horizon", value="5",
         value_type="int", unit="years",
         description="How many years forward the demand–supply projection runs.",
         source="Workforce Sizing Methodology v1.0 §6, Planning horizon"),
    # Clarification ageing. Rows, not literals, for the same reason as every other constant here:
    # a threshold buried in Python can't be versioned, attributed, or shown to the people it judges.
    dict(key="clarification.sla_days", label="Clarification response SLA", value="5",
         value_type="float", unit="days",
         description="How long an entity has to answer a clarification before it counts as overdue. "
                     "Ageing is derived from the question's own timestamp, never stored.",
         source="Collection cycle governance, response standard"),
    dict(key="clarification.escalate_after_days", label="Clarification escalation threshold", value="10",
         value_type="float", unit="days",
         description="An unanswered clarification older than this is escalated for senior review "
                     "rather than left to age quietly in a queue.",
         source="Collection cycle governance, escalation rule"),
    dict(key="projection.default_growth", label="Default demand growth", value="1.0",
         value_type="float", unit="× per year",
         description="Growth applied when a department gives no 12-month forecast for a driver, "
                     "flat, rather than an invented trend.",
         source="Workforce Sizing Methodology v1.0 §6.1, Growth assumptions"),
    # The Emiratization target the Human Capital Overview gauge measures actual against. A row, not a
    # literal, so the target it judges entities by carries a source and an owner like everything else.
    dict(key="emiratization.target_pct", label="Emiratization target", value="40",
         value_type="float", unit="%",
         description="Government-wide Emiratization target the Human Capital Overview gauge measures "
                     "the actual rate against.",
         source="Emiratisation policy target, DGHR workforce strategy"),
]


def seed_calc_config(db: Session, owner: m.User | None = None) -> dict:
    """Idempotent: inserts anything missing, leaves existing rows (and any admin edits) alone."""
    owner_id = owner.id if owner else None

    have_methods = {r.family for r in db.query(m.CalcMethod).all()}
    for spec in METHODS:
        if spec["family"] in have_methods:
            continue
        db.add(m.CalcMethod(version="1.0", active=True, owner_id=owner_id,
                            effective_from=METHOD_EFFECTIVE_FROM, **spec))

    have_measures = {r.key for r in db.query(m.CalcMeasure).all()}
    for spec in MEASURES:
        if spec["key"] not in have_measures:
            db.add(m.CalcMeasure(active=True, **spec))

    have_scen = {r.key for r in db.query(m.CalcScenario).all()}
    for spec in SCENARIOS:
        if spec["key"] not in have_scen:
            db.add(m.CalcScenario(active=True, **spec))

    have_params = {r.key for r in db.query(m.CalcParameter).all()}
    for spec in PARAMETERS:
        if spec["key"] not in have_params:
            db.add(m.CalcParameter(owner_id=owner_id, effective_from=METHOD_EFFECTIVE_FROM, **spec))

    db.commit()
    return {"methods": len(METHODS), "measures": len(MEASURES),
            "scenarios": len(SCENARIOS), "parameters": len(PARAMETERS)}

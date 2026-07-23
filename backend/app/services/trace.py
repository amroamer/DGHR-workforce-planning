"""Calculation traceability — the "View calculation" payload behind every FTE on screen.

The engine explains its formulas; this module explains a NUMBER. For any single figure it answers,
from real rows rather than prose:

  · input value and where it came from      · the formula, symbolic AND substituted with the values
  · every parameter and whether it was      · how it was rounded, showing the raw value first
    stated, inherited or defaulted          · the typeset version the department was sized against
  · when it was calculated, and when the    · any override, with the original beside it
    inputs behind it last changed           · who entered or changed the value

It is computed on demand from the same functions the screens call, so a trace can never describe a
calculation different from the one that produced the number it is attached to. Nothing here is
stored or cached: a stored trace is a trace that can go stale and quietly start lying.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app import models as m
from app.services import calc_config, sizing
from app.services.calc_config import CalcConfig
from app.services.formula import FormulaError, ROUNDING_LABEL, evaluate, fmt_num, render

# What "source" means for an input, in the entity's own words rather than a table name.
SRC_SUBMISSION = "Entity submission (planning stepper)"
SRC_TYPESET = "Typeset standard"
SRC_METHOD = "Method default"
SRC_ESTABLISHMENT = "Department establishment record"


def _iso(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _person(name: str | None, user: m.User | None = None) -> dict | None:
    """Attribution the UI can render without guessing. `None` reads as "not recorded" on screen —
    which is the honest answer for data that predates attribution, and better than a plausible name."""
    label = (name or "").strip() or (user.name if user else "")
    if not label:
        return None
    return {"name": label, "role": user.role if user else "", "initials": user.initials if user else ""}


# ─────────────────────────── typeset ───────────────────────────
def _typeset_block(ts: m.Typeset | None) -> dict | None:
    """Which revision of the department archetype the sizing stands on. A Required FTE is only
    reproducible if you know the classification AND its version — the standards live there."""
    if ts is None:
        return None
    return {
        "key": ts.key,
        "name": ts.name,
        "version": ts.version,
        "primary_family": ts.primary_family,
        "effective_from": str(ts.effective_from) if ts.effective_from else None,
        "label": f"{ts.name} v{ts.version}",
    }


def _typeset_default_for(ts: m.Typeset | None, driver_name: str) -> dict:
    """The typeset's standard entry for this driver, so a parameter can be reported as unchanged
    from the standard vs. deliberately adjusted by the entity."""
    for d in (ts.default_drivers or []) if ts else []:
        if d.get("name") == driver_name:
            return d.get("params") or {}
    return {}


# ─────────────────────────── measure (which period) ───────────────────────────
def _measure_block(cfg: CalcConfig, key: str) -> dict | None:
    """Names the period a headline figure states.

    Every screen showing a Required FTE has to be able to answer "required WHEN?". The engine sizes
    from the reported 12-month volume, so the answer is "this cycle" — but that was implicit, which
    left the forecast the entity typed looking like it did nothing.
    """
    ms = cfg.measure(key)
    if ms is None:
        return None
    return {"key": ms.key, "label": ms.label, "short_label": ms.short_label,
            "period_note": ms.period_note, "description": ms.description, "source": ms.source,
            "volume_field": ms.volume_field}


# ─────────────────────────── method + parameters ───────────────────────────
def _method_block(method, substituted: str) -> dict:
    return {
        "family": method.family,
        "label": method.label,
        "version": method.version,
        "ref": method.ref,
        "expression": render(method.expression),          # "volume × team size"
        "expression_raw": method.expression,              # exactly what was evaluated
        "substituted": substituted,                       # "7 × 6"
        "description": method.description,
        "source": method.source,
        "effective_from": str(method.effective_from) if method.effective_from else None,
        "owner": method.owner_name,
        "rounding": method.rounding,
        "rounding_note": method.rounding_note,
    }


def _parameter_rows(method, driver: m.SubmissionDriver, ts: m.Typeset | None,
                    resolved: dict) -> list[dict]:
    """Every parameter the formula READ, with its origin made explicit.

    Origin is the honest part: a standard the entity accepted, a value it deliberately changed, and
    a default nobody ever set are three different things, and only the first two are evidence.
    """
    own = driver.params or {}
    ts_defaults = _typeset_default_for(ts, driver.name)
    rows = []
    for spec in method.param_specs or []:
        key = spec["key"]
        if key not in resolved:
            continue
        value = resolved[key]
        std = ts_defaults.get(key)
        if key not in own:
            origin, source = "method_default", f"{SRC_METHOD} ({method.label} v{method.version})"
        elif std is not None and float(std) == float(value):
            origin, source = "typeset_standard", (f"{SRC_TYPESET} ({ts.name} v{ts.version})"
                                                  if ts else SRC_TYPESET)
        elif std is not None:
            origin, source = "entity_adjusted", (f"Adjusted by the entity from the "
                                                 f"{SRC_TYPESET.lower()} of {fmt_num(float(std))}")
        else:
            origin, source = "entity_stated", SRC_SUBMISSION
        rows.append({
            "key": key,
            "label": spec.get("label", key.replace("_", " ")),
            "value": value,
            "display": fmt_num(value),
            "unit": spec.get("unit", ""),
            "origin": origin,
            "source": source,
            "standard_value": float(std) if std is not None else None,
        })
    return rows


# ─────────────────────────── overrides ───────────────────────────
def _override_rows(db: Session, scope: str, ref_id: int) -> list[dict]:
    rows = (
        db.query(m.CalcOverride)
        .filter(m.CalcOverride.scope == scope, m.CalcOverride.ref_id == ref_id)
        .order_by(m.CalcOverride.id.desc())
        .all()
    )
    return [{
        "id": r.id,
        "field": r.field,
        "calculated_value": float(r.calculated_value),
        "override_value": float(r.override_value),
        "delta": float(r.override_value) - float(r.calculated_value),
        "reason": r.reason,
        "active": bool(r.active),
        "actor": _person(r.actor_name, r.actor),
        "actor_role": r.actor_role,
        "created_at": _iso(r.created_at),
    } for r in rows]


# ─────────────────────────── driver trace ───────────────────────────
def driver_trace(db: Session, driver_id: int, scenario: str = "base") -> dict | None:
    """The atomic case, and the one the whole feature exists for:
    "Mega projects: 7 projects × 6 FTE per project = 42 FTE"."""
    d = db.get(m.SubmissionDriver, driver_id)
    if d is None:
        return None
    cfg: CalcConfig = calc_config.config(db)
    sub = db.get(m.DepartmentSubmission, d.submission_id)
    dept = db.get(m.Department, sub.department_id) if sub else None
    ent = db.get(m.Entity, dept.entity_id) if dept else None
    ts = db.get(m.Typeset, dept.typeset_id) if dept and dept.typeset_id else None

    method = cfg.method(d.family)
    scen = cfg.scenarios.get(scenario) or cfg.scenarios.get("base")
    factor = cfg.factor(scenario, d.family)
    volume = float(d.volume or 0)

    if method is None:
        # No method row = the family cannot be priced. Say so; never show a number.
        return {
            "kind": "driver", "ref_id": d.id, "title": d.name,
            "unavailable": f"No active calculation method is configured for the '{d.family}' family.",
            "calculated_at": _now(),
        }

    resolved = sizing.resolved_params(method, d.params)
    vars_ = {**resolved, "volume": volume}
    raw = sizing.driver_fte_raw(cfg, d.family, volume, d.params)
    scaled = raw * factor
    effective = sizing._effective(cfg, d.family, scaled)

    # ── which period is this? ──
    # The headline sizes from `volume`, so it is the CURRENT figure — but nothing on screen said so,
    # and the forecast the entity typed appeared to do nothing. Every period is shown, each with its
    # own substituted calculation, so the reader can see exactly which volume produced which number.
    measure_rows = []
    results: dict[str, float] = {}
    for ms in cfg.sized_measures:
        vol_m = sizing._driver_volume(d, ms)
        raw_m = sizing.driver_fte_raw(cfg, d.family, vol_m, d.params) * factor
        eff_m = sizing._effective(cfg, d.family, raw_m)
        results[ms.key] = eff_m
        measure_rows.append({
            "key": ms.key, "label": ms.label, "short_label": ms.short_label,
            "value": round(eff_m, 2), "display": fmt_num(round(eff_m, 2)),
            "calculation": f"{render(method.expression, {**resolved, 'volume': vol_m})} = {fmt_num(round(raw_m, 4))}",
            "volume": vol_m, "volume_field": ms.volume_field,
            "period_note": ms.period_note, "description": ms.description, "source": ms.source,
            "derived": False,
            # A forecast of 0 means "not stated" — the measure falls back to the reported volume, and
            # says so rather than letting a flat figure read as a confident forecast of no change.
            "assumed_flat": ms.volume_field != "volume" and not (float(getattr(d, ms.volume_field, 0) or 0) > 0),
        })
    for ms in cfg.measures:
        if not ms.derived:
            continue
        try:
            val = evaluate(ms.expression, results)
        except FormulaError:
            continue
        measure_rows.append({
            "key": ms.key, "label": ms.label, "short_label": ms.short_label,
            "value": round(val, 2), "display": f"{'+' if val > 0 else ''}{fmt_num(round(val, 2))}",
            "calculation": f"{render(ms.expression, results)} = {fmt_num(round(val, 2))}",
            "period_note": ms.period_note, "description": ms.description, "source": ms.source,
            "derived": True, "assumed_flat": False,
        })

    overrides = _override_rows(db, "driver", d.id)
    active_ov = next((o for o in overrides if o["active"]), None)
    result = active_ov["override_value"] if active_ov else effective

    # ── the steps, in the order they actually happened ──
    steps: list[dict] = [
        {"label": "Formula", "detail": render(method.expression),
         "note": method.description},
        {"label": "Substituted", "detail": f"{render(method.expression, vars_)} = {fmt_num(raw)}",
         "note": "The entity's own values, in the formula above."},
    ]
    if factor != 1.0:
        steps.append({"label": f"Scenario: {scen.label if scen else scenario}",
                      "detail": f"{fmt_num(raw)} × {fmt_num(factor)} = {fmt_num(scaled)}",
                      "note": scen.note if scen else ""})
    if effective != scaled:
        steps.append({"label": "Rounding", "detail": f"{fmt_num(scaled)} → {fmt_num(effective)}",
                      "note": method.rounding_note})
    if active_ov:
        steps.append({"label": "Manual override",
                      "detail": f"{fmt_num(effective)} → {fmt_num(active_ov['override_value'])} FTE",
                      "note": active_ov["reason"] or "No reason recorded."})

    fte_override = (d.params or {}).get("fte_override")
    if fte_override is not None:
        steps.insert(0, {"label": "Direct FTE entry",
                         "detail": f"{fmt_num(float(fte_override))} FTE entered directly",
                         "note": "The formula was bypassed for this driver, the entity stated the "
                                 "FTE rather than the workload behind it."})

    return {
        "kind": "driver",
        "ref_id": d.id,
        "title": d.name,
        "context": {
            "department": dept.name if dept else "",
            "department_id": dept.id if dept else None,
            "entity": ent.name if ent else "",
            "entity_id": ent.id if ent else None,
            "submission_id": sub.id if sub else None,
            "submission_status": sub.status if sub else "",
        },
        "result": {"value": round(result, 2), "display": fmt_num(round(result, 2)), "unit": "FTE"},
        # The headline states the CURRENT period; `measures` shows every period side by side.
        "measure": _measure_block(cfg, "current"),
        "measures": measure_rows,
        "method": _method_block(method, render(method.expression, vars_)),
        "typeset": _typeset_block(ts),
        "inputs": [{
            "label": d.name,
            "value": volume,
            "display": fmt_num(volume),
            "unit": d.unit,
            "role": "volume",
            "source": d.source or SRC_SUBMISSION,
            "source_ref": {"kind": "submission", "id": sub.id if sub else None},
            "entered_by": _person(d.entered_by_name, d.entered_by),
            "entered_at": _iso(d.entered_at),
            "forecast": float(d.forecast or 0),
        }],
        "parameters": _parameter_rows(method, d, ts, resolved),
        "steps": steps,
        "rounding": {
            "rule": method.rounding,
            "label": ROUNDING_LABEL.get(method.rounding, method.rounding),
            "note": method.rounding_note,
            "raw": round(scaled, 4),
            "raw_display": fmt_num(round(scaled, 4)),
            "rounded": effective,
        },
        "scenario": {"key": scenario, "label": scen.label if scen else scenario,
                     "factor": factor, "note": scen.note if scen else ""},
        "overrides": overrides,
        "provenance": {
            "entered_by": _person(d.entered_by_name, d.entered_by),
            "entered_at": _iso(d.entered_at),
            "submitted_by": _person(sub.submitted_by_name, sub.submitted_by) if sub else None,
            "submitted_at": _iso(sub.submitted_at) if sub else None,
            "decided_by": _person(sub.decided_by_name) if sub else None,
            "decided_at": _iso(sub.decided_at) if sub else None,
        },
        "calculated_at": _now(),
        "inputs_last_changed_at": _iso(d.entered_at),
    }


# ─────────────────────────── submission (department Required FTE) ───────────────────────────
def submission_trace(db: Session, submission_id: int, scenario: str = "base") -> dict | None:
    """How a department's Required FTE was reached: every driver's contribution, the statutory floor
    it is compared against, and the rounding to whole posts."""
    sub = db.get(m.DepartmentSubmission, submission_id)
    if sub is None:
        return None
    cfg = calc_config.config(db)
    sz = sizing.submission_sizing(db, sub, scenario)
    dept = db.get(m.Department, sub.department_id)
    ent = db.get(m.Entity, dept.entity_id) if dept else None
    ts = db.get(m.Typeset, dept.typeset_id) if dept and dept.typeset_id else None
    scen = cfg.scenarios.get(scenario) or cfg.scenarios.get("base")

    build_up = float(sz["build_up_raw"])
    floor_total = float(sz["floor_total"])
    required = sz["required_fte"]
    rule = sz["rounding_rule"]
    mandates = sz["mandates"]

    # Each driver is an INPUT here, and each is itself traceable — that chain is the point:
    # a government total decomposes to an entity, to a department, to one number a person typed.
    inputs = [{
        "label": r["name"],
        "value": r["fte_raw"],
        "display": f"{fmt_num(r['fte_raw'])} FTE",
        "unit": "FTE",
        "role": "driver",
        "source": SRC_SUBMISSION,
        "source_ref": {"kind": "driver", "id": r["id"]},
        "family": r["family"],
        "traceable": True,
        "overridden": r.get("overridden", False),
    } for r in sz["drivers"]]

    # Unrounded contributions, so the line the user reads actually adds up to the total beside it.
    total_line = " + ".join(fmt_num(r["fte_raw"]) for r in sz["drivers"]) or "0"
    steps: list[dict] = [
        {"label": "Workload build-up",
         "detail": f"{total_line} = {fmt_num(round(build_up, 2))} FTE",
         "note": "Each driver sized on its own family formula, then summed."},
    ]
    if mandates:
        floor_line = " + ".join(f"{fmt_num(x['positions'])} ({x['role']})" for x in mandates)
        steps.append({"label": "Statutory floor", "detail": f"{floor_line} = {fmt_num(floor_total)} posts",
                      "note": "; ".join(x["legal_basis"] for x in mandates if x["legal_basis"])})
        steps.append({
            "label": "Higher of the two",
            "detail": f"max({fmt_num(round(build_up, 2))}, {fmt_num(floor_total)}) = "
                      f"{fmt_num(max(build_up, floor_total))}",
            "note": ("The statutory floor binds, the law requires more posts than the workload does."
                     if sz["floor_binds"] else
                     "The workload build-up exceeds the statutory minimum, so the floor does not bind."),
        })
    steps.append({"label": "Rounded to whole posts",
                  "detail": f"{fmt_num(round(max(build_up, floor_total), 2))} → {fmt_num(required)} FTE",
                  "note": ROUNDING_LABEL.get(rule, rule)})

    return {
        "kind": "submission",
        "ref_id": sub.id,
        "title": f"Required FTE: {dept.name if dept else ''}",
        "context": {
            "department": dept.name if dept else "",
            "department_id": dept.id if dept else None,
            "entity": ent.name if ent else "",
            "entity_id": ent.id if ent else None,
            "submission_id": sub.id,
            "submission_status": sub.status,
        },
        "result": {"value": required, "display": f"{fmt_num(required)} FTE", "unit": "FTE"},
        # This headline sizes from reported volumes — it is the CURRENT figure. `measures` carries
        # the other periods so the reader never has to infer which one they are looking at.
        "measure": _measure_block(cfg, "current"),
        "measures": [{
            **x,
            "display": (f"{'+' if x['value'] > 0 else ''}{fmt_num(x['value'])}" if x["derived"]
                        else f"{fmt_num(x['value'])} FTE"),
            "calculation": (f"{fmt_num(round(x['build_up'], 2))} → {fmt_num(x['value'])} FTE"
                            if x.get("build_up") is not None else ""),
        } for x in sz["measures"]],
        "forecast_stated": sz.get("forecast_stated", True),
        "method": {
            "label": "Department sizing",
            "version": "1.0",
            "ref": "sizing v1.0",
            "expression": "required = round(max(workload build-up, statutory floor))",
            "substituted": f"round(max({fmt_num(round(build_up, 2))}, {fmt_num(floor_total)})) "
                           f"= {fmt_num(required)}",
            "description": "A department needs the greater of what its workload implies and what the "
                           "law requires, never the sum of the two, and never less than the floor.",
            "source": "Workforce Sizing Methodology v1.0 §4.1: Department total",
            "rounding": rule,
            "rounding_note": ROUNDING_LABEL.get(rule, rule),
            "families": sorted({r["family"] for r in sz["drivers"]}),
        },
        "typeset": _typeset_block(ts),
        "inputs": inputs,
        "parameters": [{
            "key": "sizing.final_rounding",
            "label": cfg.params["sizing.final_rounding"].label if "sizing.final_rounding" in cfg.params
                     else "Department total rounding",
            "value": rule,
            "display": ROUNDING_LABEL.get(rule, rule),
            "unit": "",
            "origin": "parameter",
            "source": cfg.params["sizing.final_rounding"].source if "sizing.final_rounding" in cfg.params else "",
        }],
        "steps": steps,
        "rounding": {
            "rule": rule,
            "label": ROUNDING_LABEL.get(rule, rule),
            "note": "Applied once, at the department total, never per driver, which would compound "
                    "rounding error across the build-up.",
            "raw": round(max(build_up, floor_total), 4),
            "raw_display": fmt_num(round(max(build_up, floor_total), 4)),
            "rounded": required,
        },
        "scenario": {"key": scenario, "label": scen.label if scen else scenario,
                     "note": scen.note if scen else ""},
        "mandates": mandates,
        "flags": sz["flags"],
        "overrides": _override_rows(db, "submission", sub.id),
        "provenance": {
            "submitted_by": _person(sub.submitted_by_name, sub.submitted_by),
            "submitted_at": _iso(sub.submitted_at),
            "decided_by": _person(sub.decided_by_name),
            "decided_at": _iso(sub.decided_at),
        },
        "calculated_at": _now(),
    }


# ─────────────────────────── roll-ups ───────────────────────────
def entity_trace(db: Session, entity_id: int, scenario: str = "base") -> dict | None:
    """An entity total is a sum — but a sum is only honest if it says what it left out."""
    ent = db.get(m.Entity, entity_id)
    if ent is None:
        return None
    data = sizing.entity_sizing(db, entity_id, received_only=True, scenario=scenario)
    counted = [r for r in data["departments"] if r["required_fte"] is not None
               and r["status"] in sizing.RECEIVED]
    excluded = [r for r in data["departments"] if r not in counted]
    total = data["totals"]["required_fte"]

    return {
        "kind": "entity",
        "ref_id": ent.id,
        "title": f"Required FTE: {ent.name}",
        "context": {"entity": ent.name, "entity_id": ent.id},
        "result": {"value": total, "display": f"{fmt_num(total)} FTE", "unit": "FTE"},
        "method": {
            "label": "Entity roll-up",
            "ref": "rollup v1.0",
            "expression": "entity required = Σ department required (received submissions only)",
            "substituted": f"{' + '.join(fmt_num(r['required_fte']) for r in counted) or '0'} "
                           f"= {fmt_num(total)}",
            "description": "The sum of every department that has actually submitted. Departments "
                           "that have not submitted are excluded rather than estimated.",
            "source": "Workforce Sizing Methodology v1.0 §5: Roll-up",
        },
        "inputs": [{
            "label": r["name"], "value": r["required_fte"],
            "display": f"{fmt_num(r['required_fte'])} FTE", "unit": "FTE", "role": "department",
            "source": f"Submission: {r['status'].replace('_', ' ')}",
            "source_ref": {"kind": "submission", "id": r["submission_id"]},
            "traceable": r["submission_id"] is not None,
        } for r in counted],
        "excluded": [{"label": r["name"], "reason": r["status"].replace("_", " ")} for r in excluded],
        "steps": [
            {"label": "Departments counted",
             "detail": f"{len(counted)} of {len(data['departments'])}",
             "note": ("Every department has submitted." if not excluded else
                      f"{len(excluded)} department(s) excluded, no submission received, so this "
                      f"total is partial.")},
            {"label": "Sum", "detail": f"{fmt_num(total)} FTE",
             "note": "Each department is itself traceable to its drivers."},
        ],
        "scenario": {"key": scenario},
        "calculated_at": _now(),
        "partial": bool(excluded),
    }


def government_trace(db: Session, basis: str = "received", scenario: str = "base") -> dict:
    """The government total — the figure with the furthest to fall if it can't be defended, so its
    trace leads with what it stands on."""
    gov = sizing.government_sizing(db, basis=basis, scenario=scenario)
    cov = gov["coverage"]
    rows = [e for e in gov["entities"] if e["counted"] > 0]
    total = gov["totals"]["required_fte"]
    return {
        "kind": "government",
        "ref_id": 0,
        "title": "Required FTE: government-wide",
        "result": {"value": total, "display": f"{fmt_num(total)} FTE", "unit": "FTE"},
        "method": {
            "label": "Government position",
            "ref": f"basis: {cov['basis']}",
            "expression": "government required = Σ entity required (under the selected basis)",
            "substituted": f"Σ {len(rows)} entities = {fmt_num(total)}",
            "description": cov["statement"],
            "source": "Workforce Sizing Methodology v1.0 §5: Roll-up",
        },
        "inputs": [{
            "label": e["name"], "value": e["required_fte"],
            "display": f"{fmt_num(e['required_fte'])} FTE", "unit": "FTE", "role": "entity",
            "source": f"{e['counted']} of {e['dept_count']} departments counted",
            "source_ref": {"kind": "entity", "id": e["entity_id"]},
            "traceable": True,
            "estimated": e.get("estimated", False),
        } for e in rows],
        "steps": [
            {"label": "Basis", "detail": cov["label"], "note": cov["statement"]},
            {"label": "Coverage",
             "detail": f"{cov['departments_counted']} of {cov['departments_total']} departments",
             "note": cov.get("method", "")},
            {"label": "Sum", "detail": f"{fmt_num(total)} FTE",
             "note": "Each entity is itself traceable down to a single entered value."},
        ],
        "coverage": cov,
        "official": cov["official"],
        "scenario": {"key": scenario},
        "calculated_at": _now(),
        "partial": not cov["official"],
    }


TRACERS = {
    "driver": driver_trace,
    "submission": submission_trace,
    "entity": entity_trace,
}


def build(db: Session, kind: str, ref_id: int, scenario: str = "base", basis: str = "received"):
    if kind == "government":
        return government_trace(db, basis=basis, scenario=scenario)
    fn = TRACERS.get(kind)
    return fn(db, ref_id, scenario=scenario) if fn else None

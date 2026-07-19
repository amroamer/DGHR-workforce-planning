"""Planning seed — the 10 typesets (with standard params), and real Dubai government entities
with representative departments mapped to those typesets.

Idempotent: skips typesets/departments that already exist. Seeds STRUCTURE only (entities +
departments + current-FTE supply). It does NOT fabricate submissions or dashboard metrics — the
government-wide numbers only appear once departments actually submit through the app.

NOTE: entity names are the real, publicly-known Dubai government bodies; the department lists are
REPRESENTATIVE structures mapped to the 10 typesets, not scraped from an official live org chart.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app import models as m
from app.db import SessionLocal


# ─────────────────────────── entity brand logos ───────────────────────────
# Entity codes for which an official brand mark is held in frontend/public/logos. The file is named
# by the slugified code (see _logo_slug), so the frontend resolves the same asset by convention.
# Codes absent here have no asset → the UI renders a deterministic initials chip. Keep this set in
# step with the files under frontend/public/logos and with ENTITY_LOGO_CODES on the frontend.
LOGO_CODES = {"DEWA", "RTA", "DM", "DHA", "DP", "DC", "DXBC", "GDRFA", "DLD", "DET"}


def _logo_slug(code: str) -> str:
    """Slugify an entity code into its logo filename stem (must match the frontend's logoSlug)."""
    out = "".join(c.lower() if c.isalnum() else "-" for c in (code or "").strip())
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-")


def logo_url_for(code: str) -> str | None:
    """Canonical /logos path for an entity code, or None when no official asset is held."""
    return f"/logos/{_logo_slug(code)}.png" if code in LOGO_CODES else None

# ─────────────────────────── the 10 typesets (with default drivers + standards) ───────────────────────────
TYPESETS = [
    ("policy_strategy", "Policy & strategy", "project", [
        {"name": "Strategies in development", "unit": "strategies", "family": "project", "params": {"team_size": 2.0}},
        {"name": "Active policy files", "unit": "files", "family": "demand", "params": {"minutes_per_unit": 4800, "productive_hours": 1600, "quality_allowance": 1.0}},
        {"name": "Councils & committees served", "unit": "committees", "family": "ratio", "params": {"serving_ratio": 2.4}},
    ]),
    ("project_delivery", "Project delivery", "project", [
        {"name": "Mega projects", "unit": "projects", "family": "project", "params": {"team_size": 6.0}},
        {"name": "Major projects", "unit": "projects", "family": "project", "params": {"team_size": 3.0}},
        {"name": "Minor projects & studies", "unit": "projects", "family": "project", "params": {"team_size": 0.8}},
    ]),
    ("ops_maintenance", "Operations & maintenance", "demand", [
        {"name": "Asset units under maintenance", "unit": "asset units", "family": "demand", "params": {"minutes_per_unit": 24, "productive_hours": 1600, "quality_allowance": 1.0}},
        {"name": "Network length served", "unit": "km", "family": "coverage", "params": {"shifts": 1.0, "relief_factor": 0.009}},
        {"name": "Planned programmes", "unit": "programmes", "family": "project", "params": {"team_size": 0.4}},
    ]),
    ("control_coverage", "24/7 control & coverage", "coverage", [
        {"name": "Control desk posts", "unit": "posts", "family": "coverage", "params": {"shifts": 3.0, "relief_factor": 1.55}},
        {"name": "Shift supervision", "unit": "posts", "family": "coverage", "params": {"shifts": 1.0, "relief_factor": 1.0}},
    ]),
    ("frontline_service", "Front-line customer service", "demand", [
        {"name": "Service transactions", "unit": "transactions/yr", "family": "demand", "params": {"minutes_per_unit": 15, "productive_hours": 1600, "quality_allowance": 1.3}},
        {"name": "Supervision & floor support", "unit": "centres", "family": "ratio", "params": {"serving_ratio": 1.1}},
    ]),
    ("backoffice", "Back-office transaction processing", "demand", [
        {"name": "Applications processed", "unit": "applications/yr", "family": "demand", "params": {"minutes_per_unit": 18, "productive_hours": 1600, "quality_allowance": 1.15}},
    ]),
    ("payments", "Payments processing", "demand", [
        {"name": "Invoices issued", "unit": "invoices/yr", "family": "demand", "params": {"minutes_per_unit": 10, "productive_hours": 1600, "quality_allowance": 1.0}},
        {"name": "Payments & reconciliations", "unit": "payments/yr", "family": "demand", "params": {"minutes_per_unit": 3, "productive_hours": 1600, "quality_allowance": 1.0}},
        {"name": "Refund & dispute cases", "unit": "cases/yr", "family": "demand", "params": {"minutes_per_unit": 90, "productive_hours": 1600, "quality_allowance": 1.0}},
    ]),
    ("regulation", "Regulation & enforcement", "demand", [
        {"name": "Field inspections", "unit": "inspections/yr", "family": "demand", "params": {"minutes_per_unit": 540, "productive_hours": 1600, "quality_allowance": 1.0}},
        {"name": "Licence applications assessed", "unit": "applications/yr", "family": "demand", "params": {"minutes_per_unit": 52, "productive_hours": 1600, "quality_allowance": 1.0}},
        {"name": "Enforcement & legal cases", "unit": "cases/yr", "family": "demand", "params": {"minutes_per_unit": 1700, "productive_hours": 1600, "quality_allowance": 1.0}},
    ]),
    ("corporate", "Corporate services", "ratio", [
        {"name": "Workforce served: HR", "unit": "employees", "family": "ratio", "params": {"serving_ratio": 85.0}},
        {"name": "Workforce served: finance", "unit": "employees", "family": "ratio", "params": {"serving_ratio": 120.0}},
        {"name": "Workforce served: procurement", "unit": "employees", "family": "ratio", "params": {"serving_ratio": 200.0}},
        {"name": "Facilities & administration", "unit": "sites", "family": "coverage", "params": {"shifts": 1.0, "relief_factor": 0.7}},
    ]),
    ("digital", "Digital & IT", "demand", [
        {"name": "Business applications supported", "unit": "applications", "family": "demand", "params": {"minutes_per_unit": 950, "productive_hours": 1600, "quality_allowance": 1.0}},
        {"name": "Service desk tickets", "unit": "tickets/yr", "family": "demand", "params": {"minutes_per_unit": 22, "productive_hours": 1600, "quality_allowance": 1.0}},
        {"name": "Security & infrastructure cover (24/7 SOC)", "unit": "posts", "family": "coverage", "params": {"shifts": 3.0, "relief_factor": 1.45}},
    ]),
]

# ─────────────────────────── 5 Dubai entities + representative departments ───────────────────────────
# (name, code, [(department, typeset_key, current_fte)])
ENTITIES = [
    ("Dubai Electricity & Water Authority", "DEWA", [
        ("Strategy & Future Planning", "policy_strategy", 24),
        ("Generation & Transmission Projects", "project_delivery", 64),
        ("Network Operations & Maintenance", "ops_maintenance", 210),
        ("Load Dispatch Control Centre", "control_coverage", 34),
        ("Customer Care Centres", "frontline_service", 96),
        ("Billing & Revenue", "payments", 40),
        ("Shared Corporate Services", "corporate", 82),
        ("Digital & IT", "digital", 58),
    ]),
    ("Roads & Transport Authority", "RTA", [
        ("Strategy & Corporate Governance", "policy_strategy", 30),
        ("Infrastructure & Capital Projects", "project_delivery", 88),
        ("Roads Operations & Maintenance", "ops_maintenance", 240),
        ("Traffic Control Centre", "control_coverage", 42),
        ("Customer Happiness Centres", "frontline_service", 120),
        ("Licensing & Permits", "backoffice", 66),
        ("Fines & Revenue", "payments", 28),
        ("Corporate Services", "corporate", 90),
        ("Digital Services", "digital", 61),
    ]),
    ("Dubai Municipality", "DM", [
        ("Urban Planning & Strategy", "policy_strategy", 34),
        ("Infrastructure Projects", "project_delivery", 72),
        ("Public Health & Safety Inspection", "regulation", 58),
        ("Waste & Environment Operations", "ops_maintenance", 180),
        ("Customer Happiness", "frontline_service", 74),
        ("Permits & Certificates", "backoffice", 51),
        ("Corporate Services", "corporate", 88),
        ("Digital Services", "digital", 49),
    ]),
    ("Dubai Health Authority", "DHA", [
        ("Health Policy & Strategy", "policy_strategy", 28),
        ("Hospital & Facilities Projects", "project_delivery", 46),
        ("Emergency & Ambulance Control", "control_coverage", 55),
        ("Patient Services & Happiness", "frontline_service", 130),
        ("Health Regulation & Licensing", "regulation", 44),
        ("Claims & Payments", "payments", 36),
        ("Corporate Services", "corporate", 95),
        ("Digital Health", "digital", 52),
    ]),
    ("Dubai Police", "DP", [
        ("Strategy & Performance", "policy_strategy", 40),
        ("Command & Control (901)", "control_coverage", 120),
        ("Patrol Operations", "ops_maintenance", 340),
        ("Criminal Investigation", "regulation", 210),
        ("Customer Happiness & Services", "frontline_service", 90),
        ("Traffic Fines & Payments", "payments", 30),
        ("Corporate Services", "corporate", 110),
        ("Digital Services", "digital", 70),
    ]),
    ("Knowledge & Human Development Authority", "KHDA", [
        ("Strategy & Policy", "policy_strategy", 26),
        ("School & Institution Inspection", "regulation", 70),
        ("Permits & Licensing", "backoffice", 40),
        ("Customer Happiness", "frontline_service", 30),
        ("Corporate Services", "corporate", 45),
        ("Digital Services", "digital", 28),
    ]),
    ("Dubai Courts", "DC", [
        ("Judicial Strategy", "policy_strategy", 20),
        ("Case Registration & Processing", "backoffice", 90),
        ("Enforcement", "regulation", 60),
        ("Customer Service Centres", "frontline_service", 50),
        ("Corporate Services", "corporate", 55),
        ("Digital Services", "digital", 35),
    ]),
    ("Dubai Customs", "DXBC", [
        ("Strategy & Policy", "policy_strategy", 24),
        ("Customs Inspection & Control", "regulation", 220),
        ("Declarations Processing", "backoffice", 140),
        ("Client Happiness Centres", "frontline_service", 60),
        ("Revenue & Payments", "payments", 40),
        ("Corporate Services", "corporate", 80),
        ("Digital & IT", "digital", 55),
    ]),
    ("Residency & Foreigners Affairs (GDRFA)", "GDRFA", [
        ("Strategy", "policy_strategy", 22),
        ("Ports & Borders Control", "control_coverage", 180),
        ("Residency Applications", "backoffice", 160),
        ("Customer Happiness", "frontline_service", 120),
        ("Corporate Services", "corporate", 70),
        ("Digital Services", "digital", 60),
    ]),
    ("Dubai Land Department", "DLD", [
        ("Real Estate Strategy", "policy_strategy", 24),
        ("Registration & Transactions", "backoffice", 110),
        ("Real Estate Regulation (RERA)", "regulation", 70),
        ("Customer Happiness", "frontline_service", 55),
        ("Revenue & Payments", "payments", 30),
        ("Corporate Services", "corporate", 60),
        ("Digital Services", "digital", 45),
    ]),
    ("Community Development Authority", "CDA", [
        ("Social Policy & Strategy", "policy_strategy", 28),
        ("Social Care Programmes", "ops_maintenance", 90),
        ("Licensing & Permits", "backoffice", 35),
        ("Customer Happiness", "frontline_service", 40),
        ("Corporate Services", "corporate", 45),
        ("Digital Services", "digital", 25),
    ]),
    ("Dubai Economy & Tourism", "DET", [
        ("Economic Strategy", "policy_strategy", 34),
        ("Business Registration & Licensing", "backoffice", 130),
        ("Commercial Compliance", "regulation", 90),
        ("Investor Happiness Centres", "frontline_service", 70),
        ("Revenue & Fees", "payments", 40),
        ("Corporate Services", "corporate", 85),
        ("Digital Services", "digital", 60),
    ]),
]


def _get_or_create_entity(db: Session, name: str, code: str, wave: str) -> m.Entity:
    e = db.query(m.Entity).filter(m.Entity.code == code).first()
    if e:
        return e
    e = m.Entity(name=name, code=code, wave=wave, status="in_progress", completeness=0,
                 logo_url=logo_url_for(code))
    db.add(e)
    db.flush()
    return e


def seed_planning(db: Session | None = None) -> dict:
    own = db is None
    db = db or SessionLocal()
    try:
        # 1) typesets
        ts_by_key: dict[str, m.Typeset] = {t.key: t for t in db.query(m.Typeset).all()}
        for pos, (key, name, fam, drivers) in enumerate(TYPESETS):
            if key in ts_by_key:
                continue
            t = m.Typeset(key=key, name=name, position=pos, primary_family=fam,
                          default_drivers=drivers, description="")
            db.add(t)
            db.flush()
            ts_by_key[key] = t

        # 2) entities + departments
        created_depts = 0
        for wi, (name, code, depts) in enumerate(ENTITIES):
            wave = ["W1", "W1", "W2", "W2", "W3"][wi % 5]
            e = _get_or_create_entity(db, name, code, wave)
            for dname, tkey, cur in depts:
                exists = (
                    db.query(m.Department)
                    .filter(m.Department.entity_id == e.id, m.Department.name == dname)
                    .first()
                )
                if exists:
                    continue
                db.add(m.Department(entity_id=e.id, name=dname,
                                    typeset_id=ts_by_key[tkey].id, current_fte=cur))
                created_depts += 1
        db.commit()
        return {"typesets": len(ts_by_key), "entities": len(ENTITIES), "departments_created": created_depts}
    finally:
        if own:
            db.close()


if __name__ == "__main__":
    print(seed_planning())

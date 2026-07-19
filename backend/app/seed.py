"""Canonical seed scenario (SPEC §7). Idempotent: truncates then rebuilds.

Run: `python -m app.seed`  ·  Re-run via `POST /api/demo/reset`.
All dates are computed relative to runtime `today` so the demo always looks live.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

from sqlalchemy import delete, text
from sqlalchemy.orm import Session

from app.db import Base, SessionLocal, engine
from app import models as m

TODAY = date.today()


# ───────────────────────────── helpers ─────────────────────────────
def _reset_tables(db: Session) -> None:
    # Single TRUNCATE ... CASCADE handles the circular users↔entities and
    # cases↔case_messages/audit_events FKs cleanly and resets identity sequences.
    table_names = ", ".join(f'"{t}"' for t in Base.metadata.tables.keys())
    db.execute(text(f"TRUNCATE {table_names} RESTART IDENTITY CASCADE"))
    db.commit()


# ───────────────────────────── users ─────────────────────────────
def seed_users(db: Session) -> dict[str, m.User]:
    """Create all users with entity_id=None; entity users are wired after entities exist."""
    defs = [
        ("DGHR Admin", "DG", "dghr_admin", "#0B1B3B"),
        ("Aisha Khan", "AK", "dghr_analyst", "#2563EB"),
        ("M. Al Blooshi", "MA", "dghr_reviewer", "#7C3AED"),
        ("H. Al Qasimi", "HA", "dghr_reviewer", "#0D9488"),
        ("F. Al Marri", "FA", "dghr_reviewer", "#EA8A00"),
        ("Omar Al Zaabi", "OA", "dghr_reviewer", "#0EA5E9"),
        ("Aisha Al Mansoori", "AA", "dghr_analyst", "#16A34A"),
        ("Maryam Al Zaabi", "MZ", "dghr_reviewer", "#E11D48"),
        ("Ahmed Al Mansoori", "AM", "entity_admin", "#16A34A"),
        ("Sara Al Mansoori", "SM", "entity_contact", "#2563EB"),
        ("Fatima Al Mansoori", "FM", "entity_contact", "#0D9488"),
    ]
    out: dict[str, m.User] = {}
    for name, initials, role, color in defs:
        u = m.User(name=name, initials=initials, role=role, entity_id=None, avatar_color=color)
        db.add(u)
        out[name] = u
    db.flush()
    return out


# ───────────────────────────── entities ─────────────────────────────
# Pinned first 10 (SPEC §7.1). Per-package: Org, Wkf, Wkl, Drv, Evd.
PINNED = [
    # name, code, wave, packages[5], overall, reviewer, status, overdue, quality
    ("Dubai Health Authority", "DHA", "W1", [100, 85, 80, 75, 90], 86, "M. Al Blooshi", "in_progress", True, 74),
    ("Roads & Transport Authority", "RTA", "W1", [100, 100, 95, 90, 100], 97, "H. Al Qasimi", "submitted", False, 76),
    # DM packages tuned to mean 68 while matching the Home mockup's visible Org/Workforce/Workload
    # (100/72/45); Future/Evidence non-zero to keep the mean consistent (see CONFLICTS C1).
    ("Dubai Municipality", "DM", "W1", [100, 72, 45, 63, 60], 68, "F. Al Marri", "returned", False, 82),
    ("Dubai Police", "DP", "W1", [100, 100, 100, 100, 100], 100, "M. Al Blooshi", "submitted", False, 90),
    ("Dubai Electricity & Water Authority", "DEWA", "W2", [90, 80, 70, 50, 80], 74, "H. Al Qasimi", "in_progress", False, 94),
    ("Knowledge & Human Dev. Authority", "KHDA", "W2", [100, 90, 70, 60, 80], 78, "F. Al Marri", "in_progress", False, 79),
    ("Dubai Civil Aviation Authority", "DCAA", "W2", [80, 50, 40, 30, 40], 48, "M. Al Blooshi", "not_started", False, 58),
    ("Dubai Culture", "DC", "W2", [100, 100, 100, 80, 100], 96, "H. Al Qasimi", "submitted", False, 64),
    ("Dubai Sports Council", "DSC", "W3", [60, 40, 30, 20, 20], 34, "F. Al Marri", "not_started", False, 51),
    ("Dubai Tourism", "DET", "W3", [70, 60, 50, 40, 60], 56, None, "not_started", False, 60),
]

# 49 additional entities. (name, code)
OTHERS = [
    ("Dubai Courts", "DCRT"), ("Land Department", "DLD"), ("Dubai Customs", "DC-CUS"),
    ("Islamic Affairs & Charitable Activities Dept.", "IACAD"), ("Education & Knowledge Dept.", "KHDA2"),
    ("General Directorate of Residency & Foreigners Affairs", "GDRFA"), ("Dubai Statistics Center", "DSC-ST"),
    ("Awqaf & Minors Affairs Foundation", "AMAF"), ("Dubai Corporation for Ambulance Services", "DCAS"),
    ("Dubai Media Incorporated", "DMI"), ("Dubai Ports Authority", "DPA"),
    ("Community Development Authority", "CDA"), ("Dubai Economy & Tourism", "DET2"),
    ("Dubai Public Prosecution", "DPP"), ("Dubai Financial Services Authority", "DFSA"),
    ("Dubai Airports", "DXB"), ("Dubai Civil Defence", "DCD"), ("Dubai Maritime City Authority", "DMCA"),
    ("Dubai Chambers", "DCH"), ("Dubai Judicial Institute", "DJI"),
    ("Dubai Health Insurance Corporation", "DHIC"), ("Dubai Water Canal Authority", "DWCA"),
    ("Dubai Silicon Oasis Authority", "DSOA"), ("Dubai Future Foundation", "DFF"),
    ("Dubai Culture & Heritage Authority", "DCHA"), ("Dubai Sports Authority", "DSA"),
    ("Dubai Real Estate Institute", "DREI"), ("Dubai Municipality Waste Management", "DMWM"),
    ("Dubai Electricity Distribution", "DED"), ("Dubai Roads Agency", "DRA"),
    ("Dubai Taxi Corporation", "DTC"), ("Dubai Smart Government", "DSG"),
    ("Dubai Land Transport Agency", "DLTA"), ("Dubai Corporation for Consumer Protection", "DCCP"),
    ("Dubai Foundation for Women & Children", "DFWAC"), ("Dubai Autism Center", "DAC"),
    ("Dubai Quality Group", "DQG"), ("Dubai Design District Authority", "D3"),
    ("Dubai Healthcare City Authority", "DHCC"), ("Dubai International Academic City", "DIAC"),
    ("Dubai Knowledge Park", "DKP"), ("Dubai Internet City", "DIC"),
    ("Dubai Media City", "DMC"), ("Dubai Studio City", "DST"),
    ("Dubai Production City", "DPC"), ("Dubai Science Park", "DSP"),
    ("Dubai Industrial City", "DINC"), ("Dubai Outsource City", "DOC"),
    ("Dubai Humanitarian City", "DHC"),
]


def _distribute_others() -> list[dict]:
    """Deterministically assign status/wave/overdue/completeness/quality/ready to the 49 others."""
    statuses = (
        ["not_started"] * 9 + ["in_progress"] * 12 + ["submitted"] * 10
        + ["under_review"] * 6 + ["returned"] * 4 + ["approved"] * 8
    )  # 49
    waves = ["W1"] * 16 + ["W2"] * 16 + ["W3"] * 17  # 49

    # 11 forecasting-ready total; 3 are pinned (RTA, DP, DC) → 8 among the others.
    # Ready ones must be submitted/under_review with completeness>=80 & quality>=75.
    # Overdue: DHA(pinned)=1 → need 8 more among non-approved others.
    rows = []
    # 11 forecasting-ready total. Among the pinned only RTA + DP qualify (DC's canonical
    # quality is 64 < 75 threshold), so 9 must come from the others.
    ready_budget = 9
    # Exactly 11 "low" others (completeness < 60) → 14 total with the 3 pinned <60
    # (DCAA 48, DSC 34, DET 56), matching the tracker "Low Completeness (<60%) 14" counter.
    # Chosen so the overall mean(completeness) lands ≈ 72 (screen 03 "Avg. Completeness 72%").
    low_indices = {0, 2, 4, 6, 8, 10, 12, 37, 38, 39, 40}
    for i, (name, code) in enumerate(OTHERS):
        status = statuses[i]
        wave = waves[i]
        ready = False
        completeness: int
        quality: int | None
        overdue = False
        is_low = i in low_indices

        # Quality scores are tuned so mean(quality_score over scored entities) ≈ 82
        # (screen 04 "Average Quality Score 82" + highlighted "Overall Average" bar).
        if is_low:
            completeness = 34 + (i % 5) * 5  # 34..54 (< 60)
            quality = None if status == "not_started" else 70 + (i % 4) * 3
        elif status in ("submitted", "under_review") and ready_budget > 0:
            ready = True
            ready_budget -= 1
            completeness = 82 + (i % 6) * 2  # 82..92
            quality = 84 + (i % 5) * 2       # 84..92
        elif status == "approved":
            completeness = 88 + (i % 4) * 2  # 88..94 (excluded from ready rule)
            quality = 88 + (i % 4) * 2       # 88..94
        elif status in ("submitted", "under_review"):
            completeness = 72 + (i % 4) * 2  # 72..78 (fails >=80)
            quality = 82 + (i % 4) * 2       # 82..88
        elif status == "returned":
            completeness = 64 + (i % 3) * 4  # 64..72
            quality = 78 + (i % 3) * 3       # 78..84
        elif status == "in_progress":
            completeness = 70 + (i % 5) * 4  # 70..86
            quality = 80 + (i % 5) * 3       # 80..92
        else:  # not_started (non-low)
            completeness = 62 + (i % 4) * 4  # 62..74
            quality = None

        # Deterministic overdue set (8 others + DHA pinned = 9 total). Indices 39 & 40 are
        # in the "returned" block, giving exactly 2 overdue∩returned overlap so that the
        # "Entities with Missing Data / Require attention" KPI = |overdue ∪ returned| = 12.
        if i in {0, 5, 10, 15, 25, 30, 39, 40}:
            overdue = True

        rows.append({
            "name": name, "code": code, "wave": wave, "status": status,
            "completeness": completeness, "quality": quality, "overdue": overdue,
            "ready": ready,
        })
    return rows


def seed_entities(db: Session, users: dict[str, m.User]) -> dict[str, m.Entity]:
    by_name: dict[str, m.Entity] = {}
    # due dates spread today-3d .. today+21d
    due_cursor = TODAY - timedelta(days=3)

    def reviewer_id(name: str | None) -> int | None:
        return users[name].id if name and name in users else None

    # pinned
    for idx, (name, code, wave, pkgs, overall, rev, status, overdue, quality) in enumerate(PINNED):
        due = TODAY + timedelta(days=(idx % 8) - 3)
        e = m.Entity(
            name=name, code=code, wave=wave, reviewer_id=reviewer_id(rev),
            due_date=due, status=status, overdue=overdue,
            completeness=overall, quality_score=quality,
            forecasting_ready=(status in ("submitted", "under_review") and overall >= 80 and (quality or 0) >= 75),
        )
        db.add(e)
        by_name[name] = e

    # others
    revs = ["M. Al Blooshi", "H. Al Qasimi", "F. Al Marri"]
    unassigned_left = 5  # 5 unassigned-reviewer entities (DET pinned is 1 of them)
    unassigned_left -= 1
    for i, r in enumerate(_distribute_others()):
        assign_unassigned = unassigned_left > 0 and (i % 12 == 0)
        if assign_unassigned:
            unassigned_left -= 1
            rev_id = None
        else:
            rev_id = users[revs[i % 3]].id
        due = TODAY + timedelta(days=((i * 3) % 25) - 3)
        e = m.Entity(
            name=r["name"], code=r["code"], wave=r["wave"], reviewer_id=rev_id,
            due_date=due, status=r["status"], overdue=r["overdue"],
            completeness=r["completeness"], quality_score=r["quality"],
            forecasting_ready=r["ready"],
        )
        db.add(e)
        by_name[r["name"]] = e

    db.flush()

    # blocked_reason for non-ready entities (drives readiness + blocked-summary later)
    for e in by_name.values():
        if not e.forecasting_ready:
            reasons = []
            if e.completeness < 80:
                reasons.append("Completeness < 80%")
            if (e.quality_score or 0) < 75:
                reasons.append("Quality below threshold")
            if e.status in ("not_started", "in_progress", "returned"):
                reasons.append("Submission incomplete")
            e.blocked_reason = "; ".join(reasons) or "Pending review"
    db.flush()
    return by_name


# ───────────────────────────── cycle & packages ─────────────────────────────
SECTION_TYPES = [
    ("Customer Service", "Frontline service delivery units"),
    ("Inspection", "Regulatory and field inspection units"),
    ("HR", "Human resources departments"),
    ("Finance", "Finance and budgeting units"),
    ("IT", "Information technology units"),
    ("Strategy", "Strategy and performance units"),
    ("Data & Digital", "Data, analytics and digital units"),
]

# key, name, description, total, mand, opt, toggle, evidence, evidence_label, sec_type_count, icon
PACKAGES = [
    ("org_structure", "Organization Structure", "Legal entity, departments, units, and reporting lines.", 46, 32, 14, True, "yes", "18 fields", 5, "sitemap"),
    ("current_workforce", "Current Workforce", "Headcount, demographics, contracts, compensation bands.", 78, 48, 30, True, "yes", "24 fields", 5, "users"),
    ("workforce_movement", "Workforce Movement", "Hires, transfers, promotions, exits, turnover and reasons.", 52, 28, 24, True, "yes", "16 fields", 4, "shuffle"),
    ("workload_service", "Workload & Service Data", "Service volumes, queues, SLAs, productivity metrics.", 48, 28, 20, True, "yes", "14 fields", 4, "bar-chart"),
    ("future_drivers", "Future Demand Drivers", "Strategic initiatives, population and demand drivers.", 36, 20, 16, True, "optional", "8 fields", 4, "target"),
    ("skills_roles", "Skills & Roles", "Critical skills, role taxonomy, proficiency levels.", 46, 26, 20, True, "yes", "12 fields", 5, "id-badge"),
    ("budget_cost", "Budget & Cost", "Payroll, operating costs, budgets, and forecasts.", 44, 24, 20, True, "yes", "12 fields", 4, "coins"),
    ("evidence_documents", "Evidence & Documents", "Supporting files, justifications, methodologies.", 36, 6, 30, False, "yes", "All fields", 5, "file-text"),
]

FIELD_GROUPS = {
    "org_structure": [("Legal entity", 8), ("Departments", 12), ("Units", 14), ("Reporting lines", 12)],
    "current_workforce": [("Headcount", 20), ("Demographics", 18), ("Contracts", 20), ("Compensation bands", 20)],
    "workforce_movement": [("Hires & exits", 16), ("Transfers & promotions", 18), ("Turnover reasons", 18)],
    "workload_service": [("Service volumes", 14), ("Queues & SLAs", 16), ("Productivity metrics", 18)],
    "future_drivers": [("Strategic initiatives", 12), ("Population drivers", 12), ("Demand drivers", 12)],
    "skills_roles": [("Critical skills", 16), ("Role taxonomy", 16), ("Proficiency levels", 14)],
    "budget_cost": [("Payroll", 12), ("Operating costs", 12), ("Budgets", 10), ("Forecasts", 10)],
    "evidence_documents": [("Supporting files", 12), ("Justifications", 12), ("Methodologies", 12)],
}

# 5 packages apply to entities (SPEC §7.3 for DM/DHA — applied to all for tracker consistency).
APPLICABLE_KEYS = ["org_structure", "current_workforce", "workload_service", "future_drivers", "evidence_documents"]


def seed_cycle_packages(db: Session) -> tuple[m.CollectionCycle, dict[str, m.DataPackage], list[m.SectionType]]:
    cycle = m.CollectionCycle(
        name="Workforce Planning Cycle 2025",
        starts_on=TODAY - timedelta(days=28),
        ends_on=TODAY + timedelta(days=17),
        deadline=TODAY + timedelta(days=11),
        status="active",
        version_label="v2.1",
    )
    db.add(cycle)
    db.flush()

    section_types = []
    for name, desc in SECTION_TYPES:
        st = m.SectionType(name=name, description=desc, active=True)
        db.add(st)
        section_types.append(st)
    db.flush()

    pkgs: dict[str, m.DataPackage] = {}
    for pos, (key, name, desc, total, mand, opt, toggle, ev, evlabel, sec_ct, icon) in enumerate(PACKAGES, start=1):
        p = m.DataPackage(
            cycle_id=cycle.id, position=pos, key=key, name=name, description=desc,
            total_fields=total, mandatory_fields=mand, optional_fields=opt,
            mandatory_enabled=toggle, evidence_required=ev, evidence_fields_label=evlabel,
            status="configured", icon_key=icon,
        )
        db.add(p)
        pkgs[key] = p
    db.flush()

    # field groups
    for key, groups in FIELD_GROUPS.items():
        for gname, cnt in groups:
            db.add(m.PackageFieldGroup(package_id=pkgs[key].id, name=gname, field_count=cnt))

    # package ↔ section-type applicability (first N section types per spec count)
    for (key, *_rest), pkg_def in zip([(p[0],) for p in PACKAGES], PACKAGES):
        sec_ct = pkg_def[9]
        for st in section_types[:sec_ct]:
            db.add(m.PackageSectionType(package_id=pkgs[pkg_def[0]].id, section_type_id=st.id))
    db.flush()
    return cycle, pkgs, section_types


def seed_entity_packages(db: Session, entities: dict[str, m.Entity], pkgs: dict[str, m.DataPackage]) -> None:
    pinned_pkg_values = {name: vals for (name, _c, _w, vals, *_r) in PINNED}
    all_keys = [p[0] for p in PACKAGES]
    for name, e in entities.items():
        pinned = pinned_pkg_values.get(name)
        for key in all_keys:
            applicable = key in APPLICABLE_KEYS
            if not applicable:
                db.add(m.EntityPackage(entity_id=e.id, package_id=pkgs[key].id, applicable=False,
                                       status="not_started", progress=0))
                continue
            idx = APPLICABLE_KEYS.index(key)
            if pinned is not None:
                progress = pinned[idx]
            else:
                # Realistic ordering: Org Structure completes first, Evidence last
                # (progress decreases with package index).
                base = e.completeness
                progress = max(0, min(100, base + (2 - idx) * 8))
            if progress >= 100:
                status = "submitted"
            elif progress == 0:
                status = "not_started"
            else:
                status = "in_progress"
            db.add(m.EntityPackage(entity_id=e.id, package_id=pkgs[key].id, applicable=True,
                                   status=status, progress=progress))
    db.flush()


# ───────────────────────────── job taxonomy ─────────────────────────────
JOB_TAXONOMY = {
    "Strategy & Planning": ["Strategy Manager", "Senior Analyst", "Strategy Analyst", "Performance Analyst", "Planning Specialist", "Policy Advisor", "Strategy Director", "Portfolio Manager", "Transformation Lead", "Business Analyst"],
    "Human Resources": ["HR Business Partner", "HR Officer", "HR Manager", "Talent Acquisition Specialist", "Learning & Development Specialist", "Compensation Analyst", "HR Director", "Recruitment Officer", "Employee Relations Specialist", "HR Coordinator"],
    "Finance": ["Finance Manager", "Accountant", "Senior Accountant", "Financial Analyst", "Budget Analyst", "Treasury Officer", "Finance Director", "Payroll Officer", "Auditor", "Procurement Specialist"],
    "Information Technology": ["System Administrator", "Software Engineer", "IT Support Specialist", "Network Engineer", "Solutions Architect", "IT Manager", "DevOps Engineer", "Database Administrator", "IT Director", "Cybersecurity Analyst"],
    "Customer Service": ["Customer Service Officer", "Call Center Agent", "Service Delivery Manager", "Customer Experience Specialist", "Front Desk Officer", "Contact Center Supervisor", "Customer Relations Manager", "Service Advisor"],
    "Inspection & Compliance": ["Inspector", "Senior Inspector", "Compliance Officer", "Field Inspector", "Regulatory Specialist", "Enforcement Officer", "Inspection Manager", "Compliance Manager"],
    "Legal & Governance": ["Legal Counsel", "Legal Advisor", "Paralegal", "Governance Officer", "Legal Manager", "Contracts Specialist", "Legal Director"],
    "Data & Analytics": ["Data Analyst", "Data Scientist", "Data Engineer", "BI Developer", "Analytics Manager", "Machine Learning Engineer", "Data Architect"],
    "Operations": ["Operations Officer", "Operations Manager", "Logistics Coordinator", "Facilities Officer", "Operations Director", "Maintenance Supervisor", "Fleet Coordinator"],
    "Communications & Media": ["Communications Officer", "Media Specialist", "Content Producer", "PR Manager", "Social Media Specialist", "Communications Director"],
    "Health & Medical": ["Medical Officer", "Nurse", "Clinical Specialist", "Health Inspector", "Paramedic", "Public Health Analyst", "Medical Director"],
    "Engineering": ["Civil Engineer", "Electrical Engineer", "Mechanical Engineer", "Project Engineer", "Engineering Manager", "Quality Engineer", "Site Engineer"],
}

TITLE_ALIASES = {
    "HR Business Partner": ["HRBP", "HR Partner"],
    "System Administrator": ["Sys Admin", "Systems Administrator"],
    "Software Engineer": ["Developer", "Software Developer"],
    "Data Analyst": ["Data Analytics Officer", "Analytics Analyst"],
    "Customer Service Officer": ["CS Officer", "Customer Support Officer"],
    "Accountant": ["Accounts Officer"],
    "Inspector": ["Field Officer"],
}


def seed_job_taxonomy(db: Session) -> None:
    for fam_name, titles in JOB_TAXONOMY.items():
        fam = m.JobFamily(name=fam_name)
        db.add(fam)
        db.flush()
        for t in titles:
            db.add(m.StandardJobTitle(family_id=fam.id, title=t, aliases=TITLE_ALIASES.get(t, [])))
    db.flush()


# ───────────────────────────── DM detail data ─────────────────────────────
DM_SECTORS = [
    "Government Enablement Sector", "Government Support Sector", "Digital Government Sector",
    "Smart City & Future Sector", "Regulation & Compliance Sector", "Corporate Services Sector",
]


# 27 departments across the 6 sectors (screen 07: 6 sectors · 27 departments · 142 sections)
DM_DEPARTMENTS = {
    "Government Enablement Sector": ["People Enablement Department", "HR Policy & Governance Department", "Shared Services Department", "Organizational Development Department", "Talent Management Department"],
    "Government Support Sector": ["Finance Department", "Procurement Department", "Administration Department", "Facilities Department"],
    "Digital Government Sector": ["Digital Platforms Department", "Data & Analytics Department", "Cybersecurity Department", "Applications Department"],
    "Smart City & Future Sector": ["Innovation Department", "Smart Services Department", "Future Planning Department", "Sustainability Department"],
    "Regulation & Compliance Sector": ["Regulation Department", "Compliance Department", "Inspection Department", "Legal Department", "Enforcement Department"],
    "Corporate Services Sector": ["Corporate Communications Department", "Strategy Department", "Governance Department", "Internal Audit Department", "Support Department"],
}
OWNER_NAMES = ["Aisha Al Hashmi", "Maryam Al Zaabi", "Salem Al Kaabi", "Laila Al Shamsi", "Noora Al Nuaimi",
               "Khalid Al Hebsi", "Rania Al Falasi", "Huda Al Mansoori", "Omar Al Marri", "Saeed Al Ketbi"]
HR_FOCALS = ["Omar Al Marri", "Fatima Al Blooshi", "Yousuf Al Mazrouei", "Hassan Al Suwaidi", "Saeed Al Ketbi", "Mohammed Al Rassi"]


def seed_dm_org(db: Session, dm: m.Entity) -> None:
    # Pinned visible rows (screen 07 — verbatim; root shown as the entity, not "DGHR")
    pinned_rows = [
        ("Government Enablement Sector", "People Enablement Department", "Workforce Planning Section", "Aisha Al Hashmi", "AA", "Omar Al Marri", True, 38, "mapped"),
        ("Government Enablement Sector", "People Enablement Department", "Learning & Development Section", "Maryam Al Zaabi", "MA", "Fatima Al Blooshi", True, 42, "mapped"),
        ("Government Enablement Sector", "People Enablement Department", "Culture & Engagement Section", "Salem Al Kaabi", "SA", "Yousuf Al Mazrouei", True, 27, "mapped"),
        ("Government Enablement Sector", "HR Policy & Governance Department", "HR Policy Section", "Laila Al Shamsi", "LA", "Hassan Al Suwaidi", True, 19, "mapped"),
        ("Government Enablement Sector", "HR Policy & Governance Department", "Government Relations Section", "Noora Al Nuaimi", "NA", "Hassan Al Suwaidi", True, 16, "mapped"),
        ("Government Enablement Sector", "Shared Services Department", "HR Operations Section", "Khalid Al Hebsi", "KA", "Saeed Al Ketbi", True, 61, "mapped"),
        ("Government Support Sector", "Finance Department", "Budget Analysis Section", "Rania Al Falasi", "RA", "Mohammed Al Rassi", True, None, "unmapped"),
        ("Digital Government Sector", "Digital Platforms Department", "Data Governance Section", "Huda Al Mansoori", "HA", "Omar Al Marri", False, None, "not_in_scope"),
    ]
    for sector, dept, sec, owner, oinit, hr, inscope, emp, status in pinned_rows:
        db.add(m.OrgSection(entity_id=dm.id, sector=sector, department=dept, name=sec,
                            owner_name=owner, owner_initials=oinit, hr_focal_point=hr,
                            in_scope=inscope, employee_count=emp, status=status))

    # Flatten (sector, department) pairs and round-robin the remaining 134 sections across them.
    dept_pairs = [(s, d) for s, depts in DM_DEPARTMENTS.items() for d in depts]  # 27 pairs
    remaining = 142 - len(pinned_rows)  # 134
    unmapped_left = 7 - 1               # 6 more unmapped (1 pinned)
    missing_owner_left = 3             # 3 sections missing Section Owner
    missing_focal_left = 2            # 2 sections missing HR Focal Point
    for i in range(remaining):
        sector, dept = dept_pairs[i % len(dept_pairs)]
        status = "mapped"
        if unmapped_left > 0 and i % 19 == 0:
            status = "unmapped"
            unmapped_left -= 1
        elif i % 23 == 0:
            status = "partial"
        owner = OWNER_NAMES[i % len(OWNER_NAMES)]
        oinit = "".join(w[0] for w in owner.split()[:2])
        focal = HR_FOCALS[i % len(HR_FOCALS)]
        if missing_owner_left > 0 and i % 37 == 5:
            owner, oinit = None, None
            missing_owner_left -= 1
        if missing_focal_left > 0 and i % 41 == 7:
            focal = None
            missing_focal_left -= 1
        db.add(m.OrgSection(
            entity_id=dm.id, sector=sector, department=dept,
            name=f"{dept.replace(' Department', '')} Section {i + 1}",
            owner_name=owner, owner_initials=oinit, hr_focal_point=focal,
            in_scope=True, employee_count=(None if status == "unmapped" else 8 + (i % 46)),
            status=status,
        ))
    db.flush()


def seed_dm_workforce(db: Session, dm: m.Entity) -> None:
    """1,248 records; map split 1187/34/27; issues 18+12+5+2 = 37."""
    pinned = [
        ("Corporate Strategy", "Strategy Manager", "Strategy & Planning", 10, 3.0, 1.0, "Permanent", True, "mapped"),
        ("Corporate Strategy", "Senior Analyst", "Strategy & Planning", 8, 2.0, 0.0, "Permanent", False, "mapped"),
        ("Human Resources", "HR Business Partner", "Human Resources", 9, 4.0, 1.0, "Permanent", True, "mapped"),
        ("Human Resources", "HR Officer", "Human Resources", 6, 2.0, 1.0, "Permanent", False, "mapped"),
        ("Finance", "Finance Manager", "Finance", 10, 2.0, 0.0, "Permanent", True, "mapped"),
        ("Finance", "Accountant", "Finance", 7, 3.0, 1.0, "Permanent", False, "partial"),
        ("Information Technology", "System Administrator", "Information Technology", 7, 2.0, 1.0, "Contract", False, "mapped"),
    ]
    for sec, title, fam, grade, fte, vac, emp, crit, mstatus in pinned:
        db.add(m.WorkforceRecord(entity_id=dm.id, section=sec, job_title=title, job_family=fam,
                                 grade=grade, current_fte=fte, vacancies=vac, employment_type=emp,
                                 critical_role=crit, map_status=mstatus, issues=[]))

    sections = ["Corporate Strategy", "Human Resources", "Finance", "Information Technology",
                "Customer Service", "Inspection & Compliance", "Legal Affairs", "Operations",
                "Communications", "Facilities Management"]
    fams = list(JOB_TAXONOMY.keys())
    total = 1248
    n_generated = total - len(pinned)  # 1241
    # target map split across ALL 1248: 1187 mapped, 34 partial, 27 unmapped
    # pinned already: 6 mapped + 1 partial → remaining need: mapped 1181, partial 33, unmapped 27
    map_plan = ["mapped"] * 1181 + ["partial"] * 33 + ["unmapped"] * 27  # 1241
    # issue plan (disjoint): 18 missing_grade, 12 inconsistent_title, 5 missing_employment_type, 2 negative_zero_fte
    issue_plan: list[list[str]] = []
    issue_plan += [["missing_grade"]] * 18
    issue_plan += [["inconsistent_title"]] * 12
    issue_plan += [["missing_employment_type"]] * 5
    issue_plan += [["negative_zero_fte"]] * 2
    issue_plan += [[]] * (n_generated - len(issue_plan))

    for i in range(n_generated):
        sec = sections[i % len(sections)]
        fam = fams[i % len(fams)]
        title = JOB_TAXONOMY[fam][i % len(JOB_TAXONOMY[fam])]
        mstatus = map_plan[i]
        issues = issue_plan[i]
        grade: int | None = 5 + (i % 9)
        fte = 1.0 + (i % 4)
        emp: str | None = ["Permanent", "Permanent", "Contract", "Part-time"][i % 4]
        if "missing_grade" in issues:
            grade = None
        if "missing_employment_type" in issues:
            emp = None
        if "negative_zero_fte" in issues:
            fte = 0.0
        job_family = None if mstatus == "unmapped" else (fam if mstatus == "mapped" else None)
        # Vacancies sum to 61 total (screen 08: "61 · 4.9% of total positions"): 56 of the
        # generated records carry one vacancy; the 7 pinned rows contribute 5 → 61.
        vac = 1.0 if i < 56 else 0.0
        db.add(m.WorkforceRecord(
            entity_id=dm.id, section=sec, job_title=title, job_family=job_family,
            grade=grade, current_fte=fte, vacancies=vac, employment_type=emp,
            critical_role=(i % 7 == 0), map_status=mstatus, issues=issues,
        ))
    db.flush()


DM_WORKLOAD = [
    ("Customer Service", 16, "Inbound Requests", "Total Service Requests", 12845, "requests", "Medium", "CRM System", "complete", "Peak in Jul–Aug", [60, 62, 65, 70, 78, 88, 100, 98, 82, 70, 64, 60]),
    ("Inspection & Compliance", 18, "Inspections", "Inspections Conducted", 3215, "inspections", "High", "Inspection System", "complete", "Peak in Nov–Jan", [100, 80, 70, 62, 58, 55, 54, 56, 62, 72, 88, 98]),
    ("Human Resources", 22, "Employee Lifecycle", "New Hires Onboarded", 542, "employees", "Medium", "HRIS", "complete", "Peak in Aug–Sep", [60, 58, 60, 64, 70, 76, 82, 95, 100, 78, 66, 60]),
    ("Finance", 20, "Transactions", "Invoices Processed", 8965, "invoices", "High", "Finance System", "missing_data", "Peak in Dec–Jan", [98, 82, 70, 64, 60, 58, 56, 58, 66, 78, 90, 100]),
    ("Information Technology", 18, "IT Operations", "IT Service Tickets", 4213, "tickets", "Medium", "ITSM", "complete", "Peak in Apr–May", [70, 76, 88, 100, 96, 80, 68, 64, 62, 66, 70, 68]),
    ("Strategy & Planning", 12, "Projects", "Active Strategic Initiatives", 38, "initiatives", "Low", "PMO System", "draft", "Steady", [50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50]),
    ("Legal & Governance", 14, "Legal Services", "Legal Cases Handled", 267, "cases", "High", "Legal System", "missing_data", "Peak in Sep–Oct", [64, 66, 68, 70, 74, 78, 84, 90, 100, 96, 78, 66]),
    ("Facilities Management", 14, "Maintenance", "Maintenance Requests", 1876, "requests", "Medium", "FM System", "complete", "Peak in Jun–Jul", [66, 70, 76, 82, 90, 98, 100, 92, 78, 70, 66, 64]),
    ("Procurement", 12, "Procurement", "Purchase Orders Issued", 1345, "orders", "Medium", "eProcurement", "draft", "Peak in Q4", [70, 68, 66, 66, 68, 70, 72, 74, 80, 92, 100, 96]),
]


def seed_dm_workload(db: Session, dm: m.Entity) -> None:
    # deltas to shape "Trend" %: prev_volume derived from a chosen delta
    deltas = [8.4, -2.1, 5.7, 3.2, 11.3, 0.0, -4.5, 1.8, -1.2]
    for i, (name, mcount, stype, kmetric, vol, unit, cplx, src, status, peak, pattern) in enumerate(DM_WORKLOAD):
        d = deltas[i]
        prev = int(round(vol / (1 + d / 100))) if d != 0 else vol
        db.add(m.WorkloadSection(
            entity_id=dm.id, name=name, metrics_count=mcount, service_type=stype, key_metric=kmetric,
            current_volume=(None if status == "missing_data" and i in (3, 6) else vol),
            prev_volume=prev, unit=unit, complexity=cplx, source_system=src, status=status,
            monthly_pattern=pattern, peak_label=peak,
        ))
    db.flush()


DM_DRIVERS = [
    ("New Services", "Launch of integrated digital citizen experience platform.", "High", "0–2 Years", "in_progress"),
    ("Strategic Initiatives", "Smart Government Enablement Program 2025–2027.", "High", "0–3 Years", "in_progress"),
    ("Digital Transformation", "Enterprise systems modernization across core functions.", "Medium", "1–3 Years", "in_progress"),
    ("AI & Automation", "AI assistants for case handling and document processing.", "High", "0–2 Years", "captured"),
    ("Regulatory Changes", "UAE labor law updates and compliance mandates.", "Medium", "0–2 Years", "in_progress"),
    ("Population / Demand Growth", "Population growth and service demand increase.", "Medium", "1–5 Years", "in_progress"),
    ("Productivity Improvements", "Process re-engineering and efficiency initiatives.", "Low", "1–5 Years", "captured"),
]

DM_EVIDENCE = [
    ("Smart Government Enablement Program 2025-2027.pdf", "DGI – Strategy", "Strategic Initiatives", "High"),
    ("AI Adoption Roadmap 2025.pdf", "DGHR – Digital", "AI & Automation", "High"),
    ("Workforce Impact Model.xlsx", "DGHR – Planning", "AI & Automation", "Medium"),
    ("UAE Labor Law Update 2025.pdf", "MoHRE", "Regulatory Changes", "High"),
    ("Citizen Demand Projections.docx", "DGI – Research", "Population / Demand Growth", "Medium"),
]


def seed_dm_drivers_evidence(db: Session, dm: m.Entity) -> None:
    driver_by_cat: dict[str, m.DemandDriver] = {}
    for cat, desc, impact, horizon, status in DM_DRIVERS:
        dr = m.DemandDriver(entity_id=dm.id, category=cat, description=desc, impact=impact,
                            horizon=horizon, status=status)
        db.add(dr)
        db.flush()
        driver_by_cat[cat] = dr
    # pinned evidence
    for fname, src, linked, quality in DM_EVIDENCE:
        drv = next((d for c, d in driver_by_cat.items() if c.startswith(linked.split()[0])), None)
        db.add(m.EvidenceDoc(entity_id=dm.id, filename=fname, source_org=src,
                             linked_driver_id=(drv.id if drv else None), linked_label=linked,
                             quality=quality, uploaded_by="Sara Al Mansoori",
                             uploaded_at=datetime.utcnow() - timedelta(days=3), filepath=""))
    # 27 generated evidence docs (total 32)
    for i in range(27):
        cat = DM_DRIVERS[i % len(DM_DRIVERS)][0]
        db.add(m.EvidenceDoc(entity_id=dm.id, filename=f"Evidence Document {i+1}.pdf",
                             source_org="Entity Upload", linked_driver_id=driver_by_cat[cat].id,
                             linked_label=cat, quality=["High", "Medium", "Low"][i % 3],
                             uploaded_by="Sara Al Mansoori",
                             uploaded_at=datetime.utcnow() - timedelta(days=(i % 20)), filepath=""))
    # reviewer comments (screen 10 verbatim)
    db.add(m.PackageComment(entity_id=dm.id, package_key="future_drivers",
                            author_name="Aisha Al Mansoori", author_role="Workforce Planning Lead",
                            body="Please provide evidence for the productivity improvement assumptions for the 1–5 year horizon.",
                            related_label="Productivity Improvements"))
    db.add(m.PackageComment(entity_id=dm.id, package_key="future_drivers",
                            author_name="Omar Al Zaabi", author_role="Forecasting Reviewer",
                            body="Regulatory change impact looks material. Please confirm headcount impact estimates.",
                            related_label="Regulatory Changes"))
    # org reviewer comment (screen 07 verbatim)
    db.add(m.PackageComment(entity_id=dm.id, package_key="org_structure",
                            author_name="Maryam Al Zaabi", author_role="Reviewer",
                            body="Please map the remaining sections and ensure all Section Owners are assigned.",
                            related_label=None))
    db.flush()


# ───────────────────────────── quality / validation ─────────────────────────────
RULE_STATS = [
    ("Completeness", 412, 58), ("Consistency", 238, 32), ("Duplicates", 156, 21),
    ("Hierarchy Logic", 142, 18), ("Workforce Logic", 131, 17), ("Workload Logic", 101, 11),
    ("Evidence Checks", 68, 7),
]

# First 8 pinned validation issues (screen 04)
PINNED_ISSUES = [
    ("Missing Mandatory Field", "Dubai Municipality", "High", "current_workforce", 96, "open", "Review"),
    ("Duplicate Job Title", "Roads & Transport Authority", "High", "current_workforce", 92, "open", "Review"),
    ("Hierarchy Logic Violation", "Dubai Health Authority", "Medium", "org_structure", 84, "open", "Review"),
    ("Workload Outlier", "Dubai Electricity & Water Authority", "Medium", "workload_service", 78, "in_progress", "Investigate"),
    ("Inconsistent Data", "Dubai Police", "Medium", "current_workforce", 74, "open", "Review"),
    ("Missing Evidence", "Dubai Culture", "Low", "evidence_documents", 71, "open", "Review"),
    ("Duplicate Job Title", "Land Department", "High", "current_workforce", 91, "open", "Review"),
    ("Evidence Quality - Weak", "Dubai Courts", "Low", "evidence_documents", 69, "in_progress", "Investigate"),
]

PINNED_ANOMALIES = [
    ("Headcount spike of +35% detected in short time period", "Dubai Municipality", "current_workforce", "High", 95),
    ("Workload per employee is 2.4x higher than peer average", "Roads & Transport Authority", "workload_service", "Medium", 87),
    ("Unusual ratio of support roles to total headcount", "Dubai Health Authority", "current_workforce", "Medium", 82),
    ("Large number of part-time roles without workload", "Land Department", "workload_service", "Low", 71),
]


def seed_quality(db: Session, entities: dict[str, m.Entity], users: dict[str, m.User]) -> None:
    for cat, passed, failed in RULE_STATS:
        db.add(m.RuleStat(category=cat, passed=passed, failed=failed))

    def eid(name: str) -> int:
        e = entities.get(name)
        return e.id if e else next(iter(entities.values())).id

    # 8 pinned + 30 generated = 38
    for itype, ent, sev, pkg, conf, status, action in PINNED_ISSUES:
        db.add(m.ValidationIssue(entity_id=eid(ent), package_key=pkg, issue_type=itype, severity=sev,
                                 ai_confidence=conf, status=status, next_action=action,
                                 assigned_to=users["Aisha Khan"].id))
    gen_types = ["Missing Mandatory Field", "Inconsistent Data", "Workload Outlier", "Missing Evidence", "Duplicate Job Title"]
    ent_names = list(entities.keys())
    for i in range(30):
        db.add(m.ValidationIssue(
            entity_id=entities[ent_names[i % len(ent_names)]].id,
            package_key=APPLICABLE_KEYS[i % len(APPLICABLE_KEYS)],
            issue_type=gen_types[i % len(gen_types)],
            severity=["High", "Medium", "Low"][i % 3],
            ai_confidence=68 + (i % 30), status=["open", "in_progress"][i % 2],
            next_action=["Review", "Investigate"][i % 2], assigned_to=None,
        ))

    for title, ent, pkg, sev, conf in PINNED_ANOMALIES:
        db.add(m.Anomaly(entity_id=eid(ent), title=title, detail="", package_key=pkg,
                         severity=sev, confidence=conf, narrative=None))
    db.flush()


# ───────────────────────────── cases & notifications ─────────────────────────────
def seed_cases(db: Session, entities: dict[str, m.Entity], users: dict[str, m.User]) -> None:
    aisha = users["Aisha Khan"]
    fatima = users["Fatima Al Mansoori"]
    dha = entities["Dubai Health Authority"]
    dm = entities["Dubai Municipality"]
    rta = entities["Roads & Transport Authority"]

    # Pinned CLF-2025-00421 (screen 05, verbatim)
    c421 = m.Case(
        ref="CLF-2025-00421", kind="clarification", entity_id=dha.id,
        package_label="Workforce Plan Q2 2025", priority="High", category="FTE Calculation",
        status="open", assigned_to=aisha.id, due_date=TODAY + timedelta(days=6),
        issue_summary="Please clarify FTE calculation for part-time roles in clinical departments.",
        corrections=[
            "Provide methodology used to convert part-time hours to FTE.",
            "Confirm if 37.5 hours/week is used as standard.",
            "Share source or policy reference.",
        ],
    )
    db.add(c421)
    db.flush()
    # entity reply 1.6 days after the DGHR message → "Avg. Response Time 1.6 days"
    msgs = [
        ("dghr", aisha.id, "Please clarify FTE calculation for part-time roles in clinical departments. Refer to DGHR Workforce Data Standard v2.1, Section 4.3.", 4.0),
        ("entity", fatima.id, "We use 37.5 hours/week as standard. Part-time hours are converted proportionally. Reference attached policy document.", 2.4),
        ("dghr", aisha.id, "Thank you. Please also confirm if any roles are excluded from FTE conversion (e.g., contractors, interns).", 2.0),
    ]
    for side, author, body, days_ago in msgs:
        db.add(m.CaseMessage(case_id=c421.id, author_id=author, side=side, body=body,
                             created_at=datetime.utcnow() - timedelta(days=days_ago)))
    audit = [
        ("Clarification created", "Aisha Khan", 3),
        ("Entity acknowledged", "Fatima Al Mansoori", 3),
        ("Entity responded", "Fatima Al Mansoori", 3),
        ("DGHR follow-up", "Aisha Khan", 2),
    ]
    for label, actor, days_ago in audit:
        db.add(m.AuditEvent(case_id=c421.id, entity_id=dha.id, label=label, actor_name=actor,
                            created_at=datetime.utcnow() - timedelta(days=days_ago)))

    # Other pinned cases
    db.add(m.Case(ref="CLF-2025-00419", kind="clarification", entity_id=dm.id,
                  package_label="Workforce Plan Q2 2025", priority="Medium", category="Workforce Data",
                  status="open", assigned_to=aisha.id, due_date=TODAY + timedelta(days=5),
                  issue_summary="Request for headcount breakdown by nationality.", corrections=[]))
    db.add(m.Case(ref="CLF-2025-00412", kind="clarification", entity_id=rta.id,
                  package_label="Workforce Plan Q2 2025", priority="Low", category="Budget",
                  status="open", assigned_to=users["H. Al Qasimi"].id, due_date=TODAY + timedelta(days=8),
                  issue_summary="Provide source for training budget assumptions.", corrections=[]))
    # returns
    db.add(m.Case(ref="RTN-2025-00391", kind="return", entity_id=dha.id, package_label="Workforce Plan Q1 2025",
                  priority="High", category="Workforce Data", status="open", assigned_to=aisha.id,
                  due_date=TODAY + timedelta(days=2), issue_summary="Returned for correction.",
                  corrections=[], returned_on=TODAY - timedelta(days=1)))
    db.add(m.Case(ref="RTN-2025-00377", kind="return", entity_id=dm.id, package_label="Workforce Plan Q1 2025",
                  priority="Medium", category="Org Structure", status="open", assigned_to=users["F. Al Marri"].id,
                  due_date=TODAY + timedelta(days=3), issue_summary="Returned for correction.",
                  corrections=[], returned_on=TODAY - timedelta(days=2)))
    db.add(m.Case(ref="RTN-2025-00355", kind="return", entity_id=entities["Islamic Affairs & Charitable Activities Dept."].id,
                  package_label="Workforce Plan Q1 2025", priority="Low", category="Evidence", status="open",
                  assigned_to=aisha.id, due_date=TODAY + timedelta(days=4),
                  issue_summary="Returned for correction.", corrections=[], returned_on=TODAY - timedelta(days=2)))
    # resolved
    db.add(m.Case(ref="CLF-2025-00310", kind="clarification",
                  entity_id=entities["Education & Knowledge Dept."].id, package_label="Workforce Plan Q1 2025",
                  priority="Medium", category="Workforce Data", status="resolved", assigned_to=aisha.id,
                  due_date=TODAY - timedelta(days=5), issue_summary="Resolved.", corrections=[],
                  resolved_on=TODAY - timedelta(days=1)))

    # Fill to 24 open clarifications + 16 returns (DM already has 2 open: CLF-00419 + RTN-00377 = 2; need 3 total → add 1 more DM open)
    db.add(m.Case(ref="CLF-2025-00430", kind="clarification", entity_id=dm.id,
                  package_label="Workload & Service Data", priority="Medium", category="Workload Data",
                  status="open", assigned_to=users["F. Al Marri"].id, due_date=TODAY + timedelta(days=6),
                  issue_summary="Please provide additional details on workload data for Building Permits service.",
                  corrections=[]))
    db.flush()

    # top up open clarifications to 24 and returns to 16
    open_clf = db.query(m.Case).filter(m.Case.kind == "clarification", m.Case.status == "open").count()
    open_rtn = db.query(m.Case).filter(m.Case.kind == "return", m.Case.status == "open").count()
    ent_pool = [e for n, e in entities.items() if n not in ("Dubai Municipality",)]
    seq = 431
    for i in range(24 - open_clf):
        e = ent_pool[i % len(ent_pool)]
        # First 5 fillers are past-due → "Overdue Responses 5" KPI (screen 05).
        due = TODAY - timedelta(days=(i % 3) + 1) if i < 5 else TODAY + timedelta(days=(i % 7) + 1)
        db.add(m.Case(ref=f"CLF-2025-{seq:05d}", kind="clarification", entity_id=e.id,
                      package_label="Workforce Plan Q2 2025", priority=["High", "Medium", "Low"][i % 3],
                      category="Data Quality", status="open", assigned_to=aisha.id,
                      due_date=due,
                      issue_summary="Please review and clarify submitted data.", corrections=[]))
        seq += 1
    # 16 open returns span exactly 8 distinct entities (tracker "Returned Entities" = 8;
    # clarifications "Returned Submissions" = 16). Pinned 3 (DHA/DM/Islamic Affairs) + 5 more.
    return_pool_names = [
        "Dubai Health Authority", "Dubai Municipality", "Islamic Affairs & Charitable Activities Dept.",
        "Dubai Courts", "Land Department", "Dubai Customs",
        "General Directorate of Residency & Foreigners Affairs", "Dubai Media Incorporated",
    ]
    # DM is excluded from the top-up (its single pinned RTN keeps DM at exactly 3 open cases);
    # the other 7 pool entities carry the remaining returns → still 8 distinct returned entities.
    return_pool = [entities[n] for n in return_pool_names if n in entities and n != "Dubai Municipality"]
    rseq = 392
    for i in range(16 - open_rtn):
        e = return_pool[i % len(return_pool)]
        db.add(m.Case(ref=f"RTN-2025-{rseq:05d}", kind="return", entity_id=e.id,
                      package_label="Workforce Plan Q1 2025", priority=["High", "Medium", "Low"][i % 3],
                      category="Workforce Data", status="open", assigned_to=aisha.id,
                      due_date=TODAY + timedelta(days=(i % 5) + 1),
                      issue_summary="Returned for correction.", corrections=[],
                      returned_on=TODAY - timedelta(days=(i % 3) + 1)))
        rseq += 1
    # resolved this-month counter → add resolved cases up to ~128 total resolved
    for i in range(127):
        e = ent_pool[i % len(ent_pool)]
        db.add(m.Case(ref=f"CLF-2025-{2000 + i:05d}", kind="clarification", entity_id=e.id,
                      package_label="Workforce Plan Q1 2025", priority="Low", category="Resolved",
                      status="resolved", assigned_to=aisha.id, due_date=TODAY - timedelta(days=10),
                      issue_summary="Resolved.", corrections=[], resolved_on=TODAY - timedelta(days=(i % 20) + 1)))
    db.flush()


def seed_notifications_alerts(db: Session, entities: dict[str, m.Entity]) -> None:
    dm = entities["Dubai Municipality"]
    # Alerts (screen 01 — 3 pinned verbatim)
    db.add(m.Alert(severity="danger", title="9 entities have overdue submissions",
                   body="Due dates have passed. Immediate action recommended.",
                   created_at=datetime.utcnow() - timedelta(minutes=10)))
    db.add(m.Alert(severity="warning", title="High missing data in Workload Data",
                   body="25 entities with significant gaps detected by AI.",
                   created_at=datetime.utcnow() - timedelta(hours=1)))
    db.add(m.Alert(severity="info", title="Potential data quality issues detected",
                   body="7 submissions flagged for unusual patterns.",
                   created_at=datetime.utcnow() - timedelta(hours=2)))

    # Entity notifications for DM (screen 06)
    db.add(m.Notification(audience="entity", entity_id=dm.id, kind="clarification",
                          title="Clarification Requested",
                          body="Please provide additional details on workload data for Building Permits service.",
                          created_at=datetime.utcnow() - timedelta(hours=2), read=False))
    db.add(m.Notification(audience="entity", entity_id=dm.id, kind="clarification",
                          title="Clarification Requested",
                          body="Evidence required for Future Demand Drivers section.",
                          created_at=datetime.utcnow() - timedelta(days=1), read=False))
    db.add(m.Notification(audience="entity", entity_id=dm.id, kind="announcement",
                          title="DGHR Announcement",
                          body="Workforce Planning 2025 data collection is now open. Please ensure timely submission.",
                          created_at=datetime.utcnow() - timedelta(days=3), read=True))
    # DGHR notifications (recent status)
    for i, name in enumerate(["Dubai Culture", "Roads & Transport Authority", "Dubai Police"]):
        db.add(m.Notification(audience="dghr", entity_id=entities[name].id, kind="status",
                              title=f"{name} submitted a package",
                              body=f"{name} submitted Current Workforce Data.",
                              created_at=datetime.utcnow() - timedelta(hours=i + 1), read=False))
    db.flush()


# ───────────────────────────── vision preview (§7.6) ─────────────────────────────
def seed_vision(db: Session) -> None:
    metrics = [
        ("current_workforce", "Current Workforce", 2842, None, "FTEs", "supply"),
        ("forecast_demand_fy_plus1", "Forecast Demand (FY27)", 3214, None, "FTEs", "demand"),
        ("workforce_gaps", "Workforce Gaps", 372, None, "FTEs", "gap"),
        ("growth", "Growth", 512, None, "FTEs", "growth_reduction"),
        ("reduction", "Reduction", -140, None, "FTEs", "growth_reduction"),
        ("budget_impact", "Budget Impact (Est.)", None, "AED 1.42B potential", "", "budget"),
        ("evidence_items_total", "Evidence Items", 3456, None, "", "evidence"),
        ("evidence_missing", "Evidence Missing", 684, None, "", "evidence"),
    ]
    for key, label, vnum, vtext, unit, grouping in metrics:
        db.add(m.VisionMetric(key=key, label=label, value_numeric=vnum, value_text=vtext, unit=unit, grouping=grouping))

    skills = [("Data analytics", 128), ("AI / ML", 96), ("Cybersecurity", 74), ("Cloud engineering", 61), ("Change management", 45)]
    for rank, (skill, gap) in enumerate(skills, start=1):
        db.add(m.SkillsGapPreview(skill=skill, gap_fte=gap, rank=rank))

    scenarios = [("baseline", 3214, 1.42, 372), ("high_growth", 3486, 1.58, 486), ("efficiency", 3074, 1.31, 228)]
    for name, hc, cost, gaps in scenarios:
        db.add(m.ScenarioPreview(scenario=name, headcount=hc, cost_aed_b=cost, gaps=gaps))

    quotes = [
        "Entity A shows a 22% increase in administrative roles despite planned automation.",
        "Customer service demand is rising across 7 entities.",
        "Data and AI roles appear under inconsistent job titles.",
        "Five entities may share common new capabilities.",
    ]
    for q in quotes:
        db.add(m.InsightQuote(body=q, tag="cross-entity"))
    db.flush()


def seed_dashboard_stats(db: Session) -> None:
    """Pinned aggregate display stats for screens 03/04 (SPEC §7.4)."""
    rows: list[tuple[str, str, str, int | None, str | None, dict, int]] = [
        # quality header aggregates
        ("quality", "avg_quality_delta", "vs last submission", 6, "+6 pts", {}, 0),
        # Mockup shows aggregate pass rate 86.5% (its own per-category rows actually sum to
        # 88.4% — an inconsistency in the deck; pinned here to replicate the mockup, see C6).
        ("quality", "rules_pass_rate", "of total rules", None, "86.5", {}, 3),
        ("quality", "missing_mandatory", "Missing Mandatory Fields", 126, None, {"entities": 24}, 1),
        ("quality", "duplicate_titles", "Duplicate Job Titles", 37, None, {"entities": 18}, 2),
        # evidence quality overview
        ("quality_evidence", "missing", "Missing Evidence", 126, None, {"entities": 24, "pct": 17.8}, 0),
        ("quality_evidence", "weak", "Weak Evidence", 214, None, {"entities": 31, "pct": 30.2}, 1),
        ("quality_evidence", "acceptable", "Acceptable Evidence", 372, None, {"entities": 42, "pct": 52.6}, 2),
        # top evidence gaps
        ("evidence_gaps", "role_justification", "Role Justification Documents", 86, None, {}, 0),
        ("evidence_gaps", "workload_methodology", "Workload Methodology", 62, None, {}, 1),
        ("evidence_gaps", "org_charts", "Organizational Charts", 38, None, {}, 2),
        # entity: future demand drivers KPIs (screen 10) — not derivable from the 7 driver rows
        ("drivers", "strategic_initiatives", "Strategic Initiatives", 14, None, {}, 0),
        ("drivers", "automation_impacts", "Automation Impacts", 9, None, {}, 1),
        ("drivers", "policy_changes", "Policy Changes", 7, None, {}, 2),
        ("drivers", "outstanding_gaps", "Outstanding Evidence Gaps", 6, None, {}, 3),
        ("drivers", "evidence_coverage", "Evidence Coverage", 72, None, {}, 4),
        # command center: missing data summary (screen 01)
        ("missing_summary", "org_structure", "Org Structure", 18, None, {}, 0),
        ("missing_summary", "workforce_baseline", "Workforce Baseline", 22, None, {}, 1),
        ("missing_summary", "workload_data", "Workload Data", 25, None, {}, 2),
        ("missing_summary", "future_drivers", "Future Drivers", 31, None, {}, 3),
        ("missing_summary", "evidence", "Evidence / Sources", 20, None, {}, 4),
        # tracker: where submissions are blocked
        ("blocked_summary", "missing_evidence", "Missing Evidence / Sources", 16, None, {"pct": 32}, 0),
        ("blocked_summary", "incomplete_workload", "Incomplete Workload Data", 12, None, {"pct": 24}, 1),
        ("blocked_summary", "future_drivers", "Future Drivers Not Provided", 9, None, {"pct": 18}, 2),
        ("blocked_summary", "org_issues", "Org Structure Issues", 7, None, {"pct": 14}, 3),
        ("blocked_summary", "other", "Other / Data Quality", 6, None, {"pct": 12}, 4),
    ]
    for group, key, label, vint, vtext, meta_, pos in rows:
        db.add(m.DashboardStat(group=group, key=key, label=label, value_int=vint,
                               value_text=vtext, meta=meta_, position=pos))
    db.flush()


def seed_app_state(db: Session) -> None:
    trend = [
        {"label": "Apr 28", "value": 8}, {"label": "May 5", "value": 18},
        {"label": "May 12", "value": 30}, {"label": "May 19", "value": 38},
        {"label": "May 26", "value": 46},
    ]
    db.add(m.AppState(id=1, last_updated=datetime.utcnow(), trend_points=trend))
    db.flush()


# ───────────────────────────── entrypoint ─────────────────────────────
def run_seed() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        _reset_tables(db)

        users = seed_users(db)
        entities = seed_entities(db, users)

        # wire entity users to real ids
        dm_e = entities["Dubai Municipality"]
        dha_e = entities["Dubai Health Authority"]
        users["Ahmed Al Mansoori"].entity_id = dm_e.id
        users["Sara Al Mansoori"].entity_id = dm_e.id
        users["Fatima Al Mansoori"].entity_id = dha_e.id
        db.flush()

        cycle, pkgs, section_types = seed_cycle_packages(db)
        seed_entity_packages(db, entities, pkgs)
        seed_job_taxonomy(db)

        seed_dm_org(db, dm_e)
        seed_dm_workforce(db, dm_e)
        seed_dm_workload(db, dm_e)
        seed_dm_drivers_evidence(db, dm_e)

        # Pin quality scores used by the screen-04 quality bars where the entity isn't pinned.
        if "Land Department" in entities:
            entities["Land Department"].quality_score = 68
        db.flush()

        seed_quality(db, entities, users)
        seed_cases(db, entities, users)
        seed_notifications_alerts(db, entities)
        seed_vision(db)
        seed_dashboard_stats(db)
        seed_app_state(db)

        db.commit()
        print("[seed] ✓ canonical scenario seeded")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def seed_if_empty() -> None:
    """Seed only when the DB has no entities yet.

    Used at container startup so author-created data survives restarts. The full
    destructive `run_seed()` stays wired to the manual `POST /api/demo/reset`.
    """
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if db.query(m.Entity).count() > 0:
            print("[seed] data already present — skipping seed (use /api/demo/reset to rebuild)")
            return
    finally:
        db.close()
    run_seed()


if __name__ == "__main__":
    import sys

    if "--if-empty" in sys.argv:
        seed_if_empty()
    else:
        run_seed()

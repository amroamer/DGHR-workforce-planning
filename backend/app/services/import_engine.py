"""Excel/CSV import engine (SPEC §12). Parses uploads, maps job titles to the DGHR
standard taxonomy via rapidfuzz, runs validations, and persists records."""

from __future__ import annotations

import io

import pandas as pd
from rapidfuzz import fuzz, process
from sqlalchemy.orm import Session

from app import models as m

# Case-insensitive header synonyms → canonical column.
HEADER_SYNONYMS = {
    "section": ["section", "department", "org unit", "orgunit", "unit"],
    "job_title": ["job title", "position", "title", "role"],
    "grade": ["grade", "level"],
    "current_fte": ["fte", "current fte", "headcount", "current_fte"],
    "vacancies": ["vacancies", "open positions", "vacancy"],
    "employment_type": ["employment type", "contract type", "employment_type", "type"],
    "critical_role": ["critical", "critical role", "critical_role"],
    "stated_family": ["job family", "family", "job_family"],
}
REQUIRED = ["section", "job_title", "current_fte"]


class ImportError422(Exception):
    def __init__(self, detail: str):
        self.detail = detail


def _read_dataframe(data: bytes, filename: str) -> pd.DataFrame:
    name = filename.lower()
    try:
        if name.endswith(".csv"):
            return pd.read_csv(io.BytesIO(data))
        return pd.read_excel(io.BytesIO(data))  # openpyxl for .xlsx
    except Exception as e:  # noqa: BLE001
        raise ImportError422(f"Could not read file: {e}") from e


def _map_columns(df: pd.DataFrame) -> dict[str, str]:
    lower_cols = {str(c).strip().lower(): c for c in df.columns}
    mapping: dict[str, str] = {}
    for canonical, synonyms in HEADER_SYNONYMS.items():
        for syn in synonyms:
            if syn in lower_cols:
                mapping[canonical] = lower_cols[syn]
                break
    return mapping


def _build_taxonomy(db: Session):
    titles = db.query(m.StandardJobTitle).all()
    families = {f.id: f.name for f in db.query(m.JobFamily).all()}
    exact: dict[str, tuple[str, str]] = {}
    alias: dict[str, tuple[str, str]] = {}
    all_titles: list[str] = []
    title_family: dict[str, str] = {}
    for t in titles:
        fam = families.get(t.family_id, "")
        exact[t.title.lower()] = (t.title, fam)
        title_family[t.title] = fam
        all_titles.append(t.title)
        for a in (t.aliases or []):
            alias[a.lower()] = (t.title, fam)
    return exact, alias, all_titles, title_family


def map_title(raw: str, exact, alias, all_titles, title_family):
    """Return (map_status, mapped_title, family, suggestion, confidence)."""
    key = str(raw).strip().lower()
    if key in exact:
        title, fam = exact[key]
        return "mapped", title, fam, None, 100
    if key in alias:
        title, fam = alias[key]
        return "mapped", title, fam, None, 100
    best = process.extractOne(str(raw), all_titles, scorer=fuzz.token_sort_ratio)
    if not best:
        return "unmapped", None, None, None, 0
    match, score, _ = best
    if score >= 90:
        return "mapped", match, title_family.get(match), None, int(score)
    if score >= 70:
        return "partial", None, None, match, int(score)
    return "unmapped", None, None, None, int(score)


def import_workforce(db: Session, entity_id: int, data: bytes, filename: str, uploaded_by: str = "Sara Al Mansoori") -> dict:
    df = _read_dataframe(data, filename)
    colmap = _map_columns(df)
    missing = [c for c in REQUIRED if c not in colmap]
    if missing:
        pretty = {"section": "Section", "job_title": "Job Title", "current_fte": "FTE"}
        raise ImportError422(
            "Missing required column(s): " + ", ".join(pretty[c] for c in missing)
            + ". Found headers: " + ", ".join(str(c) for c in df.columns)
        )

    exact, alias, all_titles, title_family = _build_taxonomy(db)

    parsed: list[dict] = []
    title_to_families: dict[str, set] = {}
    section_titles: dict[tuple, int] = {}

    for _, row in df.iterrows():
        raw_title = row[colmap["job_title"]]
        if pd.isna(raw_title):
            continue
        section = str(row[colmap["section"]]).strip() if not pd.isna(row[colmap["section"]]) else ""
        status, mapped_title, family, suggestion, conf = map_title(raw_title, exact, alias, all_titles, title_family)

        def _val(key, cast=None, default=None):
            if key not in colmap:
                return default
            v = row[colmap[key]]
            if pd.isna(v):
                return None
            if cast:
                try:
                    return cast(v)
                except (ValueError, TypeError):
                    return None
            return v

        grade = _val("grade", int)
        fte = _val("current_fte", float) or 0.0
        vacancies = _val("vacancies", float) or 0.0
        emp = _val("employment_type", str)
        crit_raw = _val("critical_role", str)
        critical = str(crit_raw).strip().lower() in ("y", "yes", "true", "1") if crit_raw is not None else False

        title_display = mapped_title or str(raw_title).strip()
        stated_family = _val("stated_family", str)
        if family:
            title_to_families.setdefault(title_display, set()).add(family)
        section_titles[(section, title_display)] = section_titles.get((section, title_display), 0) + 1

        parsed.append({
            "section": section, "job_title": title_display, "job_family": family,
            "stated_family": stated_family.strip() if stated_family else None,
            "grade": grade, "current_fte": fte, "vacancies": vacancies,
            "employment_type": emp, "critical_role": critical, "map_status": status,
            "suggestion": suggestion, "confidence": conf,
        })

    # validations
    issues_summary = {"missing_grade": 0, "inconsistent_title": 0, "missing_employment_type": 0, "negative_zero_fte": 0}
    sample_issues: list[dict] = []
    # a title is inconsistent if the same title maps to >1 family across rows, OR the file's
    # stated Job Family disagrees with the standard mapping ("inconsistent job titles").
    inconsistent_titles = {t for t, fams in title_to_families.items() if len(fams) > 1}
    for p in parsed:
        issues = []
        if p["grade"] is None:
            issues.append("missing_grade")
            issues_summary["missing_grade"] += 1
        stated_mismatch = (
            p["map_status"] == "mapped" and p["stated_family"] and p["job_family"]
            and p["stated_family"].lower() != p["job_family"].lower()
        )
        if p["job_title"] in inconsistent_titles or stated_mismatch:
            issues.append("inconsistent_title")
            issues_summary["inconsistent_title"] += 1
        if p["employment_type"] is None:
            issues.append("missing_employment_type")
            issues_summary["missing_employment_type"] += 1
        if p["current_fte"] <= 0:
            issues.append("negative_zero_fte")
            issues_summary["negative_zero_fte"] += 1
        p["issues"] = issues
        if issues and len(sample_issues) < 8:
            sample_issues.append({"section": p["section"], "job_title": p["job_title"], "issues": issues})

    # persist: replace this entity's workforce records
    db.query(m.WorkforceRecord).filter(m.WorkforceRecord.entity_id == entity_id).delete()
    for p in parsed:
        db.add(m.WorkforceRecord(
            entity_id=entity_id, section=p["section"], job_title=p["job_title"], job_family=p["job_family"],
            grade=p["grade"], current_fte=p["current_fte"], vacancies=p["vacancies"],
            employment_type=p["employment_type"], critical_role=p["critical_role"],
            map_status=p["map_status"], issues=p["issues"],
        ))
    db.add(m.Upload(entity_id=entity_id, kind="hr_extract", filename=filename, uploaded_by=uploaded_by,
                    meta={"rows": len(parsed)}))
    db.commit()

    total = len(parsed)
    mapped = sum(1 for p in parsed if p["map_status"] == "mapped")
    partial = sum(1 for p in parsed if p["map_status"] == "partial")
    unmapped = sum(1 for p in parsed if p["map_status"] == "unmapped")
    pct = lambda n: round(n / total * 100, 1) if total else 0  # noqa: E731
    return {
        "imported": total,
        "mapped": {"count": mapped, "pct": pct(mapped)},
        "partial": {"count": partial, "pct": pct(partial)},
        "unmapped": {"count": unmapped, "pct": pct(unmapped)},
        "issues_summary": issues_summary,
        "sample_issues": sample_issues,
    }


# ─────────────────────────── org / workload imports (simpler) ───────────────────────────
def import_org_structure(db: Session, entity_id: int, data: bytes, filename: str) -> dict:
    df = _read_dataframe(data, filename)
    lower = {str(c).strip().lower(): c for c in df.columns}
    def col(*names):
        for n in names:
            if n in lower:
                return lower[n]
        return None
    c_sector, c_dept, c_sec = col("sector"), col("department", "dept"), col("section", "section name")
    if not (c_sector and c_dept and c_sec):
        raise ImportError422("Missing required column(s): Sector, Department, Section.")
    c_owner, c_hr, c_scope, c_emp = col("section owner", "owner"), col("hr focal point", "hr focal"), col("in scope", "in_scope"), col("employee count", "employees")
    n = 0
    for _, row in df.iterrows():
        if pd.isna(row[c_sec]):
            continue
        owner = None if not c_owner or pd.isna(row[c_owner]) else str(row[c_owner])
        db.add(m.OrgSection(
            entity_id=entity_id, sector=str(row[c_sector]), department=str(row[c_dept]), name=str(row[c_sec]),
            owner_name=owner, owner_initials=("".join(w[0] for w in owner.split()[:2]) if owner else None),
            hr_focal_point=(None if not c_hr or pd.isna(row[c_hr]) else str(row[c_hr])),
            in_scope=(True if not c_scope or str(row[c_scope]).strip().lower() in ("yes", "true", "1") else False),
            employee_count=(None if not c_emp or pd.isna(row[c_emp]) else int(row[c_emp])),
            status="mapped" if owner else "unmapped",
        ))
        n += 1
    db.commit()
    return {"imported": n}


def import_workload(db: Session, entity_id: int, data: bytes, filename: str) -> dict:
    df = _read_dataframe(data, filename)
    lower = {str(c).strip().lower(): c for c in df.columns}
    def col(*names):
        for n in names:
            if n in lower:
                return lower[n]
        return None
    c_sec, c_metric, c_vol = col("section"), col("key metric", "metric"), col("current volume", "volume")
    if not (c_sec and c_metric):
        raise ImportError422("Missing required column(s): Section, Key Metric.")
    updated = 0
    for _, row in df.iterrows():
        sec = db.query(m.WorkloadSection).filter(
            m.WorkloadSection.entity_id == entity_id, m.WorkloadSection.name == str(row[c_sec])
        ).first()
        if sec and c_vol and not pd.isna(row[c_vol]):
            sec.current_volume = int(row[c_vol])
            sec.status = "complete"
            updated += 1
    db.commit()
    return {"updated": updated}


# ─────────────────────────── template generation ───────────────────────────
def workforce_template() -> bytes:
    from openpyxl import Workbook
    wb = Workbook()
    ws = wb.active
    ws.title = "Workforce"
    headers = ["Section", "Job Title", "Grade", "Current FTE", "Vacancies", "Employment Type", "Critical Role"]
    ws.append(headers)
    ws.append(["Human Resources", "HR Business Partner", 9, 4.0, 1.0, "Permanent", "Yes"])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def org_template() -> bytes:
    from openpyxl import Workbook
    wb = Workbook()
    ws = wb.active
    ws.title = "Org Structure"
    ws.append(["Sector", "Department", "Section", "Section Owner", "HR Focal Point", "In Scope", "Employee Count"])
    ws.append(["Government Enablement Sector", "People Enablement Department", "Workforce Planning Section", "Aisha Al Hashmi", "Omar Al Marri", "Yes", 38])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()

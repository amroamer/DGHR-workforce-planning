"""Generate the live-demo assets (SPEC §12):
  · HR_Extract_Demo.xlsx — ~1,248 rows engineered so the import engine reports
    ≈95.1% mapped (1,187) / 2.7% partial (34) / 2.2% unmapped (27) and issue counts
    18 missing grade · 12 inconsistent · 5 missing employment type · 2 zero-FTE.
  · 5 small evidence PDFs named per screen 10.

Run inside the backend container:
  docker compose exec backend python /app/../demo-assets/generate_demo_files.py
or standalone with PYTHONPATH pointing at backend/.
"""

from __future__ import annotations

import os
import sys

# allow importing the seed taxonomy
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from openpyxl import Workbook  # noqa: E402
from rapidfuzz import fuzz, process  # noqa: E402
from app.seed import JOB_TAXONOMY  # noqa: E402

OUT_DIR = os.path.dirname(__file__)
EVIDENCE_DIR = os.path.join(OUT_DIR, "evidence")

# (title, family) pairs and the flat title list for fuzzy scoring
PAIRS = [(t, fam) for fam, titles in JOB_TAXONOMY.items() for t in titles]
ALL_TITLES = [t for t, _f in PAIRS]
FAMILIES = list(JOB_TAXONOMY.keys())


def status_of(raw: str) -> str:
    if raw in ALL_TITLES:
        return "mapped"
    match, score, _ = process.extractOne(raw, ALL_TITLES, scorer=fuzz.token_sort_ratio)
    if score >= 90:
        return "mapped"
    if score >= 70:
        return "partial"
    return "unmapped"


SECTIONS = ["Corporate Strategy", "Human Resources", "Finance", "Information Technology",
            "Customer Service", "Inspection & Compliance", "Legal Affairs", "Operations",
            "Communications", "Facilities Management"]

# candidate partial variants (aim: 70–89 fuzzy) — pick exactly 34 that classify as partial
PARTIAL_CANDIDATES = []
for t, _f in PAIRS:
    for prefix in ("Senior", "Junior", "Lead", "Assistant", "Principal"):
        PARTIAL_CANDIDATES.append(f"{prefix} {t}")

# unmapped candidates (< 70) — Dubai-flavoured + generic unknowns; pick exactly 27
UNMAPPED_CANDIDATES = [
    "Falconry Specialist", "Camel Racing Coordinator", "Pearl Diving Inspector", "Majlis Coordinator",
    "Heritage Village Curator", "Desert Safari Marshal", "Dhow Fleet Supervisor", "Oud Performer",
    "Astronomer", "Meteorology Observer", "Marine Biologist", "Aquarium Keeper", "Zoologist",
    "Cartographer", "Archivist", "Librarian", "Museum Docent", "Botanist", "Geologist",
    "Seismologist", "Volcanologist", "Numismatist", "Philatelist", "Horologist", "Sommelier",
    "Calligrapher", "Perfumer", "Puppeteer", "Cosmonaut", "Lighthouse Keeper",
]


def pick(candidates, target_status, n):
    out = []
    for c in candidates:
        if status_of(c) == target_status:
            out.append(c)
        if len(out) == n:
            break
    if len(out) < n:
        raise SystemExit(f"Only found {len(out)}/{n} candidates for {target_status}")
    return out


def build_workbook() -> None:
    partials = pick(PARTIAL_CANDIDATES, "partial", 34)
    unmapped = pick(UNMAPPED_CANDIDATES, "unmapped", 27)

    wb = Workbook()
    ws = wb.active
    ws.title = "Workforce"
    ws.append(["Section", "Job Title", "Job Family", "Grade", "Current FTE", "Vacancies", "Employment Type", "Critical Role"])

    rows = []
    # 1,187 mapped rows (indices 0..1186)
    for i in range(1187):
        title, family = PAIRS[i % len(PAIRS)]
        section = SECTIONS[i % len(SECTIONS)]
        grade = 5 + (i % 9)
        fte = 1.0 + (i % 4)
        emp = ["Permanent", "Permanent", "Contract", "Part-time"][i % 4]
        stated_family = family
        # issue injection (disjoint blocks, all within mapped rows)
        if i < 18:                       # 18 missing grade
            grade = ""
        elif i < 30:                     # 12 inconsistent → wrong stated family
            stated_family = FAMILIES[(FAMILIES.index(family) + 3) % len(FAMILIES)]
        elif i < 35:                     # 5 missing employment type
            emp = ""
        elif i < 37:                     # 2 zero FTE
            fte = 0
        rows.append([section, title, stated_family, grade, fte, i % 3, emp, "Yes" if i % 7 == 0 else "No"])

    for j, t in enumerate(partials):     # 34 partial
        rows.append([SECTIONS[j % len(SECTIONS)], t, "", 6 + (j % 8), 2.0, 0, "Permanent", "No"])
    for j, t in enumerate(unmapped):     # 27 unmapped
        rows.append([SECTIONS[j % len(SECTIONS)], t, "", 5 + (j % 9), 1.0, 0, "Contract", "No"])

    for r in rows:
        ws.append(r)
    path = os.path.join(OUT_DIR, "HR_Extract_Demo.xlsx")
    wb.save(path)
    print(f"[demo] wrote {path} — {len(rows)} rows "
          f"(mapped 1187, partial {len(partials)}, unmapped {len(unmapped)})")


def build_evidence() -> None:
    os.makedirs(EVIDENCE_DIR, exist_ok=True)
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.pdfgen import canvas
    except ImportError:
        print("[demo] reportlab not available — skipping evidence PDFs")
        return
    docs = [
        ("Smart Government Enablement Program 2025-2027.pdf", "Smart Government Enablement Program 2025–2027", "Strategic initiative roadmap and workforce implications."),
        ("AI Adoption Roadmap 2025.pdf", "AI Adoption Roadmap 2025", "AI assistants for case handling and document processing."),
        ("UAE Labor Law Update 2025.pdf", "UAE Labour Law Update 2025", "Regulatory changes and compliance mandates."),
        ("Citizen Demand Projections.pdf", "Citizen Demand Projections", "Population growth and service-demand projections."),
        ("Workforce Impact Model.pdf", "Workforce Impact Model", "Assumptions converting demand drivers into FTE impact."),
    ]
    for fname, title, subtitle in docs:
        c = canvas.Canvas(os.path.join(EVIDENCE_DIR, fname), pagesize=A4)
        c.setFont("Helvetica-Bold", 18)
        c.drawString(72, 760, title)
        c.setFont("Helvetica", 12)
        c.drawString(72, 735, subtitle)
        c.drawString(72, 700, "Dubai Government — Workforce Planning Evidence (demo document).")
        c.save()
    print(f"[demo] wrote {len(docs)} evidence PDFs to {EVIDENCE_DIR}")


if __name__ == "__main__":
    build_workbook()
    build_evidence()

"""Illustrative labour-market / education reference data for the Demand & Supply analysis tabs.

This is the ONE place in the seed that is not derived from entity submissions. It exists because the
executive dashboards show panels the platform does not collect, skill trends, hiring companies,
graduate mix, universities, global hotspots. Kept in its own table (`market_reference`) and every
panel built on it is labelled "Illustrative reference" in the UI, so it can never be mistaken for
collected data. Dubai/UAE-relevant, deliberately NOT Abu-Dhabi (per the figma-free-export reference).

Idempotent: seeds only when the table is empty, so a re-seed leaves any edits alone.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app import models as m

# (kind, bucket, label, value_numeric, value_text, pct_change, rank, scope, meta)
_ROWS: list[dict] = []


def _add(kind, label, *, bucket="", value=None, text=None, pct=None, rank=0, scope="", meta=None):
    _ROWS.append(dict(kind=kind, bucket=bucket, label=label, value_numeric=value, value_text=text,
                      pct_change=pct, rank=rank, scope=scope, meta=meta or {}))


# ── skills (Demand → Jobs & Skills) ──
for r, (name, pct) in enumerate([("Data governance", 120.0), ("AI & machine learning", 112.0),
                                 ("Cloud engineering", 88.0), ("Cybersecurity", 74.0),
                                 ("Service design", 65.0)], 1):
    _add("skill_growing", name, pct=pct, rank=r)
for r, (name, pct) in enumerate([("Manual data entry", -31.0), ("Legacy reporting", -15.0),
                                 ("Paper case handling", -100.0), ("Basic bookkeeping", -66.0),
                                 ("Physical filing", -45.0)], 1):
    _add("skill_declining", name, pct=pct, rank=r)
for r, (name, pct) in enumerate([("Power BI", 120.0), ("Process automation", 112.0),
                                 ("Data storytelling", 96.0), ("Arabic NLP", 74.0),
                                 ("GovTech APIs", 65.0)], 1):
    _add("skill_breakout", name, pct=pct, rank=r)

# ── adjacent / transition roles ──
for r, (name, state) in enumerate([("Data Analyst → Data Steward", "In demand"),
                                   ("Call Agent → Service Designer", "In demand"),
                                   ("Clerk → Process Analyst", "Transition"),
                                   ("Inspector → Risk Analyst", "In demand")], 1):
    _add("adjacent_job", name, text=state, rank=r)

# ── notable specific roles layered onto the growing/declining signal ──
for r, (name, pct) in enumerate([("Digital service designer", 124.0), ("Data governance lead", 97.0),
                                 ("Automation engineer", 84.0)], 1):
    _add("notable_role", name, pct=pct, rank=r, text="Growing")
for r, (name, pct) in enumerate([("Records clerk", -70.0), ("Manual reconciler", -64.0)], 1):
    _add("notable_role", name, pct=pct, rank=r + 3, text="Declining")

# ── graduates (Supply → Graduate Analysis) ──
_add("graduates", "New graduates (annual)", bucket="new_graduates", value=8600)
_add("graduates", "Total graduate pool", bucket="total_graduates", value=41000)

for r, (name, pct) in enumerate([("Master's & above", 15.0), ("Bachelor's", 61.0),
                                 ("Diploma / High school", 18.0), ("Other", 6.0)], 1):
    _add("education_level", name, bucket=name.split()[0].lower(), pct=pct, rank=r)

for name, pct in [("Business & Administration", 42.0), ("ICT", 19.0),
                  ("Engineering & Construction", 14.0), ("Social Sciences", 12.0), ("Other", 13.0)]:
    _add("education_background", name, pct=pct)

for r, (name, grads) in enumerate([("Management & Administration", 2020),
                                   ("Database & Network Administration", 1190),
                                   ("Accounting & Taxation", 980),
                                   ("Finance & Banking", 760),
                                   ("Software Development", 560)], 1):
    _add("university_major", name, value=grads, rank=r)

_add("grad_gender", "Female", bucket="female", pct=62.0)
_add("grad_gender", "Male", bucket="male", pct=38.0)

for r, (name, emirate) in enumerate([("United Arab Emirates University", "Al Ain"),
                                     ("Zayed University", "Dubai"),
                                     ("University of Dubai", "Dubai"),
                                     ("American University in Dubai", "Dubai"),
                                     ("Khalifa University", "Abu Dhabi")], 1):
    _add("university", name, text=emirate, rank=r, scope="local")
for r, (name, region) in enumerate([("Imperial College London", "Western Europe"),
                                    ("NUS Singapore", "Asia-Pacific"),
                                    ("MIT", "North America"),
                                    ("ETH Zurich", "Western Europe"),
                                    ("University of Toronto", "North America")], 1):
    _add("university", name, text=region, rank=r, scope="global")

for r, (name, region) in enumerate([("London", "Western Europe"), ("Singapore", "Asia-Pacific"),
                                    ("New York", "North America"), ("Riyadh", "GCC"),
                                    ("Bengaluru", "Asia-Pacific")], 1):
    _add("global_hotspot", name, text=region, rank=r)


def seed_market_reference(db: Session) -> int:
    if db.query(m.MarketReference).count() > 0:
        return 0
    for row in _ROWS:
        db.add(m.MarketReference(**row))
    db.commit()
    return len(_ROWS)

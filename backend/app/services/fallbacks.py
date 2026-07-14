"""Deterministic canned AI outputs (SPEC §13). The demo is indistinguishable offline.
Voice: a workforce-planning analyst who challenges respectfully — specific, cross-entity,
evidence-seeking, work-first-not-headcount-first (APPLICATION_CONTEXT §10/§11)."""

from __future__ import annotations


def driver_summary(entity_name: str, drivers: list[dict], evidence_coverage: int, gaps: int) -> str:
    high = [d["category"] for d in drivers if d.get("impact") == "High"]
    high_txt = ", ".join(high[:3]) if high else "digital and automation initiatives"
    return (
        f"{entity_name}'s demand outlook is shaped by three converging forces. First, {high_txt} "
        f"point to a skill shift rather than pure headcount growth: routine processing capacity should "
        f"decline over the next 0–2 years while demand for data, integration, and oversight roles rises. "
        f"Second, regulatory and population drivers create genuine new workload that automation is unlikely "
        f"to absorb alone, concentrated in customer-facing and compliance functions. Third, productivity "
        f"initiatives remain early and under-evidenced. Evidence coverage stands at {evidence_coverage}% with "
        f"{gaps} outstanding gaps — most critically around the productivity-improvement assumptions for the "
        f"1–5 year horizon and the headcount impact of regulatory change. Recommended next steps: "
        f"(1) attach quantified benefit cases for each high-impact automation driver before submission, and "
        f"(2) reconcile the population-growth projection against actual service volumes so demand is "
        f"workload-driven, not opinion-driven. On balance, the section-level picture suggests targeted "
        f"capability change with modest net FTE growth — not across-the-board expansion."
    )


_ANOMALY = {
    "headcount spike": (
        "shows a +35% headcount increase over a short window that is not matched by any corresponding rise in "
        "workload volume or a new mandate. A jump of this size usually signals either a reclassification or "
        "data-quality artefact, or a genuine expansion that should be evidence-backed before it enters the baseline.",
        ["Reconcile the headcount delta against service-volume trends for the same period.",
         "Confirm no duplicate records or contractor-to-permanent reclassification inflated the count."],
    ),
    "workload per employee": (
        "reports workload per employee 2.4× higher than the peer-group average for comparable sections. Either "
        "this section is genuinely under-resourced, or the workload metric is being counted differently than peers. "
        "This is worth resolving before any FTE request is accepted as it materially changes the demand case.",
        ["Normalise the workload definition against peer sections delivering the same service.",
         "Check whether temporary backlog is being reported as steady-state demand."],
    ),
    "support roles": (
        "has an unusually high ratio of support roles to total headcount relative to similar entities. Support-heavy "
        "structures can indicate duplicated functions or an opportunity for shared services rather than net new demand.",
        ["Map support roles against the services they enable to test for duplication.",
         "Compare the ratio to entities of similar size and mandate."],
    ),
    "part-time roles": (
        "records a large number of part-time roles with no associated workload data. Without workload evidence these "
        "roles cannot be converted into a defensible FTE demand figure, and may reflect incomplete submission rather "
        "than genuine demand.",
        ["Request the workload metrics that justify each part-time role.",
         "Confirm the FTE-conversion methodology for part-time hours."],
    ),
}


def anomaly_narrative(entity_name: str, title: str) -> str:
    key = next((k for k in _ANOMALY if k in title.lower()), None)
    if key:
        body, checks = _ANOMALY[key]
        return f"{entity_name} {body}\n\nRecommended checks:\n• {checks[0]}\n• {checks[1]}"
    return (
        f"{entity_name}'s submission shows a pattern that diverges from peer sections and its own historical trend. "
        f"It is worth challenging whether this reflects a genuine demand driver or a data-quality issue before it is "
        f"accepted into the baseline.\n\nRecommended checks:\n"
        f"• Reconcile the flagged metric against workload and strategy for the same period.\n"
        f"• Compare against similar sections delivering the same service."
    )

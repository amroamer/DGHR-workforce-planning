"""Deterministic canned AI outputs (SPEC §13). The demo is indistinguishable offline.
Voice: a workforce-planning analyst who challenges respectfully, specific, cross-entity,
evidence-seeking, work-first-not-headcount-first (APPLICATION_CONTEXT §10/§11)."""

from __future__ import annotations


def driver_summary(entity_name: str, drivers: list[dict], evidence_coverage: int, gaps: int) -> str:
    high = [d["category"] for d in drivers if d.get("impact") == "High"]
    high_txt = ", ".join(high[:3]) if high else "digital and automation initiatives"
    return (
        f"{entity_name}'s demand outlook is shaped by three converging forces. First, {high_txt} "
        f"point to a skill shift rather than pure headcount growth: routine processing capacity should "
        f"decline over the next 0-2 years while demand for data, integration, and oversight roles rises. "
        f"Second, regulatory and population drivers create genuine new workload that automation is unlikely "
        f"to absorb alone, concentrated in customer-facing and compliance functions. Third, productivity "
        f"initiatives remain early and under-evidenced. Evidence coverage stands at {evidence_coverage}% with "
        f"{gaps} outstanding gaps, most critically around the productivity-improvement assumptions for the "
        f"1-5 year horizon and the headcount impact of regulatory change. Recommended next steps: "
        f"(1) attach quantified benefit cases for each high-impact automation driver before submission, and "
        f"(2) reconcile the population-growth projection against actual service volumes so demand is "
        f"workload-driven, not opinion-driven. On balance, the section-level picture suggests targeted "
        f"capability change with modest net FTE growth, not across-the-board expansion."
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


def report_narrative(facts: dict) -> str:
    """Executive summary for the entity / government-wide report. Deterministic, but every figure
    is interpolated from the computed aggregates passed in — nothing here invents a number."""
    name = facts["name"]
    total, received = facts["departments_total"], facts["received"]
    gap = facts["gap"]
    parts: list[str] = []

    outstanding = total - received
    coverage = (
        f"{name} is built from {received} of {total} department submissions"
        + (f"; {outstanding} still to come, so read the totals as a floor, not the final position."
           if outstanding > 0 else ", full coverage, so the totals below are the complete position.")
    )
    parts.append(coverage)

    if gap < 0:
        headline = (
            f"The work as evidenced needs {facts['required_fte']} FTE against {facts['current_fte']} available"
            f", a shortfall of {abs(gap)} FTE. Before that becomes a hiring case, the driver volumes behind it "
            f"deserve one more challenge: a gap is only as defensible as the workload evidence under it."
        )
    elif gap > 0:
        headline = (
            f"Available capacity stands at {facts['current_fte']} FTE against a sized requirement of "
            f"{facts['required_fte']}, a surplus of {gap} FTE. That is redeployment capacity, not slack: "
            f"the question to put to each surplus area is where that time should move, not whether it exists."
        )
    else:
        headline = (
            f"Available capacity of {facts['current_fte']} FTE currently matches the sized requirement, "
            f"balance today, which makes the forward trajectory the number to watch."
        )
    parts.append(headline)

    short, surplus = facts.get("top_shortage") or [], facts.get("top_surplus") or []
    if short and surplus:
        parts.append(
            f"Pressure concentrates in {_and_list([s['name'] for s in short])}, while "
            f"{_and_list([s['name'] for s in surplus])} carry surplus, a redeployment conversation "
            f"worth having before any net growth is approved."
        )
    elif short:
        parts.append(f"The shortfall concentrates in {_and_list([s['name'] for s in short])}.")
    elif surplus:
        parts.append(f"The surplus concentrates in {_and_list([s['name'] for s in surplus])}.")

    if facts.get("has_hc"):
        parts.append(
            f"The submitted workforce counts {facts['headcount']:,} people at "
            f"{facts['emiratization_pct']}% Emiratization."
        )

    if facts.get("end_year") is not None:
        end_gap = facts["end_gap"]
        trend = "widens to" if end_gap < min(gap, 0) else "moves to"
        parts.append(
            f"On each department's own forecasts, the gap {trend} {end_gap:+g} FTE by {facts['end_year']} "
            f"({facts['horizon_years']}-year rule-based projection, not a black-box forecast), "
            f"so the decisions above are best taken against that trajectory, not this year's snapshot."
        )

    return " ".join(parts)


def ask_data(question: str, pack: dict) -> str:
    """Deterministic intent router for the ask-the-data chat, over the government-wide OR one entity's
    pack (both carry the same unit_word / units / totals / … shape). Keyword-matches the question to a
    slice and answers from real figures — never conversational, but never wrong and always responsive."""
    q = question.lower()
    t = pack["totals"]
    hc = pack["human_capital"]
    cov = pack["coverage"]
    word = pack.get("unit_word", "entity")                 # "entity" (gov) or "department" (entity scope)
    scope_txt = "Government-wide" if pack.get("scope") == "gov" else "Across your departments"
    units = pack.get("units") or []                        # worst gap first
    short = [u for u in units if u["gap"] < 0]
    surplus = sorted((u for u in units if u["gap"] > 0), key=lambda u: -u["gap"])

    def _units(rows, n=3):
        return _and_list([f"{u['name']} ({u['gap']:+g})" for u in rows[:n]])

    if any(w in q for w in ("surplus", "redeploy", "over-resourced", "overstaffed", "spare")):
        if not surplus:
            return f"No counted {word} currently shows a surplus, every one is at or below its sized requirement."
        return (f"{len(surplus)} {word}{'s' if len(surplus) != 1 else ''} carr{'y' if len(surplus) != 1 else 'ies'} "
                f"a surplus, led by {_units(surplus)}. That is redeployment capacity to weigh before approving net growth elsewhere.")
    if "emirat" in q:
        return (f"Emiratization stands at {hc['emiratization_pct']}% across {hc['headcount']:,} submitted people. "
                "The job-level breakdown sits on the Human Capital panel.")
    if any(w in q for w in ("cost", "salary", "budget", "aed", "spend", "wage")):
        return f"The submitted workforce carries an annual cost of AED {int(hc['annual_cost_aed']):,} across {hc['headcount']:,} people."
    if any(w in q for w in ("headcount", "people", "employees", "staff", "how many")):
        return f"The counted submissions cover {hc['headcount']:,} people at {hc['emiratization_pct']}% Emiratization."
    if any(w in q for w in ("coverage", "submitted", "received", "progress", "complete", "outstanding")):
        total, recv = cov["departments_total"] or 0, cov["departments_received"] or 0
        out = total - recv
        base = f"{recv} of {total} departments have been received ({cov['departments_approved']} approved)"
        return (f"{base}, {out} still outstanding; read the totals as a floor until coverage is complete."
                if out > 0 else f"{base}, full coverage, so the totals are the complete position.")
    if pack.get("open_clarifications") is not None and any(w in q for w in ("clarification", "query", "queried", "awaiting", "pending")):
        n = pack["open_clarifications"]
        return (f"There {'is' if n == 1 else 'are'} {n} open DGHR clarification{'s' if n != 1 else ''} outstanding government-wide."
                if n else "No DGHR clarifications are currently open.")
    if any(w in q for w in ("project", "forecast", "trajectory", "future", "trend", "year", "outlook", "2030")):
        p = pack["projection"]
        if not p:
            return "There isn't enough submitted forecast data to project a trajectory yet."
        return (f"On each department's own forecasts, the gap moves to {p['end_gap']:+g} FTE by {p['end_year']}, "
                f"a {p['horizon_years']}-year rule-based projection, not a black-box forecast.")
    if pack.get("by_typeset") and any(w in q for w in ("typeset", "type of work", "family", "kind of")):
        bt = sorted(pack["by_typeset"], key=lambda x: x["gap"])[:3]
        return "By type of work, the largest gaps sit in " + _and_list([f"{x['typeset']} ({x['gap']:+g})" for x in bt]) + "."
    # default: the gap / biggest / worst / which-unit family, and anything unrecognised
    if not short:
        return (f"{scope_txt}, available capacity of {t['available_fte']} FTE "
                f"{'matches' if t['gap'] == 0 else 'exceeds'} the sized requirement of {t['required_fte']} FTE "
                f"(gap {t['gap']:+g}). Ask about a specific {word}, Emiratization, cost, or the projection for more.")
    return (f"{scope_txt}, the work needs {t['required_fte']} FTE against {t['available_fte']} available, "
            f"a shortfall of {abs(t['gap']):g} FTE, concentrated in {_units(short)}.")


def review_brief(facts: dict) -> dict:
    """Deterministic reviewer's brief — summary, risks and first checks, every one derived from
    the computed facts. The live model says it better; it can never say it differently."""
    gap = facts["gap"]
    rv = facts["review"]

    # ── summary ──
    s: list[str] = [
        f"{facts['department']} ({facts['entity']}, {facts['typeset'] or 'no typeset'}) v{facts['version']} "
        f"sizes to {facts['required_fte']} FTE against {facts['available_fte']} available, "
        f"{'a shortfall of ' + f'{abs(gap):g}' if gap < 0 else 'a surplus of ' + f'{gap:g}' if gap > 0 else 'in balance'}."
    ]
    if facts.get("peer_median_required") is not None:
        n = len(facts["peers"])
        side = "above" if facts["required_fte"] > facts["peer_median_required"] else "below"
        s.append(f"Against {n} same-typeset peer department{'s' if n != 1 else ''} "
                 f"(median required {facts['peer_median_required']:g} FTE), this sits {side} the median.")
    ch = facts.get("changes_from_previous")
    s.append(f"v{ch['to_version']} changes {ch['count']} element value{'s' if ch['count'] != 1 else ''} from v{ch['from_version']}."
             if ch else "This is the first version, nothing earlier to compare against.")
    s.append(f"Review stands at {rv['approved']} of {rv['total']} elements approved, "
             f"{rv['queried']} queried, {rv['undecided']} still to look at.")

    # ── risks, each grounded in a computed fact ──
    risks: list[dict] = [{"title": f, "detail": "Raised by the sizing engine on this version."}
                         for f in facts.get("flags") or []]
    unsourced = [d["name"] for d in facts["drivers"] if not d["has_source"]]
    if unsourced:
        risks.append({"title": f"{len(unsourced)} driver{'s' if len(unsourced) != 1 else ''} with no recorded source",
                      "detail": f"{_and_list(unsourced[:3])}: a volume with no source system behind it is assertion, not evidence."})
    unforecast = [d["name"] for d in facts["drivers"] if not d["forecast_stated"]]
    if unforecast:
        risks.append({"title": "Forecast not stated", "detail":
                      f"{_and_list(unforecast[:3])} carr{'y' if len(unforecast) != 1 else 'ies'} no forward forecast: flat is an assumption, not a statement."})
    for o in facts.get("mpu_outliers") or []:
        risks.append({"title": f"{o['driver']}: handling time well above peers",
                      "detail": f"{o['minutes_per_unit']:g} minutes per {o['unit'].rstrip('/yr')} vs a peer median of "
                                f"{o['peer_median']:g}, worth asking how the time is measured before the FTE stands."})
    for c in facts.get("open_clarifications") or []:
        if c["level"] in ("overdue", "escalated"):
            risks.append({"title": f"Clarification on {c['element']} unanswered {c['days_open']}d",
                          "detail": "Past SLA: chase or escalate before this version moves."})

    # ── what to check first: most material FTE first, then whatever is already contested ──
    checks: list[str] = []
    top = sorted(facts["drivers"], key=lambda d: -(d["fte"] or 0))[:2]
    for i, t in enumerate(top):
        rank = "the largest single claim" if i == 0 else "the second-largest claim"
        checks.append(f"{t['name']}: {t['volume']:,.0f} {t['unit']} → {t['fte']} FTE, {rank}; verify volume source and handling time.")
    for q in (facts.get("queried_elements") or [])[:2]:
        checks.append(f"{q}: already queried, confirm the answer closes the question before approving.")
    if facts.get("mandates") and len(checks) < 4:
        f0 = facts["mandates"][0]
        checks.append(f"Statutory floor {f0['positions']} × {f0['role']}: confirm the cited legal basis fixes a minimum on duty.")

    return {"summary": " ".join(s), "risks": risks, "checks": checks[:4]}


def draft_clarification(direction: str, element_type: str, element_label: str,
                        ctx: dict, question: str) -> str:
    """Template drafts built from the element's actual submitted figures. Where the record can't
    supply a fact (a source name, a legal article) the draft carries a [bracketed placeholder]
    for the author to fill — a canned draft must never fabricate evidence."""
    d, f = ctx.get("driver"), ctx.get("mandate")
    if direction == "reply":
        if d:
            src = d["source"] or "[name the source system]"
            mpu = d.get("minutes_per_unit")
            return (
                f"The {d['name']} volume of {d['volume']:,.0f} {d['unit']} is drawn from {src} for the last "
                f"12 months{f', and the {mpu:g} minutes per unit is our measured end-to-end handling time' if mpu else ''}. "
                f"The forecast of {d['forecast']:,.0f} reflects [state the growth assumption and its basis]. "
                f"The supporting extract is attached under Documents."
            )
        if f:
            basis = f["legal_basis"] or "[cite the law/article]"
            return (
                f"The floor of {f['positions']} × {f['role']} is fixed by {basis}. It is a minimum-on-duty "
                f"requirement, not a target; the roster evidence showing the minimum is attached."
            )
        head = f"Regarding “{question.strip()}”: " if question.strip() else ""
        return (
            f"{head}[set out the basis for the figure, naming the source system and period]. The submission "
            f"currently sizes to {ctx['required_fte']} FTE required against {ctx['available_fte']} available; "
            f"the evidence supporting this is attached under Documents."
        )

    # direction == "question" — the DGHR reviewer asking the entity
    if d:
        mpu = d.get("minutes_per_unit")
        src = f" recorded against source “{d['source']}”" if d["source"] else ", with no source recorded"
        return (
            f"{d['name']}: the volume of {d['volume']:,.0f} {d['unit']}{src} sizes to {d['fte']} FTE"
            f"{f' at {mpu:g} minutes per unit' if mpu else ''}. Please confirm the source system behind the "
            f"volume and the basis for the handling time, and attach the evidence supporting "
            f"{d['forecast']:,.0f} as the forward forecast."
        )
    if f:
        cited = f" cites “{f['legal_basis']}”" if f["legal_basis"] else " cites no legal basis"
        return (
            f"The statutory floor of {f['positions']} × {f['role']}{cited}. Please cite the specific article "
            f"fixing this minimum and confirm it requires positions on duty rather than a service-level target."
        )
    if element_type == "notes":
        return ("On the entity note: which of the points in it change the sized requirement, and by how much? "
                "Please quantify anything intended to affect the figure, a note DGHR can't size against is context, not evidence.")
    if element_type == "profile":
        return ("Please confirm the workforce profile reconciles with the establishment: headcount, FTE and "
                "Emiratization by job level, and the basis for any level where FTE is well below headcount.")
    if element_type == "supply":
        return ("Please confirm each secondment/adjustment entry: its dates, whether it counts in supply, and "
                "the receiving department, the available-FTE figure moves with each of these.")
    flags = "; ".join(ctx.get("flags") or [])
    flagged = f" The engine flagged: {flags}." if flags else ""
    return (
        f"The submission sizes to {ctx['required_fte']} FTE required against {ctx['available_fte']} available "
        f"(gap {ctx['gap']:+g}).{flagged} Please provide the evidence base behind the largest drivers so the "
        f"review can proceed on workload, not assertion."
    )


def _and_list(names: list[str]) -> str:
    names = [str(n) for n in names if n]
    if not names:
        return ""
    if len(names) == 1:
        return names[0]
    return ", ".join(names[:-1]) + " and " + names[-1]


# ─────────────────────────── clarification chase (agent #2) ───────────────────────────
def chase_message(action: str, *, department: str, entity: str, element: str,
                  days_open: float, sla_days: float, escalate_after: float) -> str:
    """A reminder (to the entity) or an escalation note (to senior DGHR), built from the item's real
    age. Deterministic — the live model phrases it warmer, never differently."""
    el = element or "a submitted figure"
    if action == "escalate":
        return (
            f"Escalating: {department} ({entity}), the clarification on {el} has gone unanswered for "
            f"{days_open:g} days, beyond the {escalate_after:g}-day threshold. Recommend a senior "
            f"follow-up with the entity champion before this version ages further."
        )
    # remind
    over = max(0.0, days_open - sla_days)
    past = (f", now {over:g} day{'s' if over != 1 else ''} past the {sla_days:g}-day SLA"
            if over > 0 else f", approaching the {sla_days:g}-day SLA")
    return (
        f"Reminder: {department}'s clarification on {el} has been open {days_open:g} days{past}. "
        f"Please respond with the evidence requested so the review can proceed."
    )


# ─────────────────────────── data-quality sweep (agent #3) ───────────────────────────
def quality_insights(sig: dict) -> list[dict]:
    """Turn the computed cross-entity signals into ranked insight cards. Every number here is passed
    in from real aggregates in ai_service — this only phrases them. The live model rewrites the prose;
    it can never introduce a figure that isn't in `sig`."""
    out: list[dict] = []

    growth = sig.get("growth") or []               # [(dept, entity, pct), …]
    if growth:
        ents = sorted({e for _, e, _ in growth})
        top = sorted(growth, key=lambda x: -x[2])[:3]
        out.append({
            "kind": "growth", "severity": "high" if len(growth) >= 4 else "medium",
            "title": "Unusual workload-growth requests",
            "detail": (f"{len(growth)} department{'s' if len(growth) != 1 else ''} across "
                       f"{len(ents)} entit{'ies' if len(ents) != 1 else 'y'} forecast workload growth "
                       f"above 20%, led by " + _and_list([f"{d} (+{p}%)" for d, _, p in top]) +
                       ". Challenge the volume basis before these enter the demand case."),
            "entities": ents[:6], "count": len(growth),
        })

    for grp, ents in (sig.get("name_clusters") or [])[:1]:
        el = sorted(ents)
        out.append({
            "kind": "naming", "severity": "medium",
            "title": "Inconsistent driver naming across entities",
            "detail": ("The same workload driver is recorded under different names: " +
                       _and_list([f"“{x}”" for x in grp[:4]]) + f" appear across {len(el)} entities. "
                       "Standardise the taxonomy so cross-entity demand stays comparable."),
            "entities": el[:6], "count": len(grp),
        })

    for ts, ents in (sig.get("shared_shortage") or [])[:2]:
        el = sorted(ents)
        out.append({
            "kind": "shared", "severity": "medium",
            "title": f"{ts}: shortfall across multiple entities",
            "detail": (f"{len(el)} entities report a shortfall in {ts}, a candidate for a shared or "
                       f"cross-entity capability rather than {len(el)} separate hiring cases."),
            "entities": el[:6], "count": len(el),
        })

    fc = sig.get("flag_top")
    if fc:
        flag, cnt, ents = fc
        el = sorted(ents)
        out.append({
            "kind": "flags", "severity": "low",
            "title": f"“{flag}” is the most common flag",
            "detail": (f"{cnt} submission{'s' if cnt != 1 else ''} across {len(el)} entit"
                       f"{'ies' if len(el) != 1 else 'y'} carry the “{flag}” flag. Batch-review these "
                       "together, a shared root cause is likely."),
            "entities": el[:6], "count": cnt,
        })

    return out


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

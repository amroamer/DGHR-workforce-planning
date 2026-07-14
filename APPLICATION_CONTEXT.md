# DGHR Workforce Planning Platform — APPLICATION CONTEXT BRIEF
### (Read this before SPEC.md and before touching any code. This document explains WHAT the application is and WHY it exists. SPEC.md explains what to build for the MVP demo.)

> APPLICATION_CONTEXT.md governs concepts, vocabulary, and vision; SPEC.md governs MVP scope, data, and design fidelity.

---

## 0. WHO YOU ARE AND WHAT YOU'RE READING

You are Claude, working as the engineering partner on a platform being proposed and demoed to **DGHR — Dubai Government Human Resources**. Two source materials define this product:

1. **The POV deck** (10 slides, in `design-reference/pov/` as `pov-01.png` … `pov-10.png`) — the **strategic vision**: what the full platform is, the operating model, the methodology, and the AI value story. The "why" and the "whole."
2. **The UI mockups** (10 screens, in `design-reference/` as `01-…png` … `10-…png`) — high-fidelity screen designs of the **data collection layer**, the part built first as an MVP demo per SPEC.md. The "what, exactly, on screen."

> **"The proposed platform is not a template automation tool. It is a workforce planning factory** that combines structured data collection, standardized methodology, wave-based delivery, guided diagnostics, AI-assisted analysis, calculation models, dashboards, and governance workflows."

That sentence is the product's identity. Use its vocabulary everywhere.

---

## 1. THE CLIENT AND THE MANDATE

**DGHR (Dubai Government Human Resources)** is the central HR authority for the Government of Dubai, mandated to run a **government-wide workforce planning exercise** covering every Dubai Government entity — establishing who works where, what work is done, what drives demand for that work, and how many people (and which skills) each section will need over the next 3–5 years.

**The scale (vision scenario):** 62 government entities · 15 sectors · 214 departments · **2,842 sections**. The **section** is the atomic unit of planning.

**The constraint:** the exercise must complete in **one year** — via central control (a command center), an industrialized collection engine, wave-based delivery, and analyst-led execution.

**Today's pain (what the platform replaces):** manual trackers, email chases, inconsistent Excel submissions, opinion-based headcount requests, no comparable methodology, zero real-time visibility.

---

## 2. THE PRODUCT — TWO LAYERS, ONE FACTORY

**Layer A — Data Collection & Orchestration Engine** *(the 10 UI mockups; the MVP)* — DGHR configures what data every entity must submit (8 data packages, section-type templates, mandatory vs optional fields, evidence rules); entities submit through guided screens and bulk Excel import; a tracker, validation/quality engine, clarification & resubmission workflow, and command-center dashboards drive everything to "readiness for forecasting."

**Layer B — Planning & Forecasting Engine** *(vision; the POV deck; NOT in the MVP)* — a 10-step embedded methodology, guided section diagnostics (12 components per section), demand logic, a workforce calculation engine (FTE requirements / surplus-shortage / skills gaps / cost impact, 3–5 year outlook), workforce insight dashboards with scenario comparison, and a report generator.

The demo shows Layer A end-to-end live, and *speaks the language* of Layer B ("Forecasting Readiness," "demand drivers," "evidence coverage").

---

## 3. OPERATING MODEL & PERSONAS (slide 4)

**Project-team analysts do the heavy lifting, not entity users.** Entities are SMEs who confirm, explain, validate, and approve.

- **Analyst (Project Team)** ⇄ *engage & gather / clarify & validate* ⇄ **Entities (SMEs)**
- **Analyst** → *submit* → **DGHR (Approver)** → *review & approve* back

**Analyst workflow (9 steps):** review available data → prepare section diagnostic → conduct interviews and workshops → capture responses in the tool → upload/link supporting evidence → validate assumptions with HR and business owners → calculate demand and draft section plan → review with entity → submit to DGHR.

**What entities do (7 things):** confirm organization structure · provide existing workforce data · attend focused workshops · explain current and future work · validate assumptions · provide evidence · review and approve outputs.

**Persona mapping for the MVP demo:** two switchable personas — **DGHR Admin** and **Entity user** (Dubai Municipality / Dubai Health Authority). The analyst role is *conceptually* present (reviewers, clarifications, validation actions live on the DGHR side) but is not a separate login/shell. Never contradict the analyst-led model — a clarification is "raised by a DGHR analyst," workshops exist as a concept even if not a screen.

---

## 4. DELIVERY MODEL — WAVES (slide 5)

**Pilot wave** (3–5 entities — *Completed*) → **Wave 1** (high-priority / large entities — *In Progress*) → **Wave 2** (medium-complexity — *Planned*) → **Wave 3** (remaining entities — *Planned*) → **Final consolidation**.

System capabilities: assign entities to waves · define wave timelines · assign analysts and reviewers · track workshops and section completion · compare wave performance · lock approved waves · carry forward lessons learned.

*(MVP note: SPEC seeds waves W1–W3 on 59 entities; the pilot wave and wave-comparison analytics are vision scope.)*

---

## 5. THE 8 DATA PACKAGES

1. **Organization Structure** — legal entity, departments, units, reporting lines
2. **Current Workforce** — headcount, demographics, contracts, compensation bands
3. **Workforce Movement** — hires, transfers, promotions, exits, turnover and reasons
4. **Workload & Service Data** — service volumes, queues, SLAs, productivity metrics
5. **Future Demand Drivers** — strategic initiatives, population and demand drivers
6. **Skills & Roles** — critical skills, role taxonomy, proficiency levels
7. **Budget & Cost** — payroll, operating costs, budgets, forecasts
8. **Evidence & Documents** — supporting files, justifications, methodologies

**The collection engine's 8-step mechanic (slide 2):** ① configurable templates by section type → ② mandatory vs optional fields → ③ bulk import and file upload → ④ submission tracker → ⑤ validation rules and quality checks → ⑥ due dates, reminders, and statuses → ⑦ clarifications and resubmissions → ⑧ readiness for forecasting.
**Status vocabulary (use exactly):** Not started · In progress · Needs attention · Submitted · Approved.

---

## 6. THE EMBEDDED METHODOLOGY — 10 STEPS (slide 3)

① Organization structure mapping → ② Current workforce baseline → ③ Current work and services → ④ Workload drivers → ⑤ Future change drivers → ⑥ Role & capability assessment → ⑦ Demand calculation → ⑧ Gap analysis → ⑨ Recommendations → ⑩ Report generation.

**Mapping to the MVP screens:** steps ①–⑤ correspond to the entity submission screens (Org Structure, Workforce Data, Workload & Service Data, Future Demand Drivers & Evidence). Steps ⑥–⑩ are Layer B vision.

---

## 7. GUIDED SECTION DIAGNOSTICS (slide 6) — heart of Layer B

Every section gets a structured **12-component diagnostic**: ① Section profile · ② Current role list · ③ Work activity catalogue · ④ Demand driver questions · ⑤ Workload metrics · ⑥ Future initiatives · ⑦ Automation potential · ⑧ Skills and capabilities · ⑨ Evidence upload · ⑩ Analyst notes · ⑪ AI summary · ⑫ Recommended workforce impact.

**The signature example:** SME says *"We're getting more requests and approvals manually, and it's slowing us down."* → **Demand driver:** increasing request volume and complexity · **Process issue:** manual approvals and handoffs create cycle time · **Workforce implication:** +4–6 FTE needed in 12–18 months *without* improvement. Recommendations are **work-first, not headcount-first**.

---

## 8. DEMAND LOGIC (slide 7)

Workload growth → demand increase by X% · New mandate → new specialist capability · Automation initiative → reduced manual effort · Service expansion → new customer-facing roles · Attrition and vacancies → replacement demand · New technology → **skill shift, not always more FTE** · Process redesign → part of demand can be absorbed.

**Challenge logic:** *"We need 10 more employees because workload is increasing"* → What workload, by how much? Productivity ratio? Temporary or permanent? Can part be automated? Do similar sections run with fewer staff? What roles are actually needed? → **Model estimate: 4–6 additional roles under baseline.**

---

## 9. THE WORKFORCE CALCULATION ENGINE (slide 8)

**Calculates:** current supply · baseline / growth / replacement / vacancy / new-initiative / productivity-adjusted / automation-adjusted / future-skills demand · surplus/shortage · cost impact.
**By archetype:** Operational (volume ÷ productivity benchmark; inspection = volume × effort ÷ productive hours) · Support (population ÷ support ratio) · Project (portfolio × effort) · IT (service & system complexity) · Policy (mandate & complexity) · Leadership (span of control, org rules).
**Outputs:** Required FTE · Surplus/Shortage · Skills Gaps · Cost Impact · **3–5 Year Outlook**.

---

## 10. DASHBOARDS, AI INSIGHTS, REPORTS (slides 1, 9, 10)

Command-center widgets (vision): KPI strip (62 · 15 · 214 · 2,842 · 56%), progress by entity (On Track/At Risk/Delayed · Low/Med/High risk), progress by wave (72/54/38/18), alerts (7 high-risk · 18 delayed sections · 34 missing evidence · 12 pending validations), Demand Change by Entity map, Early Workforce Gap Insight (Surplus 8 · Balanced 22 · Gap 1–10% 18 · Gap >10% 14), footer (Workshops 128/76 · Evidence 3,456 / **684 missing** · **AED 1.42B**).

Workforce insight dashboards: current workforce (2,842 FTE) · forecast demand (3,214 FTE FY27) · gaps (372) · growth +512 / reduction −140 · skills gaps (Data analytics 128 · AI/ML 96 · Cybersecurity 74 · Cloud engineering 61 · Change management 45) · scenario comparison (Baseline / High growth / Efficiency).

**AI-insight register to emulate:** *"Entity A shows a 22% increase in administrative roles despite planned automation." · "Customer service demand is rising across 7 entities." · "Data and AI roles appear under inconsistent job titles." · "Five entities may share common new capabilities."* Specific, cross-entity, quietly challenging.

**End-to-end operating model:** Set up → Prepare → Engage → Analyze → Validate → Report → Institutionalize.

---

## 11. THE AI THREAD — sanctioned capability vocabulary (boundary of AI claims)

**Collection & quality:** detects missing fields and inconsistent records · flags incomplete org structures · flags weak/missing evidence · recommends clarification questions · detects unusual workforce growth requests · highlights inconsistent role names · spots duplicate/overlapping functions · escalates sections needing senior review.
**Understanding work & demand:** suggests diagnostic questions and section metrics · converts workshop discussion into structured outputs · extracts demand drivers from notes · identifies sections with no clear demand driver · detects demand misaligned with workload/strategy · identifies automation opportunities · identifies contradictions and gaps.
**Standardization & modeling:** maps job titles into standard families · turns narratives into assumptions · suggests more defensible estimates · helps select the right calculation model · suggests future roles and skills · suggests assumption changes for the next wave.
**Delivery intelligence:** detects slow responders · finds repeated missing data · shows most common demand drivers · identifies emerging role growth · summarizes risks · drafts section narratives · generates cross-entity insights.

*(MVP implements exactly three live — job-title mapping, anomaly narratives, driver AI summary — per SPEC §13. Everything else is referenced capability, never faked without a fallback.)*

---

## 12. SCREEN ↔ VISION MAP

| UI mockup (MVP) | Realizes (POV deck) |
|---|---|
| 01 DGHR Command Center | Slide 1 + slide 9 delivery dashboards |
| 02 Data Request Configuration | Slide 2 steps ①–② + cycle governance |
| 03 Entity Submission Tracker | Slide 2 step ④ + slide 5 waves |
| 04 Data Quality & Validation | Slide 2 step ⑤ + slide 1 AI alerts |
| 05 Clarifications & Resubmissions | Slide 2 step ⑦ + governance |
| 06 Entity Home | Slide 4 + slide 2 step ⑥ |
| 07 Organization Structure | Methodology step ① |
| 08 Current Workforce Data | Methodology step ② + AI job-title mapping |
| 09 Workload & Service Data | Methodology steps ③–④ + slide 6 |
| 10 Future Demand Drivers & Evidence | Methodology step ⑤ + slides 6–7 |

**Vision-only (never present as built):** analyst workbench & interview scripts · workshops tracking · section diagnostics workbench · demand challenge logic UI · calculation engine & FTE outputs · gap analysis, recommendations, scenario comparison · demand-change map · report generator · wave administration · budget-impact analytics.

---

## 13. SOURCE-OF-TRUTH PRECEDENCE

1. Anything the MVP renders → SPEC §7 seed wins (59 entities, waves W1–W3, 27 received, 46% progress, 386 fields). Never leak POV numbers into MVP screens.
2. Vision narrative / roadmap / §9.5 teaser → POV scenario (62/15/214/2,842, 56%, 2,842→3,214 FTE, 372 gap, AED 1.42B).
3. Visual design of MVP screens → the UI mockups win, with SPEC §1 corrections.
4. Vocabulary, concepts, statuses, methodology, AI claims → this brief wins everywhere.
5. New conflict → surface and propose reconciliation; never silently pick.

---

## 14. GLOSSARY

**Entity** — a Dubai Government organization. **Sector / Department / Section** — the org hierarchy; **section** is the atomic planning unit. **Section type** — a template category (Customer Service, Inspection, HR, Finance, IT, Strategy, Data & Digital). **Wave** — a delivery cohort (Pilot, W1–W3, consolidation). **Data package** — one of the 8 collection bundles. **Diagnostic** — the 12-component section assessment. **Demand driver** — a factor changing future workload. **Challenge logic** — structured interrogation of a headcount request. **FTE** — full-time-equivalent. **Surplus/Shortage** — supply minus required FTE. **Evidence** — documents that substantiate inputs. **Clarification (CLF-…) / Return (RTN-…)** — governance cases. **Forecasting-ready** — an entity passing completeness (≥80%) and quality thresholds. **Workforce planning factory** — the product's self-definition.

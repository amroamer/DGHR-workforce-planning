import { test, expect } from "@playwright/test";
import { gotoAs } from "./helpers";

// The §13.1 AI expansion, driven end-to-end in fallback mode (no API key needed):
// report narratives, review brief, clarification drafting (both sides), and the
// voice affordances. Every feature must render its `source` badge honestly.

test.describe("report narratives", () => {
  // Content assertions are mode-agnostic: the source badge + Regenerate button only render
  // once a narrative arrived, whether the live model or the deterministic fallback wrote it.
  test("gov report drafts an executive summary with a source badge", async ({ page }) => {
    await gotoAs(page, "/dghr/reports", "dghr-admin");
    await page.getByRole("button", { name: "Draft the summary" }).click();
    await expect(page.getByText(/^(offline|live model)$/).first()).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole("button", { name: "Regenerate" })).toBeVisible();
  });

  test("entity report drafts a summary scoped to the entity", async ({ page }) => {
    await gotoAs(page, "/entity/reports", "entity-dm");
    await page.getByRole("button", { name: "Draft the summary" }).click();
    await expect(page.getByText(/^(offline|live model)$/).first()).toBeVisible({ timeout: 30000 });
  });
});

test.describe("review copilot", () => {
  test("brief renders summary, checks and source on a pending submission", async ({ page }) => {
    await gotoAs(page, "/dghr/government", "dghr-admin");
    // find any pending submission via the API the page itself uses
    const sub = await page.evaluate(async () => {
      const r = await fetch("http://localhost:8010/api/planning/dghr/government").then((x) => x.json());
      void r; // entity list only; walk entities for a pending submission
      const ents = r.entities as { entity_id: number }[];
      for (const e of ents) {
        const d = await fetch(`http://localhost:8010/api/planning/dghr/entities/${e.entity_id}`).then((x) => x.json());
        const hit = (d.departments as { submission_id: number | null; status: string }[])
          .find((x) => x.submission_id && ["submitted", "in_clarification", "recommended"].includes(x.status));
        if (hit) return hit.submission_id;
      }
      return null;
    });
    test.skip(sub == null, "no pending submission in seed");
    await gotoAs(page, `/dghr/gov-submission/${sub}`, "dghr-admin");
    await page.getByRole("button", { name: "Brief me" }).click();
    // The source badge renders only once the brief has arrived — wait on it, generously
    // (a live-model brief takes ~15-25s). "Check first" must be exact: the card's hint
    // text contains the same words and would substring-match instantly.
    await expect(page.getByText(/^(offline|live model)$/).first()).toBeVisible({ timeout: 60000 });
    await expect(page.getByText("Check first", { exact: true })).toBeVisible();
  });

  test("clarify modal drafts a grounded question into the textarea", async ({ page }) => {
    await gotoAs(page, "/dghr/government", "dghr-admin");
    const sub = await page.evaluate(async () => {
      const r = await fetch("http://localhost:8010/api/planning/dghr/government").then((x) => x.json());
      for (const e of r.entities as { entity_id: number }[]) {
        const d = await fetch(`http://localhost:8010/api/planning/dghr/entities/${e.entity_id}`).then((x) => x.json());
        const hit = (d.departments as { submission_id: number | null; status: string }[])
          .find((x) => x.submission_id && ["submitted", "in_clarification", "recommended"].includes(x.status));
        if (hit) return hit.submission_id;
      }
      return null;
    });
    test.skip(sub == null, "no pending submission in seed");
    await gotoAs(page, `/dghr/gov-submission/${sub}`, "dghr-admin");
    await page.getByRole("button", { name: "Clarify" }).click();
    await page.getByRole("button", { name: "Draft the question with AI" }).click();
    await page.waitForFunction(() =>
      [...document.querySelectorAll("textarea")].some((t) => (t as HTMLTextAreaElement).value.length > 40),
      undefined, { timeout: 15000 });
  });
});

test.describe("entity clarification reply", () => {
  test("open clarification shows reply box; AI drafts; mic present", async ({ page }) => {
    // find a department with an open DGHR clarification (any entity)
    await gotoAs(page, "/dghr/alerts", "dghr-admin");
    const found = await page.evaluate(async () => {
      const q = await fetch("http://localhost:8010/api/planning/dghr/clarification-queue").then((x) => x.json());
      const c = (q.clarifications as { department_id: number | null; entity_id: number | null }[])
        .find((x) => x.department_id && x.entity_id);
      if (!c) return null;
      const ents = await fetch("http://localhost:8010/api/planning/dghr/entities").then((x) => x.json());
      const ent = (ents.entities as { entity_id: number; name: string; code: string }[])
        .find((e) => e.entity_id === c.entity_id);
      return ent ? { deptId: c.department_id, entityId: c.entity_id, code: ent.code, name: ent.name } : null;
    });
    test.skip(found == null, "no open clarification in seed");
    await page.addInitScript((p) => localStorage.setItem("dghr.persona", JSON.stringify({
      id: `entity-${p!.entityId}`, type: "entity", code: p!.code, entityId: p!.entityId, name: p!.name,
      initials: (p!.code || "EN").slice(0, 3), portalTitle: p!.name, portalSubtitle: "Government Entity",
      userName: "Entity User", userRole: "Entity Admin",
    })), found);
    await page.goto(`/entity/departments/${found!.deptId}`);
    await expect(page.getByText("Your reply to DGHR").first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: /Dictate/ }).first()).toBeVisible();
    await page.getByRole("button", { name: "Draft with AI" }).first().click();
    await page.waitForFunction(() =>
      [...document.querySelectorAll("textarea")].some((t) => (t as HTMLTextAreaElement).value.length > 40),
      undefined, { timeout: 15000 });
  });
});

test("stepper Smart Assist step shows the real mic on an editable draft", async ({ page }) => {
  await gotoAs(page, "/entity/departments", "entity-dm");
  const draft = await page.evaluate(async () => {
    const persona = JSON.parse(localStorage.getItem("dghr.persona") || "{}");
    const ents = await fetch("http://localhost:8010/api/planning/dghr/entities").then((x) => x.json());
    const dm = (ents.entities as { entity_id: number; code: string }[]).find((e) => e.code === (persona.code || "DM"));
    if (!dm) return null;
    const d = await fetch(`http://localhost:8010/api/planning/entities/${dm.entity_id}/departments`).then((x) => x.json());
    const hit = (d.departments as { department_id: number; status: string }[]).find((x) => x.status === "draft");
    return hit?.department_id ?? null;
  });
  test.skip(draft == null, "no draft submission for DM in seed");
  await page.goto(`/entity/departments/${draft}?persona=entity-dm`);
  await page.getByRole("button", { name: "Smart Assist" }).first().click();
  await expect(page.getByRole("button", { name: /Record a voice note/ })).toBeVisible({ timeout: 10000 });
});

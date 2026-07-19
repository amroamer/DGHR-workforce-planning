import { test, expect } from "@playwright/test";
import { gotoAs } from "./helpers";

// Feature 6 — ask-the-data chat on the Government-Wide Position, driven end-to-end.
// Grounded server-side; passes in both live and fallback mode (asserts on the source badge,
// not on specific wording).

test.describe("ask-the-data chat", () => {
  test("suggestion chip returns a grounded answer with a source badge", async ({ page }) => {
    await gotoAs(page, "/dghr/government", "dghr-admin");
    await expect(page.getByText("Ask the data")).toBeVisible();
    // Suggestion chips show only before the first turn.
    await page.getByRole("button", { name: "Which entities are in surplus?" }).click();
    // The question echoes as a user bubble, then an answer arrives with a badge.
    await expect(page.getByText(/live model|offline/).first()).toBeVisible({ timeout: 30000 });
    // The user turn is on the transcript.
    await expect(page.getByText("Which entities are in surplus?").first()).toBeVisible();
  });

  test("typed question answers and supports a follow-up", async ({ page }) => {
    await gotoAs(page, "/dghr/government", "dghr-admin");
    const input = page.getByPlaceholder(/Ask about gaps/);
    await input.fill("What's the Emiratization rate?");
    await input.press("Enter");
    await expect(page.getByText(/live model|offline/).first()).toBeVisible({ timeout: 30000 });

    // Follow-up: input is clear again and the chips are gone (turns exist now).
    await expect(input).toHaveValue("");
    await input.fill("And the annual cost?");
    await input.press("Enter");
    // Two answers now carry a badge.
    await expect(page.getByText(/live model|offline/)).toHaveCount(2, { timeout: 30000 });
  });

  test("voice (mic) + EN/AR language toggle are present on the chat", async ({ page }) => {
    await gotoAs(page, "/dghr/government", "dghr-admin");
    await expect(page.getByRole("button", { name: "Ask by voice" })).toBeVisible();
    // Shared dictation-language toggle.
    await expect(page.getByRole("button", { name: "AR", exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "AR", exact: true }).first().click();
    await expect(page.getByRole("button", { name: "AR", exact: true }).first()).toHaveAttribute("aria-pressed", "true");
  });

  test("entity-scoped chat on Entity Reports answers about departments", async ({ page }) => {
    await gotoAs(page, "/entity/reports", "entity-dm");
    await expect(page.getByText("Ask about your workforce")).toBeVisible();
    await page.getByRole("button", { name: "Which department has the biggest gap?" }).click();
    await expect(page.getByText(/live model|offline/).first()).toBeVisible({ timeout: 30000 });
  });
});

test("DGHR clarify modal has an AI draft, a Dictate mic, and the EN/AR toggle", async ({ page }) => {
  // Find any pending submission and open its Clarify modal.
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
  await expect(page.getByRole("button", { name: /Draft the question with AI/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Dictate/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "AR", exact: true }).first()).toBeVisible();
});

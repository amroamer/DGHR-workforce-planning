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

  test("voice (mic) affordance is present on the chat", async ({ page }) => {
    await gotoAs(page, "/dghr/government", "dghr-admin");
    await expect(page.getByRole("button", { name: "Ask by voice" })).toBeVisible();
  });
});

import { Page, expect } from "@playwright/test";

export const API = "http://localhost:8010";

/** Navigate to a path as a given persona (deep-link sets persona + persists it). */
export async function gotoAs(page: Page, path: string, persona: "dghr-admin" | "entity-dm" | "entity-dha" = "dghr-admin") {
  const sep = path.includes("?") ? "&" : "?";
  await page.goto(`${path}${sep}persona=${persona}`);
  await page.waitForLoadState("networkidle").catch(() => {});
}

/** Reset the demo scenario via the API (used before mutating tests). */
export async function resetDemo() {
  await fetch(`${API}/api/demo/reset`, { method: "POST" });
}

/** Wait for a sonner toast containing text. */
export async function expectToast(page: Page, text: string | RegExp) {
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: text }).first()).toBeVisible({ timeout: 8000 });
}

/** The visible page title (h1). */
export function pageTitle(page: Page) {
  return page.locator("h1").first();
}

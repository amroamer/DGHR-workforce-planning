import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// Cross-browser (Track-B #19): same suite driven by Microsoft Edge (Chromium family).
// Snapshot specs are excluded here — pixel baselines are captured under Chrome and
// don't need per-browser duplicates for a Chromium-vs-Chromium comparison.
export default defineConfig({
  ...base,
  testIgnore: ["**/snapshots.spec.ts"],
  use: { ...base.use, channel: "msedge" },
});

import { defineConfig, devices } from "@playwright/test";

// Drives the LIVE app (docker frontend on host port 5183) with the host's installed
// Chrome — no Chromium download needed.
export default defineConfig({
  testDir: "./tests",
  globalSetup: "./global-hooks.ts",
  globalTeardown: "./global-hooks.ts",
  fullyParallel: false,
  workers: 1,
  retries: 1,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:5183",
    channel: "chrome",
    headless: true,
    viewport: { width: 1600, height: 1000 },
    actionTimeout: 8_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});

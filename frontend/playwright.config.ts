import { defineConfig, devices } from "@playwright/test";

// End-to-end browser tests: a real Chromium drives the built React app exactly
// like a user — typing a message, sending it, and waiting for the agent's answer
// to render. The app under test is the full Docker stack (frontend :5173 → the
// ingress chain :8090 → backend → OpenAI), brought up out-of-band (see
// `.github/workflows/integration.yml` or `docker compose up`).
//
// Timeouts are generous on purpose: each test makes a *real* OpenAI call, so the
// answer can take tens of seconds. We never assert on the model's exact words —
// only that the UI rendered a non-empty answer, surfaced its sources, and counted
// the tool call — so model variability never makes these flaky.
export default defineConfig({
  testDir: "./e2e",
  // The whole suite hits one shared live stack; running files serially keeps the
  // backend's single-instance trace store and token accounting easy to reason about.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  // A whole user journey (send → real agent answer renders) can run ~90s.
  timeout: 120_000,
  expect: { timeout: 75_000 },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});

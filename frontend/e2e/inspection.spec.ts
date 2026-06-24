import { expect, test } from "@playwright/test";
import { ask, bootstrap, clickHopLabel, openExecutionTraces } from "./helpers";

// Spec 094 / AC5 + AC6 — the two remaining inspection surfaces of the Build Simple
// journey, against a live trace: clicking an arrow reads the real data that crossed
// that hop, and the Execution Traces tree shows the real agent-loop spans. One
// seeded turn feeds both assertions (single OpenAI call).

test.beforeEach(async ({ page }) => {
  await bootstrap(page);
});

test.describe.serial("inspecting a real run: hop detail + execution traces", () => {
  test("the frontend→backend arrow and the trace tree expose the real run", async ({ page }) => {
    await ask(page, "Using the knowledge base, what is retrieval-augmented generation?");

    await test.step("clicking the frontend→backend arrow opens its hop detail with real data (AC5)", async () => {
      // The arrow's protocol label opens the hop's communication detail in the Inspector.
      await clickHopLabel(page, /HTTPS · TLS/);
      // The hop detail names the hop and shows real per-run evidence: its protocol
      // and the request body that crossed it (which carries the message we sent).
      await expect(page.getByText(/Frontend/).first()).toBeVisible();
      await expect(page.getByText(/HTTPS \/ TLS/).first()).toBeVisible();
      await expect(page.getByText(/retrieval-augmented generation/i).first()).toBeVisible();
    });

    await test.step("back to the overview", async () => {
      await page.getByRole("button", { name: /← Overview/ }).click();
    });

    await test.step("opening Execution Traces renders the agent-loop span tree (AC6)", async () => {
      await openExecutionTraces(page);
      // The tree rendered against a real run (not its empty placeholder)...
      await expect(page.getByText(/Run a turn to see the execution trace/)).toHaveCount(0);
      await expect(page.getByText(/Hierarchical span tree of the run/)).toBeVisible();
      // ...with at least one real agent-loop span.
      await expect(page.getByText("think", { exact: true }).first()).toBeVisible();
    });
  });
});

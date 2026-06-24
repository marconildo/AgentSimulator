import { expect, test } from "@playwright/test";
import { ask, bootstrap, lastAnswer } from "./helpers";

// Spec 094 / AC3 — long-term memory across turns. The backend persists each turn
// to SQLite (`db.read` → history → the prompt), so a second turn that depends on
// the first proves the conversation memory really threads through. We assert
// structurally on a *deterministic fact* the model echoes back (the number),
// never on its prose, so model variability never makes this flaky.

test.beforeEach(async ({ page }) => {
  await bootstrap(page);
});

test.describe.serial("long-term memory across turns", () => {
  test("a follow-up turn recalls a fact stated in the first turn", async ({ page }) => {
    await test.step("turn 1 — state a fact to remember", async () => {
      await ask(page, "Remember this for later: my favorite number is 42. Just acknowledge briefly.");
      await expect(lastAnswer(page)).not.toBeEmpty();
    });

    await test.step("turn 2 — ask a question that depends on turn 1", async () => {
      await ask(page, "What is my favorite number? Reply with just the number.");
      const bubble = lastAnswer(page);
      await expect(bubble).toBeVisible();
      // History threaded through ⇒ the agent recalls the number it was told. The
      // digits are deterministic even though the surrounding wording is not.
      await expect(bubble).toContainText("42");
    });
  });
});

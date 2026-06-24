import { expect, test } from "@playwright/test";
import { ask, bootstrap, lastAnswer } from "./helpers";

// Browser end-to-end: a real Chromium drives the built React app against the live
// stack (frontend → ingress chain → backend → OpenAI), exactly like a user. We
// assert **structurally** — an answer rendered, its sources showed, the tool call
// was counted — never on the model's exact words, so the suite never goes flaky.
// Shared compose/send/settle helpers live in `./helpers` and wrap each phase in a
// named `test.step` so the CI log reads like a checklist (spec 094).

test.beforeEach(async ({ page }) => {
  await bootstrap(page);
});

test("basic chat renders a non-empty agent answer", async ({ page }) => {
  await ask(page, "Reply with a short, friendly one-line greeting.");

  await test.step("the answer bubble is non-empty", async () => {
    const bubble = lastAnswer(page);
    await expect(bubble).toBeVisible();
    const text = (await bubble.innerText()).trim();
    expect(text.length).toBeGreaterThan(1);
  });
});

test("a knowledge-base question surfaces the retrieved sources", async ({ page }) => {
  await ask(page, "Using the knowledge base, what is retrieval-augmented generation?");

  await test.step("the UI surfaced the retrieved sources and counted RAG hits", async () => {
    // The agent answered...
    await expect(lastAnswer(page)).not.toBeEmpty();
    // ...the UI surfaced the chunks it retrieved...
    await expect(page.getByText(/Sources used/)).toBeVisible();
    // ...and the running HUD counted at least one real RAG hit.
    await expect(page.getByText(/[1-9]\d* RAG hits/)).toBeVisible();
  });
});

test("a math question surfaces a tool call in the HUD", async ({ page }) => {
  await ask(page, "Use the calculator tool to compute 23 * 19, then show the result.");

  await test.step("the HUD shows the real tool-call count", async () => {
    await expect(lastAnswer(page)).not.toBeEmpty();
    // The conversation HUD shows the real tool-call count (≥1) for this turn.
    await expect(page.getByText(/[1-9]\d* tool calls/)).toBeVisible();
  });
});

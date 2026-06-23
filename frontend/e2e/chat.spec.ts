import { expect, type Page, test } from "@playwright/test";

// Browser end-to-end: a real Chromium drives the built React app against the live
// stack (frontend → ingress chain → backend → OpenAI), exactly like a user. We
// assert **structurally** — an answer rendered, its sources showed, the tool call
// was counted — never on the model's exact words, so the suite never goes flaky.

test.beforeEach(async ({ page }) => {
  // Pin a deterministic UI before the app boots: English labels (stable selectors)
  // and the first-visit onboarding tour suppressed so its overlay never intercepts
  // the composer.
  await page.addInitScript(() => {
    localStorage.setItem("agentsim.lang", "en");
    localStorage.setItem("agentsim.onboarded", "1");
  });
  await page.goto("/");
});

const composer = (page: Page) => page.getByPlaceholder("e.g. What is RAG?");
const lastAnswer = (page: Page) => page.getByTestId("agent-bubble").last();

/** Type a message, send it, and wait for the agent to finish the turn.
 *
 * The composer is `disabled` while a turn streams and re-enables once the answer
 * has settled and persisted — that enabled→disabled→enabled cycle is our reliable
 * "the real agent finished" signal (no fixed sleeps, no model-timing guesses).
 */
async function ask(page: Page, message: string): Promise<void> {
  const field = composer(page);
  await expect(field).toBeVisible();
  await field.fill(message);
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(field).toBeDisabled();
  await expect(field).toBeEnabled({ timeout: 110_000 });
}

test("basic chat renders a non-empty agent answer", async ({ page }) => {
  await ask(page, "Reply with a short, friendly one-line greeting.");

  const bubble = lastAnswer(page);
  await expect(bubble).toBeVisible();
  const text = (await bubble.innerText()).trim();
  expect(text.length).toBeGreaterThan(1);
});

test("a knowledge-base question surfaces the retrieved sources", async ({ page }) => {
  await ask(page, "Using the knowledge base, what is retrieval-augmented generation?");

  // The agent answered...
  await expect(lastAnswer(page)).not.toBeEmpty();
  // ...the UI surfaced the chunks it retrieved...
  await expect(page.getByText(/Sources used/)).toBeVisible();
  // ...and the running HUD counted at least one real RAG hit.
  await expect(page.getByText(/[1-9]\d* RAG hits/)).toBeVisible();
});

test("a math question surfaces a tool call in the HUD", async ({ page }) => {
  await ask(page, "Use the calculator tool to compute 23 * 19, then show the result.");

  await expect(lastAnswer(page)).not.toBeEmpty();
  // The conversation HUD shows the real tool-call count (≥1) for this turn.
  await expect(page.getByText(/[1-9]\d* tool calls/)).toBeVisible();
});

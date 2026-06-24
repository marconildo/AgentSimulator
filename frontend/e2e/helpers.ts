import { expect, type Page, test } from "@playwright/test";

// Shared helpers for the live-stack Playwright suite (spec 094). A real Chromium
// drives the built React app against the full Docker stack (frontend → ingress
// chain → backend → OpenAI), exactly like a user. Everything here selects the
// already-built UI — no product `data-testid` is added — and asserts
// **structurally** (an overlay opened, real data is present, a span rendered),
// never on the model's exact words, so the suite never goes flaky.
//
// Each turn-sending helper wraps its phases in named `test.step(...)` so the
// `list` reporter prints them indented under the test title (a self-describing
// CI log, per AC1).

/** The composer textarea (English locale is pinned in `bootstrap`). */
export const composer = (page: Page) => page.getByPlaceholder("e.g. What is RAG?");

/** The most recent agent answer bubble. */
export const lastAnswer = (page: Page) => page.getByTestId("agent-bubble").last();

/** Pin a deterministic UI before the app boots, then open it: English labels
 * (stable selectors) and the first-visit onboarding tour suppressed so its
 * overlay never intercepts the composer. */
export async function bootstrap(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem("agentsim.lang", "en");
    localStorage.setItem("agentsim.onboarded", "1");
  });
  await page.goto("/");
}

/** Type a message, send it, and wait for the agent to finish the turn.
 *
 * The composer is `disabled` while a turn streams and re-enables once the answer
 * has settled and persisted — that enabled→disabled→enabled cycle is our reliable
 * "the real agent finished" signal (no fixed sleeps, no model-timing guesses).
 * Phases are grouped as steps so the CI log reads compose → send → settle. */
export async function ask(page: Page, message: string): Promise<void> {
  const field = composer(page);
  await test.step(`compose: "${message.slice(0, 48)}${message.length > 48 ? "…" : ""}"`, async () => {
    await expect(field).toBeVisible();
    await field.fill(message);
  });
  await test.step("send", async () => {
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(field).toBeDisabled();
  });
  await test.step("settle (real agent finishes the turn)", async () => {
    await expect(field).toBeEnabled({ timeout: 110_000 });
  });
}

// --- station drill-ins ("Open full view") -----------------------------------

/** The seven real stations of the default Build Simple selection, each with the
 * full-view button label that opens its drill-in, an overlay title that proves
 * the drill-in opened, and the empty-state placeholder that must be **absent**
 * once a real turn has produced data (null = the overlay has no empty state, so
 * "opened" already implies "has data"). All strings are the live English UI. */
export const REAL_STATIONS: {
  id: string;
  button: RegExp;
  title: RegExp;
  empty: RegExp | null;
}[] = [
  { id: "agent", button: /Open full view/, title: /Agent Context Window/, empty: null },
  { id: "llm", button: /Open full view/, title: /LLM · calls this turn/, empty: /No LLM calls yet/ },
  { id: "mcp", button: /Open full view/, title: /MCP Tools — calls this turn/, empty: /No tool activity in this turn yet/ },
  { id: "database", button: /Open full view/, title: /App Database — operations this turn/, empty: /No database activity in this turn yet/ },
  { id: "backend", button: /Open full view/, title: /Backend — request lifecycle/, empty: /Nothing received in this turn yet/ },
  { id: "frontend", button: /Open full view/, title: /Frontend — browser exchange/, empty: /Nothing sent in this turn yet/ },
  { id: "rag", button: /Open RAG pipeline/, title: /RAG Pipeline/, empty: /Send a message to watch the RAG pipeline run/ },
];

/** Click a station's full-view button. The station node is located by its
 * React-Flow `data-id` (which already equals the `StationId`), and the button by
 * its visible label scoped to that node — no product test id required. */
export async function openStationFullView(page: Page, station: { id: string; button: RegExp }): Promise<void> {
  const node = page.locator(`.react-flow__node[data-id="${station.id}"]`);
  await expect(node).toBeVisible();
  await node.scrollIntoViewIfNeeded();
  await node.getByRole("button", { name: station.button }).click();
}

/** After opening a drill-in: assert its overlay is present (the title shows) and
 * that it rendered **real run data** (its empty-state placeholder is absent). */
export async function expectDrillInHasData(
  page: Page,
  station: { title: RegExp; empty: RegExp | null },
): Promise<void> {
  await expect(page.getByText(station.title).first()).toBeVisible();
  if (station.empty) await expect(page.getByText(station.empty)).toHaveCount(0);
}

/** Close whichever drill-in is open. The RAG pipeline panel closes on Escape; the
 * header-style overlays (Agent/LLM/MCP/DB/Backend/Frontend) have a `← back`
 * button at the top. Doing both covers every overlay. */
export async function closeDrillIn(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
  const back = page.getByRole("button", { name: /^←/ }).first();
  if (await back.isVisible().catch(() => false)) await back.click();
}

// --- hop detail + execution traces ------------------------------------------

/** Click a hop's protocol label to open its communication detail in the
 * Inspector. The label button carries the hop's protocol text (e.g. the
 * `frontend → backend` arrow shows "HTTPS · TLS"). */
export async function clickHopLabel(page: Page, label: RegExp): Promise<void> {
  await page.getByRole("button", { name: label }).first().click();
}

/** Open the whole-run Execution Traces tree from the Inspector's Overview list. */
export async function openExecutionTraces(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Execution traces/ }).click();
}

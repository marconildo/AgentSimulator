import { test } from "@playwright/test";
import {
  ask,
  bootstrap,
  closeDrillIn,
  expectDrillInHasData,
  openStationFullView,
  REAL_STATIONS,
} from "./helpers";

// Spec 094 / AC4 — the interactive visualization, end to end. After one real turn
// that exercises both RAG and a tool, every real Build Simple station's "Open full
// view" must open its drill-in **against the live trace** and show real run data
// (not the empty placeholder). Vitest already covers these overlays as pure
// projections; this proves they render real data produced by the real agent.
//
// One seeded turn (RAG + calculator) feeds all seven drill-ins — a single OpenAI
// call keeps the suite fast on `workers: 1`.

test.beforeEach(async ({ page }) => {
  await bootstrap(page);
});

test("every real station's full view opens with real run data", async ({ page }) => {
  await ask(
    page,
    "Using the knowledge base, what is retrieval-augmented generation? Also use the calculator to compute 6 * 7.",
  );

  for (const station of REAL_STATIONS) {
    await test.step(`drill-in renders real data: ${station.id}`, async () => {
      await openStationFullView(page, station);
      await expectDrillInHasData(page, station);
      await closeDrillIn(page);
    });
  }
});

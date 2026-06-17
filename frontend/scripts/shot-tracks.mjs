// One-off visual check for 059-scenario-tracks: screenshot the Advanced rung
// under each track filter (all / agent / aiops / security), plus Simple to prove
// the track toggle is absent there. Sets scenario+track in localStorage before
// load (the stores read them at module init).
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:4173";
const OUT = "/tmp/agentsim-track-shots";
const shots = [
  { scenario: "simple", track: "all" },
  { scenario: "intermediate", track: "all" },
  { scenario: "intermediate", track: "rag" },
  { scenario: "intermediate", track: "agent" },
  { scenario: "advanced", track: "all" },
  { scenario: "advanced", track: "agent" },
  { scenario: "advanced", track: "aiops" },
  { scenario: "advanced", track: "security" },
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1680, height: 950 } });

for (const { scenario, track } of shots) {
  const page = await ctx.newPage();
  await page.addInitScript(
    ([sc, tr]) => {
      localStorage.setItem("agentsim.scenario", sc);
      localStorage.setItem("agentsim.track", tr);
    },
    [scenario, track],
  );
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const file = `${OUT}/${scenario}-${track}.png`;
  await page.screenshot({ path: file, fullPage: false });
  console.log(`shot: ${file}`);
  await page.close();
}

await browser.close();
console.log("done");

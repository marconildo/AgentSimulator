// One-off visual check for 008-scenario-framework: screenshot the canvas in each
// rung of the maturity ladder. Sets the scenario in localStorage before load
// (the store reads it at module init), so we exercise the real render path.
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:5173";
const OUT = "/tmp/agentsim-shots";
const scenarios = ["simple", "intermediate", "advanced"];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1680, height: 950 } });

for (const s of scenarios) {
  const page = await ctx.newPage();
  await page.addInitScript((sc) => localStorage.setItem("agentsim.scenario", sc), s);
  await page.goto(BASE, { waitUntil: "networkidle" });
  // Let the canvas lay out + React Flow fit.
  await page.waitForTimeout(1500);
  const file = `${OUT}/scenario-${s}.png`;
  await page.screenshot({ path: file, fullPage: false });
  console.log(`shot: ${file}`);
  await page.close();
}

await browser.close();
console.log("done");

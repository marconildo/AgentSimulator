import type { FullResult, Reporter, TestCase, TestResult } from "@playwright/test/reporter";

// A tiny custom reporter that prints one compact summary block when the suite
// finishes (spec 094, AC2) — mirroring the "— E2E summary —" line the team likes
// in CI logs. It runs alongside the built-in `list` (per-test/step lines) and
// `html` (artifact) reporters; it only adds the closing tally, it never replaces
// them.
export default class SummaryReporter implements Reporter {
  private passed = 0;
  private failed = 0;
  private skipped = 0;
  private flaky = 0;

  onTestEnd(_test: TestCase, result: TestResult): void {
    switch (result.status) {
      case "passed":
        // A test that failed then passed on retry is "passed" here but flagged
        // flaky via its retry count, so surface it separately.
        if (result.retry > 0) this.flaky += 1;
        else this.passed += 1;
        break;
      case "failed":
      case "timedOut":
      case "interrupted":
        this.failed += 1;
        break;
      case "skipped":
        this.skipped += 1;
        break;
    }
  }

  onEnd(result: FullResult): void {
    const total = this.passed + this.failed + this.skipped + this.flaky;
    const secs = (result.duration / 1000).toFixed(1);
    // Keep it on its own lines so it stands out at the bottom of the CI log.
    console.log("");
    console.log("— E2E summary —");
    console.log(
      `  ${result.status === "passed" ? "✓" : "✗"} ${this.passed} passed · ${this.failed} failed · ${this.skipped} skipped · ${this.flaky} flaky` +
        `  (${total} tests, ${secs}s)`,
    );
    console.log("");
  }
}

// 093-waf-block-visualization — a 403 from the chain (the WAF blocking the request)
// is surfaced as a typed WafBlockedError so the send flow renders a "blocked" outcome
// instead of a generic stream error.
import { describe, expect, it } from "vitest";

import { consumeEventStream, WafBlockedError } from "./sse";

describe("consumeEventStream — WAF block (093)", () => {
  it("throws a WafBlockedError on a 403 response", async () => {
    const resp = new Response("<html>403 Forbidden</html>", { status: 403 });
    await expect(consumeEventStream(resp, () => {})).rejects.toBeInstanceOf(WafBlockedError);
  });

  it("carries the HTTP status on the error", async () => {
    const resp = new Response(null, { status: 403 });
    await expect(consumeEventStream(resp, () => {})).rejects.toMatchObject({ httpStatus: 403 });
  });

  it("still throws a generic error for other non-ok statuses", async () => {
    const resp = new Response(null, { status: 500 });
    await expect(consumeEventStream(resp, () => {})).rejects.not.toBeInstanceOf(WafBlockedError);
  });
});

/** @vitest-environment jsdom */
// 069-rag-executions-history — AC4: the RAG pipeline panel's execution navigator shows
// `k / N`, is bounded at both ends, and steps between retrieval cycles. The panel itself
// anchors to a measured canvas (ReactFlow viewport), impractical to mount in jsdom, so we
// test the extracted `ExecutionNav` directly; the "only when N≥2" gate is a one-line
// conditional driven by `deriveRagExecutions` (covered in ragPipeline.executions.test.ts).

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ExecutionNav } from "./RagPipelinePanel";
import { UI } from "../i18n/strings";

const r = UI.en.ragDetail;

afterEach(cleanup);

describe("ExecutionNav (069)", () => {
  it("reports k / N and labels the query", () => {
    render(
      <ExecutionNav index={0} total={2} query="definition of RAG" r={r} onPrev={vi.fn()} onNext={vi.fn()} />,
    );
    expect(screen.getByText("retrieval 1 / 2")).toBeTruthy();
    expect(screen.getByText("definition of RAG")).toBeTruthy();
  });

  it("disables prev at the first cycle and steps forward", () => {
    const onNext = vi.fn();
    const onPrev = vi.fn();
    render(<ExecutionNav index={0} total={2} query="q" r={r} onPrev={onPrev} onNext={onNext} />);
    const prev = screen.getByLabelText(r.prevExecution) as HTMLButtonElement;
    const next = screen.getByLabelText(r.nextExecution) as HTMLButtonElement;
    expect(prev.disabled).toBe(true);
    expect(next.disabled).toBe(false);
    fireEvent.click(next);
    expect(onNext).toHaveBeenCalledOnce();
  });

  it("disables next at the last cycle", () => {
    render(<ExecutionNav index={1} total={2} query="q" r={r} onPrev={vi.fn()} onNext={vi.fn()} />);
    expect((screen.getByLabelText(r.nextExecution) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText(r.prevExecution) as HTMLButtonElement).disabled).toBe(false);
  });
});

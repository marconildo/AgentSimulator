import { useMemo } from "react";

import { useT } from "../i18n";
import { selectFrontend } from "../lib/stationDetail";
import { useSimulator } from "../store/useSimulator";
import type { TraceEvent } from "../types/events";
import { DetailShell, Mono, Scroll, Section } from "./DetailShell";

// 076-station-full-views — Frontend "open full view". Shows what the browser
// exchanged this turn: the message it POSTed, the request overrides it sent, and
// the streamed answer it received. The Inspector keeps the theory (thin client,
// no secrets in the browser). Pure projection of the captured trace.

const FRONTEND = "var(--color-sky)";

export function FrontendDetail({ onClose }: { onClose: () => void }) {
  const t = useT();
  const d = t.frontendDetail;
  const ins = t.inspector;

  const events = useSimulator((s) => s.events);
  const cursor = useSimulator((s) => s.cursor);
  const visible = useMemo<TraceEvent[]>(
    () => (cursor >= 0 ? events.slice(0, cursor + 1) : []),
    [events, cursor],
  );
  const fe = useMemo(() => selectFrontend(visible), [visible]);

  return (
    <DetailShell
      accent={FRONTEND}
      icon="🖥️"
      title={d.title}
      subtitle={d.subtitle}
      back={d.back}
      onClose={onClose}
      empty={!fe.sent}
      emptyText={d.empty}
    >
      {fe.message !== undefined && (
        <Section title={ins.requestSent} accent={FRONTEND}>
          <Mono>{fe.message}</Mono>
        </Section>
      )}
      {fe.request && (
        <Section title={ins.requestBody} accent={FRONTEND}>
          <Scroll>{JSON.stringify(fe.request, null, 2)}</Scroll>
        </Section>
      )}
      {fe.answer !== undefined && (
        <Section title={ins.answerReceived} accent={FRONTEND}>
          <Mono>{fe.answer}</Mono>
        </Section>
      )}
    </DetailShell>
  );
}

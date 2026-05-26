import { useState } from "react";

import { LearnMap } from "./LearnMap";
import { TopicDetail } from "./TopicDetail";

export function LearnPage() {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="flex min-h-0 flex-1">
      <main className="relative min-w-0 flex-1">
        <LearnMap selected={selected} onSelect={setSelected} />
      </main>
      <aside className="w-[400px] shrink-0 border-l border-[var(--color-line)] bg-[var(--color-panel)]">
        <TopicDetail selected={selected} onSelect={setSelected} />
      </aside>
    </div>
  );
}

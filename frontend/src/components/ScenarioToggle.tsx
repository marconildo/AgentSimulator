import { useEffect, useState } from "react";

import { useLang, useT } from "../i18n";
import { getConfig, type ScenarioInfo } from "../lib/chatApi";
import { SCENARIO_ORDER, useScenario } from "../lib/scenario";

// Maturity-ladder switcher in the header (008-scenario-framework). A global app
// mode like the cloud/language toggles. The rung names/blurbs come from
// /api/config (nothing hardcoded — AC2); selecting an upper rung shows its
// preview topology, but only `simple` can send (gated in ChatPanel). Rungs that
// don't execute yet are marked with a dashed "coming soon" style but stay
// selectable so the learner can read the future architecture.
export function ScenarioToggle() {
  const scenario = useScenario((s) => s.scenario);
  const setScenario = useScenario((s) => s.setScenario);
  const lang = useLang((s) => s.lang);
  const t = useT();
  const [scenarios, setScenarios] = useState<ScenarioInfo[] | null>(null);

  useEffect(() => {
    getConfig()
      .then((c) => setScenarios(c.scenarios))
      .catch(() => {});
  }, []);

  // Fall back to bare ids (still selectable) if config hasn't loaded yet.
  const rungs: ScenarioInfo[] =
    scenarios ??
    SCENARIO_ORDER.map((id) => ({
      id,
      name: { en: id, pt: id },
      blurb: { en: "", pt: "" },
      available: id === "simple",
    }));

  return (
    <div
      className="flex items-center gap-0.5 rounded-full border border-[var(--color-line)] p-0.5"
      role="group"
      aria-label={t.scenario.label}
      title={t.scenario.label}
    >
      {rungs.map((rung) => {
        const active = scenario === rung.id;
        return (
          <button
            key={rung.id}
            onClick={() => setScenario(rung.id)}
            aria-pressed={active}
            title={rung.blurb[lang] || undefined}
            className="rounded-full px-2 py-0.5 text-[11px] font-semibold transition"
            style={{
              background: active ? "var(--color-panel-2)" : "transparent",
              border: `1px ${rung.available ? "solid" : "dashed"} ${
                active ? "var(--color-accent)" : "transparent"
              }`,
              color: active ? "var(--color-indigo-soft)" : "var(--color-muted)",
            }}
          >
            {rung.name[lang]}
            {!rung.available && (
              <span className="ml-1 opacity-60" aria-hidden>
                ⌛
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

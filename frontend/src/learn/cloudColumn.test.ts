// 024-learn-cloud-column — when a cloud is selected, the Learn map grows a
// "Build on {cloud}" column listing the concrete managed service for each layer
// of this system, reusing the stations.ts clouds{} model (no duplication). These
// tests pin (AC1) generic → nothing, (AC2) services borrowed from the shared
// model + refs/topics resolve, (AC3) en/pt parity, (AC4) map column rendering,
// (AC5) a brand icon for every cloud. All offline (pure data — no OpenAI key).

import { describe, expect, it } from "vitest";

import type { Lang } from "../i18n";
import { type CloudId, cloudValue } from "../lib/cloud";
import { CLOUD_ICONS } from "../lib/cloudIcons";
import { boundaryFor, stationByIdFor, tierByIdFor } from "../lib/stations";
import { CLOUD_GUIDE_SRC, allTopicsFor, cloudElementFor, cloudGuideFor, sectionsFor } from "./content";
import { buildGraph } from "./LearnMap";

const LANGS: Lang[] = ["en", "pt"];
const PROVIDERS: CloudId[] = ["azure", "aws", "gcp"];

describe("cloud guide — generic shows nothing (AC1)", () => {
  for (const lang of LANGS) {
    it(`cloudGuideFor("generic", ${lang}) is empty`, () => {
      expect(cloudGuideFor("generic", lang)).toEqual([]);
    });
  }
});

describe("cloud guide — services come from the shared model (AC2)", () => {
  for (const lang of LANGS) {
    for (const cloud of PROVIDERS) {
      it(`every ${cloud} entry borrows cloudValue() and resolves (${lang})`, () => {
        const guide = cloudGuideFor(cloud, lang);
        expect(guide.length).toBe(CLOUD_GUIDE_SRC.length);
        const topics = allTopicsFor(lang);
        guide.forEach((entry, i) => {
          const src = CLOUD_GUIDE_SRC[i];
          const el = cloudElementFor(src.ref, lang);
          expect(el, `dangling ref: ${src.ref}`).toBeTruthy();
          expect(entry.service).toBe(cloudValue(el!, cloud));
          expect(entry.service.trim(), `empty service: ${src.ref} (${cloud})`).toBeTruthy();
          expect(topics[entry.topicId], `dangling topicId: ${entry.topicId}`).toBeTruthy();
        });
      });
    }
  }

  it("every CLOUD_GUIDE_SRC ref resolves to a station/tier/boundary", () => {
    const lang: Lang = "en";
    const stations = stationByIdFor(lang) as unknown as Record<string, unknown>;
    const tiers = tierByIdFor(lang) as unknown as Record<string, unknown>;
    const boundaryId = boundaryFor(lang).id;
    for (const e of CLOUD_GUIDE_SRC) {
      const resolves = !!stations[e.ref] || !!tiers[e.ref] || boundaryId === e.ref;
      expect(resolves, `unresolvable ref: ${e.ref}`).toBe(true);
    }
  });
});

describe("cloud guide — bilingual parity (AC3)", () => {
  for (const cloud of PROVIDERS) {
    it(`en and pt ${cloud} guides match in length, topic order, and have non-empty labels`, () => {
      const en = cloudGuideFor(cloud, "en");
      const pt = cloudGuideFor(cloud, "pt");
      expect(pt.length).toBe(en.length);
      expect(pt.map((e) => e.topicId)).toEqual(en.map((e) => e.topicId));
      for (const e of [...en, ...pt]) expect(e.label.trim(), "empty label").toBeTruthy();
    });
  }
});

describe("learn map — cloud column rendering (AC4)", () => {
  it("generic builds no cloud column", () => {
    const { nodes } = buildGraph(null, sectionsFor("en"), "generic", "en");
    expect(nodes.find((n) => n.id === "cloud-col")).toBeUndefined();
    expect(nodes.filter((n) => n.id.startsWith("cloud:"))).toHaveLength(0);
  });

  for (const cloud of PROVIDERS) {
    it(`${cloud} builds a header + one namespaced node per guide entry`, () => {
      const lang: Lang = "en";
      const guide = cloudGuideFor(cloud, lang);
      const { nodes } = buildGraph(null, sectionsFor(lang), cloud, lang);
      expect(nodes.find((n) => n.id === "cloud-col"), "missing cloud-col header").toBeTruthy();
      const cloudNodes = nodes.filter((n) => n.id.startsWith("cloud:"));
      expect(cloudNodes).toHaveLength(guide.length);
      const topics = allTopicsFor(lang);
      for (const n of cloudNodes) {
        const topicId = n.id.replace(/^cloud:/, "");
        expect(topics[topicId], `node ${n.id} maps to a real topic`).toBeTruthy();
      }
    });
  }
});

describe("cloud brand icons (AC5)", () => {
  const ALL: CloudId[] = ["generic", "azure", "aws", "gcp"];
  for (const c of ALL) {
    it(`CLOUD_ICONS has a component for ${c}`, () => {
      expect(typeof CLOUD_ICONS[c]).toBe("function");
    });
  }
});

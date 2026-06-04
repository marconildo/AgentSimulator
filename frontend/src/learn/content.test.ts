// 023-learn-content-enrichment — the Learn page is the project's study guide, so
// these tests pin (AC1) full concept coverage, (AC2) the enriched how/options
// blocks, (AC3) cloud-aware resolution, (AC4) en/pt parity, and (AC5) link hygiene.

import { describe, expect, it } from "vitest";

import type { Lang } from "../i18n";
import { type CloudId } from "../lib/cloud";
import { boundaryFor, stationByIdFor, tierByIdFor } from "../lib/stations";
import { allTopicsFor, cloudContentFor, sectionsFor } from "./content";

const LANGS: Lang[] = ["en", "pt"];

// AC1 — the assessment list: every technology/concept the project uses or
// demonstrates must have a Learn topic. Removing a required topic fails here.
const REQUIRED_TOPIC_IDS = [
  // architecture / software (representative pin of existing coverage)
  "tiers",
  "client-tier",
  "api-tier",
  "agent-tier",
  "services-tier",
  "event-driven",
  "contract",
  "provider-pattern",
  "state-machine",
  "containers",
  // gen-ai
  "tokens",
  "embeddings",
  "vector-search",
  "rag",
  "chunking",
  "agents-react",
  "agent-harness",
  "tool-calling",
  "agent-memory",
  "context-window",
  "prompt",
  "streaming",
  // security
  "tls",
  "private-net",
  "cors",
  "secrets",
  "validation",
  "safe-tools",
  // infra
  "hops",
  "ingress",
  "sse-http",
  "stateless-scaling",
  "cloud-mapping",
  "vnet",
  // data
  "vector-db",
  "ann-index",
  "app-db",
  "in-memory",
  // production rungs
  "deepagents",
  "multi-agent",
  "reranker",
  "hybrid-search",
  "llm-gateway",
  "guardrails",
  "semantic-cache",
  "eval-runner",
  "observability",
  // new gap topics (023)
  "langgraph",
  "i18n-bilingual",
  "openai-provider",
  "token-cost",
  "timeline-phases",
  "maturity-ladder",
  "health-checks",
  "trace-replay",
  "react-flow",
  "framer-motion",
  "tailwind",
  "state-management",
  "pure-projection",
] as const;

describe("learn content coverage (AC1)", () => {
  for (const lang of LANGS) {
    it(`every required concept has a topic (${lang})`, () => {
      const topics = allTopicsFor(lang);
      for (const id of REQUIRED_TOPIC_IDS) {
        expect(topics[id], `missing topic: ${id}`).toBeTruthy();
      }
    });
  }
});

describe("enriched blocks (AC2)", () => {
  for (const lang of LANGS) {
    it(`every topic has non-empty how + options (${lang})`, () => {
      for (const section of sectionsFor(lang)) {
        for (const t of section.topics) {
          expect(t.how?.trim(), `how empty: ${t.id}`).toBeTruthy();
          expect(t.options?.trim(), `options empty: ${t.id}`).toBeTruthy();
        }
      }
    });
  }
});

describe("cloud-aware content (AC3)", () => {
  it("returns null for generic", () => {
    const t = allTopicsFor("en")["client-tier"].topic;
    expect(cloudContentFor(t, "generic", "en")).toBeNull();
  });

  it("borrows the stations.ts service name for a cloudRef topic", () => {
    const lang: Lang = "en";
    const t = allTopicsFor(lang)["client-tier"].topic; // cloudRef: "client" (tier)
    const tiers = tierByIdFor(lang) as unknown as Record<string, { clouds: Record<string, string> }>;
    for (const cloud of ["azure", "aws", "gcp"] as CloudId[]) {
      const content = cloudContentFor(t, cloud, lang);
      expect(content?.service).toBe(tiers["client"].clouds[cloud]);
      expect(content?.service?.trim()).toBeTruthy();
    }
  });

  it("surfaces a hand-authored note even without a cloudRef (secrets)", () => {
    const t = allTopicsFor("en")["secrets"].topic;
    expect(t.cloudRef).toBeUndefined();
    expect(cloudContentFor(t, "azure", "en")?.note?.trim()).toBeTruthy();
  });

  it("every cloudRef resolves to a real station/tier/boundary", () => {
    const lang: Lang = "en";
    const stations = stationByIdFor(lang) as unknown as Record<string, unknown>;
    const tiers = tierByIdFor(lang) as unknown as Record<string, unknown>;
    const boundaryId = boundaryFor(lang).id;
    for (const section of sectionsFor(lang)) {
      for (const t of section.topics) {
        if (!t.cloudRef) continue;
        const resolves = !!stations[t.cloudRef] || !!tiers[t.cloudRef] || boundaryId === t.cloudRef;
        expect(resolves, `dangling cloudRef: ${t.id} → ${t.cloudRef}`).toBe(true);
      }
    }
  });
});

describe("bilingual parity (AC4)", () => {
  it("en and pt have the same section ids in order", () => {
    expect(sectionsFor("pt").map((s) => s.id)).toEqual(sectionsFor("en").map((s) => s.id));
  });

  it("en and pt have the same topic ids per section, and equal link counts", () => {
    const en = sectionsFor("en");
    const pt = sectionsFor("pt");
    for (let i = 0; i < en.length; i++) {
      expect(pt[i].topics.map((t) => t.id)).toEqual(en[i].topics.map((t) => t.id));
      for (let j = 0; j < en[i].topics.length; j++) {
        expect(pt[i].topics[j].links?.length ?? 0).toBe(en[i].topics[j].links?.length ?? 0);
      }
    }
  });

  it("every translatable prose field is non-empty in both languages", () => {
    for (const lang of LANGS) {
      for (const section of sectionsFor(lang)) {
        expect(section.title.trim()).toBeTruthy();
        expect(section.intro.trim()).toBeTruthy();
        for (const t of section.topics) {
          for (const field of [t.title, t.what, t.why, t.how, t.options]) {
            expect(field?.trim(), `empty field in ${t.id} (${lang})`).toBeTruthy();
          }
        }
      }
    }
  });
});

describe("study links well-formed (AC5)", () => {
  it("every link has a non-empty label and an https URL", () => {
    for (const section of sectionsFor("en")) {
      for (const t of section.topics) {
        for (const link of t.links ?? []) {
          expect(link.label.trim(), `empty label in ${t.id}`).toBeTruthy();
          expect(link.url).toMatch(/^https:\/\//);
        }
      }
    }
  });
});

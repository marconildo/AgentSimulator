// Cloud-provider overlay. The architecture is cloud-agnostic; this lets the
// visitor see how each agnostic role maps to a concrete managed service on a
// specific provider. Mirrors the i18n language store: a tiny Zustand store
// persisted to localStorage. "generic" shows the cloud-agnostic role only.

import { create } from "zustand";

export type CloudId = "generic" | "azure" | "aws" | "gcp";

/** Provider-specific values keyed by cloud (proper nouns — never translated). */
export type CloudMap = { azure: string; aws: string; gcp: string };

// Provider brand marks live in `cloudIcons.tsx` (`CLOUD_ICONS`), keyed by `code`.
export const CLOUDS: { code: CloudId; label: string }[] = [
  { code: "generic", label: "Generic" },
  { code: "azure", label: "Azure" },
  { code: "aws", label: "AWS" },
  { code: "gcp", label: "GCP" },
];

/** Resolve a value for the active cloud, falling back to the agnostic role. */
export function cloudValue(m: { generic: string; clouds: CloudMap }, cloud: CloudId): string {
  return cloud === "generic" ? m.generic : m.clouds[cloud];
}

const STORAGE_KEY = "agentsim.cloud";
const DEFAULT_CLOUD: CloudId = "generic";

function isCloud(v: unknown): v is CloudId {
  return v === "generic" || v === "azure" || v === "aws" || v === "gcp";
}

function initialCloud(): CloudId {
  if (typeof localStorage !== "undefined") {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isCloud(saved)) return saved;
  }
  return DEFAULT_CLOUD;
}

interface CloudState {
  cloud: CloudId;
  setCloud: (cloud: CloudId) => void;
}

export const useCloud = create<CloudState>((set) => ({
  cloud: initialCloud(),
  setCloud: (cloud) => {
    if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, cloud);
    set({ cloud });
  },
}));

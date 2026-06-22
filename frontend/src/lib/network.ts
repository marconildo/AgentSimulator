// 088-network-layer — frontend gate for the real ingress chain.
//
// The five appliance containers (DNS · CDN · WAF · TLS/LB · API-GW) come up with
// `docker compose up`; the Build "Network" component is enabled only when the
// backend reports the chain is present (`/api/config.network_available`). A bare
// `uvicorn` run reports it absent, so the toggle is disabled (the containers
// aren't there). This is read-only — the frontend never starts/stops anything.

import { useEffect, useState } from "react";

import { getConfig } from "./chatApi";

/** Whether the real ingress chain is present (the Docker network stack is up). */
export function useNetworkAvailable(): boolean {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let active = true;
    getConfig()
      .then((cfg) => {
        if (active) setAvailable(Boolean(cfg.network_available));
      })
      .catch(() => {
        // Config unreachable ⇒ treat the chain as unavailable (fail closed).
      });
    return () => {
      active = false;
    };
  }, []);
  return available;
}

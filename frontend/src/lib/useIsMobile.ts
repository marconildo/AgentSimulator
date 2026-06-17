// 063-mobile-demo-layout — a tiny `matchMedia` subscriber for the phone-width
// breakpoint (below Tailwind `md`). The ONLY place that reads viewport width;
// everything else gates on the boolean it returns. SSR / no-`matchMedia` safe.

import { useEffect, useState } from "react";

const QUERY = "(max-width: 767px)";

function query(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(QUERY).matches;
}

/** True when the viewport is phone-width (`max-width: 767px`). Re-renders when
 *  the viewport crosses the breakpoint. Returns `false` without `matchMedia`. */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(query);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(QUERY);
    const onChange = () => setIsMobile(mql.matches);
    onChange(); // sync in case the viewport changed between render and effect
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}

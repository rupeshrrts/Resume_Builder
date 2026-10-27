"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Counts a page view for the owner's dashboard. No cookies, no third parties; the server stores only
 * the page path, the referring site and the device type. Respects "Do Not Track" / Global Privacy Control.
 */
export function PageViewTracker() {
  const path = usePathname();
  useEffect(() => {
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
    if (nav.doNotTrack === "1" || nav.globalPrivacyControl) return;
    const body = JSON.stringify({ path, referrer: document.referrer });
    fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => undefined);
  }, [path]);
  return null;
}

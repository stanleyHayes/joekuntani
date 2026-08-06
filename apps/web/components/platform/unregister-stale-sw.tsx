"use client";

import { useEffect } from "react";

/** Clears hostile/stale service workers that break CSP and admin routes on localhost. */
export function UnregisterStaleServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    void (async () => {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        registrations.map(async (registration) => {
          await registration.unregister();
        }),
      );
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }
    })();
  }, []);
  return null;
}

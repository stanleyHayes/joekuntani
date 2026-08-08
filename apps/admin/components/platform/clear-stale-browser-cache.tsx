"use client";

import { useEffect } from "react";

/**
 * The admin origin previously hosted the public application's /admin routes.
 * Remove any worker/cache left by that deployment so it cannot keep serving
 * the retired login bundle after the standalone console is promoted.
 */
export function ClearStaleBrowserCache() {
  useEffect(() => {
    void (async () => {
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(
          registrations.map((registration) => registration.unregister()),
        );
      }

      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }
    })();
  }, []);

  return null;
}

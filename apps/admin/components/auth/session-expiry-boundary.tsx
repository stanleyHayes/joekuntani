"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";

/**
 * Converts an expired admin session into navigation, once, at the shared shell.
 *
 * Workspaces intentionally keep ownership of their ordinary 4xx/5xx errors.
 * A 401 is different: every protected screen has the same recovery path, and
 * leaving the stale screen mounted only turns expiry into misleading local
 * permission errors. The wrapper is installed in a layout effect so it is in
 * place before workspace passive effects issue their initial requests.
 */
export function SessionExpiryBoundary({ children }: { children: ReactNode }) {
  const router = useRouter();
  const redirecting = useRef(false);

  useLayoutEffect(() => {
    const originalFetch = globalThis.fetch;

    const sessionAwareFetch: typeof fetch = async (input, init) => {
      const response = await originalFetch(input, init);
      if (
        response.status === 401 &&
        isAdminAPIRequest(input) &&
        !redirecting.current
      ) {
        redirecting.current = true;
        router.replace("/login");
        router.refresh();
      }
      return response;
    };

    globalThis.fetch = sessionAwareFetch;
    return () => {
      if (globalThis.fetch === sessionAwareFetch)
        globalThis.fetch = originalFetch;
    };
  }, [router]);

  return <>{children}</>;
}

function isAdminAPIRequest(input: RequestInfo | URL) {
  const raw =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  try {
    const url = new URL(raw, window.location.origin);
    return (
      url.origin === window.location.origin &&
      url.pathname.startsWith("/api/admin/")
    );
  } catch {
    return false;
  }
}

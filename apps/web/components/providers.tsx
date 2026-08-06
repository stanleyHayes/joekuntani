"use client";

import type { ReactNode } from "react";
import { UnregisterStaleServiceWorker } from "./platform/unregister-stale-sw";
import { ThemeProvider } from "./theme/theme-provider";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <UnregisterStaleServiceWorker />
      {children}
    </ThemeProvider>
  );
}

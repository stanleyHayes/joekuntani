import { render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { UnregisterStaleServiceWorker } from "./unregister-stale-sw";

afterEach(() => {
  Reflect.deleteProperty(navigator, "serviceWorker");
  vi.unstubAllGlobals();
});

it("does nothing when service workers are unsupported", () => {
  expect(() => render(<UnregisterStaleServiceWorker />)).not.toThrow();
});

it("unregisters workers and removes their cached responses", async () => {
  const unregister = vi.fn().mockResolvedValue(true);
  const getRegistrations = vi
    .fn()
    .mockResolvedValue([{ unregister }, { unregister }]);
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { getRegistrations },
  });
  const deleteCache = vi.fn().mockResolvedValue(true);
  vi.stubGlobal("caches", {
    keys: vi.fn().mockResolvedValue(["old-shell", "old-assets"]),
    delete: deleteCache,
  });

  render(<UnregisterStaleServiceWorker />);

  await waitFor(() => {
    expect(getRegistrations).toHaveBeenCalledOnce();
    expect(unregister).toHaveBeenCalledTimes(2);
    expect(deleteCache).toHaveBeenCalledTimes(2);
  });
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { SessionExpiryBoundary } from "./session-expiry-boundary";

const navigation = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
}));

afterEach(() => {
  vi.unstubAllGlobals();
  navigation.replace.mockReset();
  navigation.refresh.mockReset();
});

function RequestButton({ url = "/api/admin/auth/me" }: { url?: string }) {
  return <button onClick={() => void fetch(url)}>Request</button>;
}

it("redirects an expired same-origin admin request to login once", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 401 })),
  );
  render(
    <SessionExpiryBoundary>
      <RequestButton />
    </SessionExpiryBoundary>,
  );

  fireEvent.click(screen.getByRole("button", { name: "Request" }));
  fireEvent.click(screen.getByRole("button", { name: "Request" }));

  await waitFor(() =>
    expect(navigation.replace).toHaveBeenCalledWith("/login"),
  );
  expect(navigation.replace).toHaveBeenCalledTimes(1);
  expect(navigation.refresh).toHaveBeenCalledTimes(1);
});

it("leaves real permission denials and non-admin requests on the page", async () => {
  const fetcher = vi.fn(
    async (input: RequestInfo | URL) =>
      new Response(null, {
        status: String(input).includes("permission") ? 403 : 401,
      }),
  );
  vi.stubGlobal("fetch", fetcher);
  render(
    <SessionExpiryBoundary>
      <RequestButton url="/api/admin/permission" />
      <RequestButton url="/api/public/content" />
    </SessionExpiryBoundary>,
  );

  const buttons = screen.getAllByRole("button", { name: "Request" });
  fireEvent.click(buttons[0]!);
  fireEvent.click(buttons[1]!);

  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(navigation.replace).not.toHaveBeenCalled();
  expect(navigation.refresh).not.toHaveBeenCalled();
});

it("restores the original fetch implementation when the shell unmounts", () => {
  const original = vi.fn(async () => new Response(null, { status: 200 }));
  vi.stubGlobal("fetch", original);
  const view = render(
    <SessionExpiryBoundary>
      <p>Protected</p>
    </SessionExpiryBoundary>,
  );

  expect(globalThis.fetch).not.toBe(original);
  view.unmount();
  expect(globalThis.fetch).toBe(original);
});

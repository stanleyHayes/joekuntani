import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import type { PublicService } from "../../services/types";
import { ServiceManager } from "./service-manager";

const first: PublicService = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Approved first",
  slug: "approved-first",
  summary: "Approved summary",
  description: "",
  category: "Approved category",
  active: true,
  state: "active",
  version: 1,
  sort_order: 0,
  form_schema: { version: 1, questions: [] },
  cta: { label: "Share a brief", href: "/book" },
  created_at: "2026-08-05T00:00:00Z",
  updated_at: "2026-08-05T00:00:00Z",
};
const second = {
  ...first,
  id: "22222222-2222-4222-8222-222222222222",
  name: "Approved second",
  slug: "approved-second",
  active: false,
  sort_order: 1,
};

afterEach(() => vi.unstubAllGlobals());

it("loads services and sends editing to its own page", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [first, second] }), { status: 200 }),
    );
  vi.stubGlobal("fetch", fetcher);
  render(<ServiceManager />);
  expect(await screen.findByText("Approved first")).toBeVisible();
  // The editor is a route, so no form opens over the list.
  expect(screen.queryByLabelText("Service name")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Add service" })).toHaveAttribute(
    "href",
    "/admin/services/new",
  );
  expect(screen.getAllByRole("link", { name: "Edit" })[0]).toHaveAttribute(
    "href",
    `/admin/services/${first.id}`,
  );
});

it("reorders and toggles lifecycle through explicit controls", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [first, second] }), { status: 200 }),
    )
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetcher);
  render(<ServiceManager />);
  await screen.findByText("Approved first");
  fireEvent.click(
    screen.getByRole("button", { name: "Move Approved second up" }),
  );
  await screen.findByText("Display order saved and audited.");
  fireEvent.click(screen.getByRole("button", { name: "Publish" }));
  await screen.findByText("Service published.");
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
  expect(JSON.parse(fetcher.mock.calls[1]?.[1]?.body as string)).toEqual({
    items: [
      { id: second.id, version: second.version },
      { id: first.id, version: first.version },
    ],
  });
});

it("confirms and safely retires a service while preserving history", async () => {
  const retired = {
    ...first,
    active: false,
    state: "retired" as const,
    version: 2,
    retired_at: "2026-08-05T15:30:00Z",
  };
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [first] }), { status: 200 }),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify(retired), { status: 200 }),
    );
  vi.stubGlobal("fetch", fetcher);
  vi.spyOn(window, "confirm").mockReturnValue(true);
  render(<ServiceManager />);
  await screen.findByText("Approved first");
  fireEvent.click(screen.getByRole("button", { name: "Retire" }));
  expect(
    await screen.findByText("Service retired and retained in history."),
  ).toBeVisible();
  expect(screen.getByText("Retired")).toBeVisible();
  // A retired service keeps its history but can no longer be opened.
  expect(screen.getByRole("button", { name: "Edit" })).toBeDisabled();
  expect(fetcher.mock.calls[1]).toEqual([
    `/api/admin/services/${first.id}`,
    expect.objectContaining({
      method: "DELETE",
      headers: expect.objectContaining({ "If-Match": "1" }),
    }),
  ]);
});

it("leaves service history unchanged when retirement is cancelled", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [first] }), { status: 200 }),
    );
  vi.stubGlobal("fetch", fetcher);
  vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<ServiceManager />);
  await screen.findByText("Approved first");
  fireEvent.click(screen.getByRole("button", { name: "Retire" }));
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(screen.getByText("Published")).toBeVisible();
});

it("reports a stale retirement without changing the service", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [first] }), { status: 200 }),
    )
    .mockResolvedValueOnce(new Response(null, { status: 409 }));
  vi.stubGlobal("fetch", fetcher);
  vi.spyOn(window, "confirm").mockReturnValue(true);
  render(<ServiceManager />);
  await screen.findByText("Approved first");
  fireEvent.click(screen.getByRole("button", { name: "Retire" }));
  expect(
    await screen.findByText(
      "The service could not be retired. Refresh and try again.",
    ),
  ).toBeVisible();
  expect(screen.getByText("Published")).toBeVisible();
});

it("shows a safe load failure without exposing internals", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("secret")));
  render(<ServiceManager />);
  expect(
    await screen.findByText("Services could not be loaded. Try again."),
  ).toBeVisible();
  expect(screen.queryByText("secret")).toBeNull();
});

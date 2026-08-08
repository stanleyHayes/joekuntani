import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { refreshPublishedContent } from "./content-api";
import { CMSWorkspace } from "./cms-workspace";

afterEach(() => vi.unstubAllGlobals());

it("verifies the role before exposing the workspace", async () => {
  const fetcher = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith("/auth/me"))
      return new Response(JSON.stringify({ role: "content_editor" }), {
        status: 200,
      });
    return new Response(JSON.stringify({ items: [] }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetcher);
  render(<CMSWorkspace />);
  expect(screen.getByRole("status")).toHaveTextContent(
    "Verifying content permissions",
  );
  expect(
    await screen.findByText(
      /Administrator approval and publication are required/,
    ),
  ).toBeVisible();
  expect(await screen.findByText("No page content exists yet.")).toBeVisible();
});

it("fails closed when the role cannot be verified", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
  );
  render(<CMSWorkspace />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "permissions could not be verified",
  );
  expect(screen.queryByRole("button", { name: "Save draft" })).toBeNull();
});

it.each(["booking_manager", "analyst"])(
  "denies the %s role before loading protected domain records",
  async (role) => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ role }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetcher);
    render(<CMSWorkspace />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "does not include content-management permission",
    );
    expect(fetcher).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Save draft" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add service" })).toBeNull();
  },
);

it("loads and selects service management inside the unified workspace", async () => {
  const service = {
    id: crypto.randomUUID(),
    name: "Approved service",
    slug: "approved-service",
    summary: "Approved summary",
    description: "Approved description",
    category: "Live",
    active: true,
    state: "active",
    version: 1,
    sort_order: 0,
    form_schema: { version: 1, questions: [] },
    cta: { label: "Enquire", href: "/book" },
    created_at: "2026-08-05T00:00:00Z",
    updated_at: "2026-08-05T00:00:00Z",
  };
  const fetcher = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith("/auth/me"))
      return new Response(JSON.stringify({ role: "administrator" }));
    if (url.endsWith("/media"))
      return new Response(JSON.stringify({ assets: [] }));
    if (url.endsWith("/services"))
      return new Response(JSON.stringify({ items: [service] }));
    return new Response(JSON.stringify({ items: [] }));
  });
  vi.stubGlobal("fetch", fetcher);
  render(<CMSWorkspace />);
  const servicesTab = await screen.findByRole("button", { name: "Services" });
  fireEvent.click(servicesTab);
  expect(await screen.findByText("Approved service")).toBeVisible();
  // Both workspaces edit on their own route now, so the tab's job ends at
  // listing what can be opened.
  expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute(
    "href",
    `/services/${service.id}`,
  );
  expect(fetcher).toHaveBeenCalledWith(
    "/api/admin/services",
    expect.objectContaining({ cache: "no-store" }),
  );
});

it("uses a concrete no-store public refresh after a content transition", async () => {
  document.cookie = "jk_admin_csrf=refresh-token";
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ items: [] })));
  vi.stubGlobal("fetch", fetcher);
  await refreshPublishedContent({
    contentID: "123e4567-e89b-42d3-a456-426614174000",
    revision: 7,
    kind: "page",
    slug: "about",
    paths: ["/", "/about"],
    tags: [
      "public-content",
      "content:page",
      "content:123e4567-e89b-42d3-a456-426614174000",
    ],
    reason: "publish",
  });
  await waitFor(() =>
    expect(fetcher).toHaveBeenCalledWith(
      "/api/admin/cms/cache-invalidation",
      expect.objectContaining({
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: expect.objectContaining({ "X-CSRF-Token": "refresh-token" }),
      }),
    ),
  );
  expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toMatchObject({
    content_id: "123e4567-e89b-42d3-a456-426614174000",
    revision: 7,
    slug: "about",
  });
});

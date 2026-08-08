import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ContentItem } from "../../content/types";
import { ContentManager } from "./content-manager";

const page: ContentItem = {
  id: "123e4567-e89b-42d3-a456-426614174000",
  revision: 1,
  kind: "page",
  slug: "about",
  title: "Approved about",
  summary: "Approved summary",
  body: "Approved body",
  category: "",
  tags: [],
  featured: false,
  gallery_asset_ids: [],
  results: [],
  seo: {
    title: "About",
    description: "Approved description",
    canonical_url: "",
    social_image_asset_id: "",
  },
  status: "draft",
  approved: false,
  created_at: "2026-08-05T00:00:00Z",
  updated_at: "2026-08-05T00:00:00Z",
};
afterEach(() => vi.unstubAllGlobals());

// The editor is a route now, so the library's job ends at pointing to it. A row
// that opened a dialog could not be opened in a second tab or linked to.
it("loads drafts and points every row at its own editor route", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ items: [page] }), { status: 200 }),
      ),
  );
  render(<ContentManager />);
  expect(await screen.findByText("Approved about")).toBeVisible();
  expect(
    screen.queryByRole("dialog", { name: "Edit Approved about" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute(
    "href",
    `/admin/content/page/${page.id}`,
  );
  expect(screen.getByRole("link", { name: "New draft" })).toHaveAttribute(
    "href",
    "/admin/content/page/new",
  );
});

it("reloads the collection and retargets New draft when the type changes", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), { status: 200 }),
    );
  vi.stubGlobal("fetch", fetcher);
  render(<ContentManager />);
  await screen.findByText("No page content exists yet.");
  fireEvent.click(screen.getByRole("button", { name: "Content type" }));
  fireEvent.click(screen.getByRole("option", { name: "Portfolio" }));
  await screen.findByText("No portfolio content exists yet.");
  expect(fetcher.mock.calls.at(-1)?.[0]).toBe("/api/admin/content/portfolio");
  expect(screen.getByRole("link", { name: "New draft" })).toHaveAttribute(
    "href",
    "/admin/content/portfolio/new",
  );
});

it("filters the library without losing drafts", async () => {
  const portfolio = {
    ...page,
    id: "223e4567-e89b-42d3-a456-426614174000",
    title: "Festival campaign",
    category: "Live arts",
    tags: ["festival"],
  };
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [page, portfolio] }), {
        status: 200,
      }),
    ),
  );
  render(<ContentManager />);
  await screen.findByText("Festival campaign");
  fireEvent.change(screen.getByLabelText("Search title, slug or tag"), {
    target: { value: "festival" },
  });
  expect(screen.queryByText("Approved about")).toBeNull();
  expect(screen.getByText("Festival campaign")).toBeVisible();
  expect(screen.getByText("1 item of 2")).toBeVisible();
});

it("states the approval boundary the role is subject to", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ items: [page] }), { status: 200 }),
      ),
  );
  render(<ContentManager staffRole="content_editor" />);
  await screen.findByText("Approved about");
  expect(
    screen.getByText(/Administrator approval and publication are required/),
  ).toBeVisible();
});

it("fails closed without exposing infrastructure detail", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new Error("database secret")),
  );
  render(<ContentManager />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Content could not be loaded",
  );
  expect(screen.queryByText("database secret")).toBeNull();
});

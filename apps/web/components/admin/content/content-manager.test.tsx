import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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
const noCacheInvalidation = async () => undefined;
afterEach(() => vi.unstubAllGlobals());

it("loads drafts, edits without exposing immutable slug, and saves with CSRF", async () => {
  Object.defineProperty(document, "cookie", {
    configurable: true,
    value: "jk_admin_csrf=content-csrf",
  });
  const saved = { ...page, title: "Approved updated" };
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [page] }), { status: 200 }),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify(saved), { status: 200 }),
    );
  vi.stubGlobal("fetch", fetcher);
  render(<ContentManager requestCacheInvalidation={noCacheInvalidation} />);
  expect(await screen.findByText("Approved about")).toBeVisible();
  expect(
    screen.queryByRole("dialog", { name: "Edit Approved about" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  expect(screen.queryByLabelText("Immutable slug")).toBeNull();
  fireEvent.change(screen.getByLabelText("Title"), {
    target: { value: "Approved updated" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  expect(await screen.findByText(/Draft saved/)).toBeVisible();
  expect(fetcher.mock.calls[1]).toEqual([
    `/api/admin/content/page/${page.id}`,
    expect.objectContaining({
      method: "PUT",
      headers: expect.objectContaining({ "X-CSRF-Token": "content-csrf" }),
    }),
  ]);
});

it("keeps approval, preview, and publication as explicit controls", async () => {
  const approved = { ...page, approved: true };
  const preview = { ...approved, body: "Private approved preview" };
  const published = { ...approved, status: "published" as const };
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [approved] }), { status: 200 }),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify(preview), { status: 200 }),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify(published), { status: 200 }),
    );
  vi.stubGlobal("fetch", fetcher);
  render(<ContentManager requestCacheInvalidation={noCacheInvalidation} />);
  await screen.findByText("Approved about");
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  fireEvent.click(screen.getByRole("button", { name: "Private preview" }));
  expect(await screen.findByText("Private approved preview")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Publish now" }));
  expect(
    await screen.findByText(
      /Content published\. Public cache refresh requested/,
    ),
  ).toBeVisible();
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
  expect(JSON.parse(fetcher.mock.calls[2]?.[1]?.body as string)).toMatchObject({
    action: "publish",
  });
});

it("shows content-safe errors and validates results before network mutation", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ items: [page] }), { status: 200 }),
      ),
  );
  render(<ContentManager requestCacheInvalidation={noCacheInvalidation} />);
  await screen.findByText("Approved about");
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  fireEvent.change(screen.getByLabelText("Results JSON"), {
    target: { value: "{" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Results must be a JSON list",
  );
  expect(screen.queryByText(/secret|stack|mongo/i)).toBeNull();
});

it("shows kind-specific accessible fields and creates a portfolio draft", async () => {
  const portfolio: ContentItem = {
    ...page,
    id: "223e4567-e89b-42d3-a456-426614174000",
    kind: "portfolio",
    slug: "approved-work",
    title: "Approved work",
    category: "Live arts",
  };
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [] }), { status: 200 }),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [] }), { status: 200 }),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify(portfolio), { status: 201 }),
    );
  vi.stubGlobal("fetch", fetcher);
  render(<ContentManager requestCacheInvalidation={noCacheInvalidation} />);
  await screen.findByText("No page content exists yet.");
  fireEvent.click(screen.getByRole("button", { name: "Content type" }));
  fireEvent.click(screen.getByRole("option", { name: "Portfolio" }));
  await screen.findByText("No portfolio content exists yet.");
  expect(screen.queryByLabelText("Immutable slug")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "New draft" }));
  fireEvent.change(screen.getByLabelText("Immutable slug"), {
    target: { value: "approved-work" },
  });
  fireEvent.change(screen.getByLabelText("Title"), {
    target: { value: "Approved work" },
  });
  fireEvent.change(screen.getByLabelText("Category"), {
    target: { value: "Live arts" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  expect(await screen.findByText(/Draft saved/)).toBeVisible();
  expect(fetcher.mock.calls[2]?.[0]).toBe("/api/admin/content/portfolio");
});

it("reveals the correct fields when switching video, press, and testimonial", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ items: [] }), { status: 200 }),
      ),
  );
  render(<ContentManager requestCacheInvalidation={noCacheInvalidation} />);
  await screen.findByText("No page content exists yet.");
  fireEvent.click(screen.getByRole("button", { name: "Content type" }));
  fireEvent.click(screen.getByRole("option", { name: "Videos" }));
  expect(
    screen.queryByLabelText("Approved HTTPS embed URL"),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "New draft" }));
  expect(
    await screen.findByLabelText("Approved HTTPS embed URL"),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Content type" }));
  fireEvent.click(screen.getByRole("option", { name: "Press" }));
  expect(await screen.findByLabelText("Outlet")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Content type" }));
  fireEvent.click(screen.getByRole("option", { name: "Testimonials" }));
  expect(await screen.findByLabelText("Person name")).toBeVisible();
  expect(screen.getByLabelText("Organization")).toBeVisible();
});

it("supports approval revocation, scheduled publishing, and unpublishing", async () => {
  const revoked = { ...page, approved: false };
  const scheduled = {
    ...page,
    approved: true,
    status: "scheduled" as const,
    publish_at: "2026-08-06T10:00:00.000Z",
  };
  const unpublished = { ...scheduled, status: "unpublished" as const };
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [{ ...page, approved: true }] }), {
        status: 200,
      }),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify(revoked), { status: 200 }),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ ...revoked, approved: true }), {
        status: 200,
      }),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify(scheduled), { status: 200 }),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify(unpublished), { status: 200 }),
    );
  vi.stubGlobal("fetch", fetcher);
  render(<ContentManager requestCacheInvalidation={noCacheInvalidation} />);
  await screen.findByText("Approved about");
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  fireEvent.click(screen.getByRole("button", { name: "Revoke approval" }));
  expect(await screen.findByText("Approval revoked.")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Approve" }));
  expect(await screen.findByText("Content approved.")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Publish at" }));
  const publishDialog = screen.getByRole("dialog", { name: "Publish at" });
  fireEvent.change(within(publishDialog).getByLabelText("Hour"), {
    target: { value: "10" },
  });
  fireEvent.change(within(publishDialog).getByLabelText("Minute"), {
    target: { value: "0" },
  });
  fireEvent.click(
    within(publishDialog)
      .getAllByRole("button", { name: "6" })
      .find((button) => button.dataset.inMonth === "true")!,
  );
  fireEvent.click(screen.getByRole("button", { name: "Schedule" }));
  expect(
    await screen.findByText(
      /Publication scheduled\. Public cache refresh requested/,
    ),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Unpublish" }));
  expect(
    await screen.findByText(
      /Content unpublished\. Public cache refresh requested/,
    ),
  ).toBeVisible();
});

it("fails closed for load, preview, and mutation errors", async () => {
  const fetcher = vi.fn().mockRejectedValueOnce(new Error("database secret"));
  vi.stubGlobal("fetch", fetcher);
  const { unmount } = render(
    <ContentManager requestCacheInvalidation={noCacheInvalidation} />,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Content could not be loaded",
  );
  expect(screen.queryByText("database secret")).toBeNull();
  unmount();

  fetcher
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [page] }), { status: 200 }),
    )
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(new Response(null, { status: 422 }));
  render(<ContentManager requestCacheInvalidation={noCacheInvalidation} />);
  await screen.findByText("Approved about");
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  fireEvent.click(screen.getByRole("button", { name: "Private preview" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "private preview could not be loaded",
  );
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "content change was not accepted",
  );
});

it("filters the library without losing drafts and exposes revision audit context", async () => {
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
  render(<ContentManager requestCacheInvalidation={noCacheInvalidation} />);
  await screen.findByText("Festival campaign");
  fireEvent.change(screen.getByLabelText("Search title, slug or tag"), {
    target: { value: "festival" },
  });
  expect(screen.queryByText("Approved about")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  expect(screen.getByLabelText("Content audit context")).toHaveTextContent(
    "Revision1",
  );
});

it("makes administrator approval boundaries explicit and selects only ready media", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ items: [page] }), { status: 200 }),
      ),
  );
  render(
    <ContentManager
      requestCacheInvalidation={noCacheInvalidation}
      staffRole="content_editor"
      mediaOptions={[
        {
          id: "ready-id",
          filename: "portrait.webp",
          alt_text: "Approved portrait",
          status: "ready",
        },
        {
          id: "draft-id",
          filename: "draft.webp",
          alt_text: "Draft portrait",
          status: "draft",
        },
      ]}
    />,
  );
  await screen.findByText("Approved about");
  expect(
    screen.getByText(/Administrator approval and publication are required/),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
  expect(screen.queryByRole("option", { name: /draft\.webp/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Add approved media" }));
  fireEvent.click(
    screen.getByRole("option", {
      name: "portrait.webp — Approved portrait",
    }),
  );
  expect(
    screen.getByLabelText("Gallery asset UUIDs, one per line"),
  ).toHaveValue("ready-id");
});

it("prepares deterministic cache invalidation after publication and reports queue failure", async () => {
  const approved = { ...page, approved: true };
  const published = { ...approved, status: "published" as const };
  const requestCacheInvalidation = vi
    .fn()
    .mockRejectedValue(new Error("queue unavailable"));
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [approved] }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(published), { status: 200 }),
      ),
  );
  render(
    <ContentManager requestCacheInvalidation={requestCacheInvalidation} />,
  );
  await screen.findByText("Approved about");
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  fireEvent.click(screen.getByRole("button", { name: "Publish now" }));
  await waitFor(() =>
    expect(requestCacheInvalidation).toHaveBeenCalledWith(
      expect.objectContaining({
        contentID: page.id,
        reason: "publish",
        tags: ["public-content", "content:page", `content:${page.id}`],
      }),
    ),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "cache refresh request could not be queued",
  );
});

it("rewrites body copy through the assistant without renaming the field", async () => {
  Object.defineProperty(document, "cookie", {
    configurable: true,
    value: "jk_admin_csrf=content-csrf",
  });
  const encoder = new TextEncoder();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [page] }), { status: 200 }),
    )
    .mockResolvedValueOnce({
      ok: true,
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode("A sharper opening paragraph."));
          controller.close();
        },
      }),
    });
  vi.stubGlobal("fetch", fetcher);
  render(<ContentManager requestCacheInvalidation={noCacheInvalidation} />);

  expect(await screen.findByText("Approved about")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));

  const body = screen.getByLabelText("Body");
  fireEvent.change(body, { target: { value: "some rough body copy" } });
  fireEvent.click(
    within(body.closest("div") as HTMLElement).getByRole("button", {
      name: /Expand/,
    }),
  );
  fireEvent.click(await screen.findByRole("button", { name: /Use this/ }));

  await waitFor(() =>
    expect(screen.getByLabelText("Body")).toHaveValue(
      "A sharper opening paragraph.",
    ),
  );
  // The bar lives outside the <label>, so the control keeps its own name.
  expect(screen.getByLabelText("Summary")).toBeInTheDocument();
  const [url, init] = fetcher.mock.calls.at(-1)!;
  expect(url).toBe("/api/admin/ai/assist");
  expect(JSON.parse(String((init as RequestInit).body))).toMatchObject({
    action: "expand",
    field: "body",
  });
});

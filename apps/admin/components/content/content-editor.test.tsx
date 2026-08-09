import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import type { ContentItem } from "@joe-kuntani/shared/types/content";
import type { MediaOption, StaffRole } from "./content-api";
import { ContentEditor } from "./content-editor";

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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

/**
 * Routes by URL rather than by call order: the editor is its own route now, so
 * it verifies the role and loads media before it loads the item, and a
 * positional mock would break every time that sequence changed.
 */
function stubFetch({
  role = "administrator" as StaffRole,
  items = [] as ContentItem[],
  media = [] as MediaOption[],
  responses = [] as Response[],
  preview,
  assist,
}: {
  role?: StaffRole;
  items?: ContentItem[];
  media?: MediaOption[];
  /** Consumed in order by each mutating request. */
  responses?: Response[];
  preview?: Response;
  assist?: Response;
} = {}) {
  const queue = [...responses];
  const fetcher = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      if (url.endsWith("/api/admin/auth/me")) return json({ role });
      if (url === "/api/admin/media") return json({ assets: media });
      if (url === "/api/admin/ai/assist")
        return assist ?? new Response(null, { status: 503 });
      if (url.endsWith("/preview"))
        return preview ?? new Response(null, { status: 503 });
      if (!init?.method || init.method === "GET") return json({ items });
      return queue.shift() ?? new Response(null, { status: 500 });
    },
  );
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

type Fetcher = ReturnType<typeof stubFetch>;

function mutations(fetcher: Fetcher) {
  return fetcher.mock.calls.filter(
    ([, init]) => init?.method && init.method !== "GET",
  );
}

it("edits without exposing the immutable slug and saves with CSRF", async () => {
  Object.defineProperty(document, "cookie", {
    configurable: true,
    value: "jk_admin_csrf=content-csrf",
  });
  const fetcher = stubFetch({
    items: [page],
    responses: [json({ ...page, title: "Approved updated" })],
  });
  render(
    <ContentEditor
      kind="page"
      contentID={page.id}
      requestCacheInvalidation={noCacheInvalidation}
    />,
  );
  expect(await screen.findByLabelText("Title")).toHaveValue("Approved about");
  expect(screen.queryByLabelText("Immutable slug")).toBeNull();
  fireEvent.change(screen.getByLabelText("Title"), {
    target: { value: "Approved updated" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  expect(await screen.findByText(/Draft saved/)).toBeVisible();
  expect(mutations(fetcher)[0]).toEqual([
    `/api/admin/content/page/${page.id}`,
    expect.objectContaining({
      method: "PUT",
      headers: expect.objectContaining({ "X-CSRF-Token": "content-csrf" }),
    }),
  ]);
  expect(screen.getByLabelText("Content audit context")).toHaveTextContent(
    "Revision1",
  );
});

it("takes an immutable slug on creation and posts to the collection", async () => {
  const portfolio: ContentItem = {
    ...page,
    id: "223e4567-e89b-42d3-a456-426614174000",
    kind: "portfolio",
    slug: "approved-work",
    title: "Approved work",
    category: "Live arts",
  };
  const fetcher = stubFetch({ responses: [json(portfolio, 201)] });
  render(
    <ContentEditor
      kind="portfolio"
      contentID="new"
      requestCacheInvalidation={noCacheInvalidation}
    />,
  );
  fireEvent.change(await screen.findByLabelText("Immutable slug"), {
    target: { value: "approved-work" },
  });
  fireEvent.change(screen.getByLabelText("Title"), {
    target: { value: "Approved work" },
  });
  fireEvent.change(screen.getByLabelText("Category"), {
    target: { value: "Live arts" },
  });
  // Nothing to approve or publish until the record exists.
  expect(screen.getByText("Not saved yet")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  expect(await screen.findByText(/Draft saved/)).toBeVisible();
  expect(mutations(fetcher)[0]?.[0]).toBe("/api/admin/content/portfolio");
  expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled();
});

it("keeps approval, preview, and publication as explicit controls", async () => {
  const approved = { ...page, approved: true };
  const fetcher = stubFetch({
    items: [approved],
    preview: json({ ...approved, body: "Private approved preview" }),
    responses: [json({ ...approved, status: "published" })],
  });
  render(
    <ContentEditor
      kind="page"
      contentID={page.id}
      requestCacheInvalidation={noCacheInvalidation}
    />,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Private preview" }),
  );
  expect(await screen.findByText("Private approved preview")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Publish now" }));
  expect(
    await screen.findByText(
      /Content published\. Public cache refresh requested/,
    ),
  ).toBeVisible();
  expect(JSON.parse(String(mutations(fetcher)[0]?.[1]?.body))).toMatchObject({
    action: "publish",
  });
});

// Results used to be hand-written JSON, so a stray brace failed the save with a
// parser message. Two strings per row cannot be malformed, and half-typed rows
// must not reach the API as empty results.
it("edits results as labelled rows and drops the blank ones", async () => {
  const fetcher = stubFetch({ items: [page], responses: [json(page)] });
  render(
    <ContentEditor
      kind="page"
      contentID={page.id}
      requestCacheInvalidation={noCacheInvalidation}
    />,
  );
  expect(await screen.findByLabelText("Label 1")).toBeVisible();
  expect(screen.queryByLabelText("Results JSON")).toBeNull();
  fireEvent.change(screen.getByLabelText("Label 1"), {
    target: { value: "Tickets sold" },
  });
  fireEvent.change(screen.getByLabelText("Value 1"), {
    target: { value: "12,400" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add result" }));
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

  await waitFor(() => expect(mutations(fetcher)).toHaveLength(1));
  expect(JSON.parse(String(mutations(fetcher)[0]?.[1]?.body))).toMatchObject({
    results: [{ label: "Tickets sold", value: "12,400" }],
  });
});

it("shows content-safe errors without exposing infrastructure detail", async () => {
  stubFetch({
    items: [page],
    responses: [json({ detail: "mongo secret" }, 500)],
  });
  render(
    <ContentEditor
      kind="page"
      contentID={page.id}
      requestCacheInvalidation={noCacheInvalidation}
    />,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Save draft" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "content change was not accepted",
  );
  expect(screen.queryByText(/secret|stack|mongo/i)).toBeNull();
});

it("reveals the correct fields for video, press, and testimonial drafts", async () => {
  stubFetch();
  const { unmount } = render(
    <ContentEditor
      kind="video"
      contentID="new"
      requestCacheInvalidation={noCacheInvalidation}
    />,
  );
  expect(
    await screen.findByLabelText("Approved HTTPS embed URL"),
  ).toBeVisible();
  expect(screen.getByLabelText("Verified external HTTPS URL")).toBeVisible();
  unmount();

  const press = render(
    <ContentEditor
      kind="press"
      contentID="new"
      requestCacheInvalidation={noCacheInvalidation}
    />,
  );
  expect(await screen.findByLabelText("Outlet")).toBeVisible();
  expect(screen.queryByLabelText("Approved HTTPS embed URL")).toBeNull();
  press.unmount();

  render(
    <ContentEditor
      kind="testimonial"
      contentID="new"
      requestCacheInvalidation={noCacheInvalidation}
    />,
  );
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
  stubFetch({
    items: [{ ...page, approved: true }],
    responses: [
      json(revoked),
      json({ ...revoked, approved: true }),
      json(scheduled),
      json({ ...scheduled, status: "unpublished" as const }),
    ],
  });
  render(
    <ContentEditor
      kind="page"
      contentID={page.id}
      requestCacheInvalidation={noCacheInvalidation}
    />,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Revoke approval" }),
  );
  expect(await screen.findByText("Approval revoked.")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Approve" }));
  expect(await screen.findByText("Content approved.")).toBeVisible();

  // The pickers stay behind the disclosure until a schedule is actually wanted.
  expect(screen.queryByRole("button", { name: "Publish at" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Schedule" }));
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
  fireEvent.click(screen.getByRole("button", { name: "Confirm schedule" }));
  expect(
    await screen.findByText(
      /Publication scheduled\. Public cache refresh requested/,
    ),
  ).toBeVisible();
  expect(screen.getByText(/Goes live/)).toBeVisible();

  fireEvent.click(screen.getByRole("button", { name: "Unpublish" }));
  expect(
    await screen.findByText(
      /Content unpublished\. Public cache refresh requested/,
    ),
  ).toBeVisible();
});

// The bar has to answer "what state is this in" and "what is stopping it"
// before it offers a button, or an operator guesses at a disabled control.
it("names the stage and the one thing blocking the next step", async () => {
  stubFetch({ items: [{ ...page, summary: "", body: "" }] });
  render(
    <ContentEditor
      kind="page"
      contentID={page.id}
      requestCacheInvalidation={noCacheInvalidation}
    />,
  );
  expect(await screen.findByText("Draft")).toBeVisible();
  expect(
    screen.getByText("Add summary and body or page sections before it can be approved."),
  ).toBeVisible();
  expect(screen.getByText("No schedule set")).toBeVisible();
  expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Publish now" })).toBeNull();
});

it("offers only the actions a published item still has", async () => {
  stubFetch({
    items: [
      {
        ...page,
        approved: true,
        status: "published",
        publish_at: "2026-09-12T17:00:00.000Z",
      },
    ],
  });
  render(
    <ContentEditor
      kind="page"
      contentID={page.id}
      requestCacheInvalidation={noCacheInvalidation}
    />,
  );
  expect(await screen.findByText("Published")).toBeVisible();
  expect(screen.getByText("Live on the public site.")).toBeVisible();
  expect(screen.getByText(/Goes live/)).toBeVisible();
  expect(screen.getByRole("button", { name: "Unpublish" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "Publish now" })).toBeNull();
});

it("fails closed for preview, mutation, and load errors", async () => {
  stubFetch({ items: [page] });
  const { unmount } = render(
    <ContentEditor
      kind="page"
      contentID={page.id}
      requestCacheInvalidation={noCacheInvalidation}
    />,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Private preview" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "private preview could not be loaded",
  );
  unmount();

  stubFetch({ items: [] });
  const missing = render(
    <ContentEditor
      kind="page"
      contentID={page.id}
      requestCacheInvalidation={noCacheInvalidation}
    />,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "It may have been removed",
  );
  missing.unmount();

  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new Error("database secret")),
  );
  render(
    <ContentEditor
      kind="page"
      contentID={page.id}
      requestCacheInvalidation={noCacheInvalidation}
    />,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Reload the page before editing",
  );
  expect(screen.queryByText("database secret")).toBeNull();
});

it("refuses a role without content-management permission", async () => {
  const fetcher = stubFetch({ role: "booking_manager", items: [page] });
  render(
    <ContentEditor
      kind="page"
      contentID={page.id}
      requestCacheInvalidation={noCacheInvalidation}
    />,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "does not include content-management permission",
  );
  expect(fetcher).toHaveBeenCalledOnce();
});

it("holds the approval boundary and offers only ready media", async () => {
  stubFetch({
    role: "content_editor",
    items: [page],
    media: [
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
    ],
  });
  render(
    <ContentEditor
      kind="page"
      contentID={page.id}
      requestCacheInvalidation={noCacheInvalidation}
    />,
  );
  expect(await screen.findByRole("button", { name: "Approve" })).toBeDisabled();
  fireEvent.click(
    screen.getByRole("button", { name: "Reuse an image already uploaded" }),
  );
  expect(screen.queryByRole("option", { name: /draft\.webp/ })).toBeNull();
  fireEvent.click(
    screen.getByRole("option", { name: "portrait.webp — Approved portrait" }),
  );
  // Gallery images are chosen, never typed: the operator sees a thumbnail with
  // a remove control instead of a textarea full of UUIDs.
  expect(screen.getByText(/gallery images/i)).toBeVisible();
  expect(screen.queryByLabelText(/Gallery asset UUIDs/)).toBeNull();
  expect(
    screen.getByRole("button", { name: "Remove image 1" }),
  ).toBeInTheDocument();
});

it("prepares deterministic cache invalidation after publication and reports queue failure", async () => {
  const approved = { ...page, approved: true };
  const requestCacheInvalidation = vi
    .fn()
    .mockRejectedValue(new Error("queue unavailable"));
  stubFetch({
    items: [approved],
    responses: [json({ ...approved, status: "published" })],
  });
  render(
    <ContentEditor
      kind="page"
      contentID={page.id}
      requestCacheInvalidation={requestCacheInvalidation}
    />,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Publish now" }));
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
  const fetcher = stubFetch({
    items: [page],
    assist: {
      ok: true,
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode("A sharper opening paragraph."));
          controller.close();
        },
      }),
    } as unknown as Response,
  });
  render(
    <ContentEditor
      kind="page"
      contentID={page.id}
      requestCacheInvalidation={noCacheInvalidation}
    />,
  );

  const body = await screen.findByLabelText("Body");
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
  expect(JSON.parse(String(init?.body))).toMatchObject({
    action: "expand",
    field: "body",
  });
});

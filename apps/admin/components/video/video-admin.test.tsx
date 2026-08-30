import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import {
  uniqueItems,
  slugify,
  VideoAdmin,
  type VideoItem,
} from "./video-admin";

const base: VideoItem = {
  id: "123e4567-e89b-42d3-a456-426614174000",
  slug: "live-set",
  title: "Live set",
  description: "Accra performance",
  category: "Performance",
  tags: ["live"],
  provider: "bunny",
  platform: "",
  source_url: "",
  thumbnail_url: "https://cdn.example/poster.jpg",
  duration_seconds: 42,
  status: "ready",
  visibility: "public",
  is_published: false,
  sort_order: 0,
  filename: "live-set.mp4",
  mime_type: "video/mp4",
  bytes: 1024,
  revision: 2,
  created_at: "2026-08-10T00:00:00Z",
  updated_at: "2026-08-10T00:00:00Z",
  playback: {
    embed_url: "https://iframe.mediadelivery.net/embed/1/video",
    hls_url: "https://cdn.example/playlist.m3u8",
    thumbnail_url: "https://cdn.example/poster.jpg",
  },
};

// The upload form lives in a dialog now, so a test that fills it opens it the
// way an operator does rather than reaching for fields that are not rendered.
function openUpload() {
  fireEvent.click(screen.getByRole("button", { name: "Add social video" }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("collapses duplicate provider rows by stable video id", () => {
  expect(
    uniqueItems([
      base,
      { ...base, title: "Duplicate" },
      { ...base, id: "", title: "Invalid" },
      { ...base, id: "second", title: "Second" },
    ]).map((item) => item.title),
  ).toEqual(["Live set", "Second"]);
});

it("generates URL-safe slugs from video titles", () => {
  expect(slugify("  Joe’s Café — Live!  ")).toBe("joe-s-cafe-live");
});

it("renders distinct processing states and enables playback only when ready", async () => {
  const items: VideoItem[] = [
    base,
    {
      ...base,
      id: "processing",
      slug: "processing",
      title: "Processing",
      status: "processing",
      playback: undefined,
    },
    {
      ...base,
      id: "uploading",
      slug: "uploading",
      title: "Uploading",
      status: "uploading",
      playback: undefined,
    },
    {
      ...base,
      id: "failed",
      slug: "failed",
      title: "Failed",
      status: "failed",
      failure_reason: "provider processing failed",
      thumbnail_url: "",
      bytes: 2 * 1024 * 1024,
      playback: undefined,
    },
  ];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ items }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    ),
  );
  render(<VideoAdmin />);

  expect(await screen.findByText("4 videos, 2 processing")).toBeVisible();
  for (const state of ["ready", "processing", "uploading", "failed"]) {
    expect(screen.getByText(state, { selector: "span" })).toBeVisible();
  }
  expect(screen.getByTitle("Preview Live set")).toBeVisible();
  expect(screen.getAllByText(/Created 10 Aug 2026/)[0]).toBeVisible();
  expect(screen.getAllByRole("button", { name: "Publish" })[0]).toBeEnabled();
  expect(screen.getAllByRole("button", { name: "Publish" })[1]).toBeDisabled();
  expect(screen.getByText("provider processing failed")).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Retry status check" }),
  ).toBeEnabled();
});

it("adds a social video link without uploading a file", async () => {
  const social = {
    ...base,
    provider: "external",
    platform: "youtube" as const,
    source_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    revision: 3,
  };
  const fetcher = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (!init?.method || init.method === "GET") {
        return new Response(JSON.stringify({ items: [] }));
      }
      if (url.endsWith("/links"))
        return new Response(JSON.stringify(social), { status: 201 });
      return new Response(null, { status: 500 });
    },
  );
  vi.stubGlobal("fetch", fetcher);
  render(<VideoAdmin />);
  await screen.findByText("Your video library is ready");
  openUpload();
  fireEvent.change(screen.getByLabelText("Title"), {
    target: { value: "Live set" },
  });
  expect(screen.getByLabelText("Public slug")).toHaveValue("live-set");
  fireEvent.change(
    screen.getByPlaceholderText("https://www.youtube.com/watch?v=..."),
    {
      target: { value: social.source_url },
    },
  );
  fireEvent.submit(
    screen.getByRole("button", { name: "Add to library" }).closest("form")!,
  );

  expect(
    await screen.findByText(
      "YouTube link added. Review it, then publish when ready.",
    ),
  ).toBeVisible();
  expect(await screen.findByDisplayValue("Live set")).toBeVisible();
  expect(fetcher).toHaveBeenCalledWith(
    "/api/admin/videos/links",
    expect.objectContaining({ method: "POST" }),
  );
});

it("edits metadata, synchronizes and publishes without replacing the asset", async () => {
  let current = base;
  const fetcher = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      // The row's category picker can only offer what exists, so the category
      // this test moves the video to has to exist.
      if (url.endsWith("/video-categories")) {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: "category-comedy",
                slug: "comedy",
                title: "Comedy",
                description: "",
                image_asset_id: "",
                active: true,
                sort_order: 0,
                revision: 1,
              },
            ],
          }),
        );
      }
      if (!init?.method || init.method === "GET") {
        return new Response(JSON.stringify({ items: [current] }));
      }
      if (url.endsWith("/sync")) {
        current = { ...current, revision: current.revision + 1 };
        return new Response(JSON.stringify(current));
      }
      if (url.endsWith("/publication")) {
        current = {
          ...current,
          is_published: true,
          published_at: "2026-08-10T01:00:00Z",
          revision: current.revision + 1,
        };
        return new Response(JSON.stringify(current));
      }
      if (init.method === "PATCH") {
        const patch = JSON.parse(String(init.body)) as Partial<VideoItem>;
        current = { ...current, ...patch, revision: current.revision + 1 };
        return new Response(JSON.stringify(current));
      }
      return new Response(null, { status: 500 });
    },
  );
  vi.stubGlobal("fetch", fetcher);
  render(<VideoAdmin />);

  const title = await screen.findByLabelText("Title for live-set");
  fireEvent.change(title, { target: { value: "Edited title" } });
  fireEvent.change(screen.getByLabelText("Description for live-set"), {
    target: { value: "Edited description" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Category for live-set" }),
  );
  fireEvent.click(await screen.findByRole("option", { name: "Comedy" }));
  fireEvent.change(screen.getByLabelText("Visibility for live-set"), {
    target: { value: "unlisted" },
  });
  fireEvent.change(screen.getByLabelText("Tags for live-set"), {
    target: { value: "live, comedy, live" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save metadata" }));
  expect(await screen.findByText("Video metadata saved.")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Check processing" }));
  await waitFor(() =>
    expect(
      fetcher.mock.calls.some(([url]) => String(url).endsWith("/sync")),
    ).toBe(true),
  );
  const publish = screen.getByRole("button", { name: "Publish" });
  await waitFor(() => expect(publish).toBeEnabled());
  fireEvent.click(publish);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Unpublish" })).toBeVisible(),
  );
  expect(screen.getByDisplayValue("live, comedy")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Reload" }));
  await waitFor(() =>
    expect(
      fetcher.mock.calls.filter(([, init]) => !init?.method).length,
    ).toBeGreaterThan(1),
  );
});

it("shows a pending indicator and disables destructive controls while deleting", async () => {
  let finishDelete!: (response: Response) => void;
  const fetcher = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/video-categories"))
        return new Response(JSON.stringify({ items: [] }));
      if (!init?.method)
        return new Response(JSON.stringify({ items: [base] }), {
          headers: { "Content-Type": "application/json" },
        });
      return new Promise<Response>((resolve) => (finishDelete = resolve));
    },
  );
  vi.stubGlobal("fetch", fetcher);
  vi.spyOn(window, "confirm").mockReturnValue(true);
  render(<VideoAdmin />);

  const deleteButton = await screen.findByRole("button", { name: "Delete" });
  fireEvent.click(deleteButton);
  expect(await screen.findByRole("status", { name: "Deleting" })).toBeVisible();
  expect(deleteButton).toBeDisabled();
  expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
  finishDelete(new Response(null, { status: 204 }));
  await waitFor(() =>
    expect(screen.queryByDisplayValue("Live set")).toBeNull(),
  );
});

it("keeps the library recoverable when loading fails", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 503 })),
  );
  render(<VideoAdmin />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "could not be loaded",
  );
  expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
});

it("handles an empty response and reports a failed manual reload", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({})))
    .mockResolvedValueOnce(new Response(null, { status: 503 }));
  vi.stubGlobal("fetch", fetcher);
  render(<VideoAdmin />);
  expect(await screen.findByText("Your video library is ready")).toBeVisible();
  // The empty state opens the same dialog as the header button; it used to be
  // an anchor into a form that was always on the page.
  fireEvent.click(screen.getByRole("button", { name: "Add your first video" }));
  expect(
    screen.getByRole("dialog", { name: "Add a social video" }),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
  fireEvent.click(screen.getByRole("button", { name: "Reload" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "video library could not be loaded",
  );
});

it("loads seeded categories and creates a new category inline", async () => {
  const comedy = {
    id: "category-comedy",
    slug: "comedy",
    title: "Comedy",
    description: "Stand-up and sketches",
    image_asset_id: "",
    active: true,
    sort_order: 0,
    revision: 1,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (
        String(input).endsWith("/video-categories") &&
        init?.method === "POST"
      )
        return new Response(
          JSON.stringify({
            ...comedy,
            id: "category-bts",
            slug: "behind-the-scenes",
            title: "Behind the scenes",
          }),
          { status: 201 },
        );
      if (String(input).endsWith("/video-categories"))
        return new Response(JSON.stringify({ items: [comedy] }));
      return new Response(JSON.stringify({ items: [] }));
    }),
  );
  render(<VideoAdmin />);

  // The picker holds its options until it is opened, so the seeded category is
  // proved by opening it rather than by reading the closed control.
  await screen.findByRole("button", { name: "Add social video" });
  openUpload();
  const category = await screen.findByRole("button", { name: "Category" });
  fireEvent.click(category);
  expect(await screen.findByRole("option", { name: "Comedy" })).toBeVisible();
  fireEvent.keyDown(screen.getByRole("combobox", { name: /filter$/ }), {
    key: "Escape",
  });

  fireEvent.click(screen.getByRole("button", { name: "Create category" }));
  fireEvent.change(screen.getByLabelText("New category name"), {
    target: { value: "Behind the scenes" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add" }));

  await waitFor(() => expect(category).toHaveTextContent("Behind the scenes"));
});

it("creates a category from the picker's own filter", async () => {
  const comedy = {
    id: "category-comedy",
    slug: "comedy",
    title: "Comedy",
    description: "Stand-up and sketches",
    image_asset_id: "",
    active: true,
    sort_order: 0,
    revision: 1,
  };
  const post = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (
        String(input).endsWith("/video-categories") &&
        init?.method === "POST"
      ) {
        post(JSON.parse(String(init.body)));
        return new Response(
          JSON.stringify({
            ...comedy,
            id: "category-poetry",
            slug: "poetry",
            title: "Poetry",
          }),
          { status: 201 },
        );
      }
      if (String(input).endsWith("/video-categories"))
        return new Response(JSON.stringify({ items: [comedy] }));
      return new Response(JSON.stringify({ items: [] }));
    }),
  );
  render(<VideoAdmin />);

  await screen.findByRole("button", { name: "Add social video" });
  openUpload();
  const category = await screen.findByRole("button", { name: "Category" });
  fireEvent.click(category);
  await screen.findByRole("option", { name: "Comedy" });

  fireEvent.change(screen.getByRole("combobox", { name: /filter$/ }), {
    target: { value: "Poetry" },
  });
  fireEvent.click(screen.getByText("Create “Poetry”"));

  await waitFor(() =>
    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Poetry" }),
    ),
  );
  await waitFor(() => expect(category).toHaveTextContent("Poetry"));
});

const seededCategory = {
  id: "category-comedy",
  slug: "comedy",
  title: "Comedy",
  description: "Stand-up and sketches",
  image_asset_id: "",
  active: true,
  sort_order: 0,
  revision: 1,
};

function categoryManager() {
  const heading = screen.getByText("Video categories");
  const manager = heading.closest("details");
  if (!manager) throw new Error("category manager not found");
  return within(manager);
}

it("edits a reusable category and saves the whole record", async () => {
  const patched = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/video-categories") && init?.method === "PATCH") {
        patched(JSON.parse(String(init.body)));
        return new Response(
          JSON.stringify({
            ...seededCategory,
            title: "Comedy & sketch",
            revision: 2,
          }),
        );
      }
      if (url.endsWith("/video-categories"))
        return new Response(JSON.stringify({ items: [seededCategory] }));
      return new Response(JSON.stringify({ items: [] }));
    }),
  );
  render(<VideoAdmin />);
  await screen.findByText("1 reusable categories");

  const manager = categoryManager();
  fireEvent.change(manager.getByLabelText("Title"), {
    target: { value: "Comedy & sketch" },
  });
  fireEvent.change(manager.getByLabelText("Description"), {
    target: { value: "Stand-up, sketch and character work" },
  });
  fireEvent.change(manager.getByLabelText("Order"), { target: { value: "3" } });
  fireEvent.click(manager.getByLabelText("Available to use"));
  fireEvent.click(manager.getByRole("button", { name: "Save category" }));

  // The revision goes with the write: the API rejects a stale one, which is
  // what stops two operators overwriting each other.
  await waitFor(() =>
    expect(patched).toHaveBeenCalledWith({
      title: "Comedy & sketch",
      description: "Stand-up, sketch and character work",
      image_asset_id: "",
      active: false,
      sort_order: 3,
      revision: 1,
    }),
  );
  expect(
    await screen.findByText("Category “Comedy & sketch” saved."),
  ).toBeVisible();
});

it("refuses to save a category whose title has been emptied", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/video-categories"))
        return new Response(JSON.stringify({ items: [seededCategory] }));
      return new Response(JSON.stringify({ items: [] }));
    }),
  );
  render(<VideoAdmin />);
  await screen.findByText("1 reusable categories");

  const manager = categoryManager();
  fireEvent.change(manager.getByLabelText("Title"), {
    target: { value: "   " },
  });

  expect(manager.getByRole("button", { name: "Save category" })).toBeDisabled();
});

it("reports a category that could not be saved", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/video-categories") && init?.method === "PATCH")
        return new Response(null, { status: 409 });
      if (url.endsWith("/video-categories"))
        return new Response(JSON.stringify({ items: [seededCategory] }));
      return new Response(JSON.stringify({ items: [] }));
    }),
  );
  render(<VideoAdmin />);
  await screen.findByText("1 reusable categories");

  fireEvent.click(
    categoryManager().getByRole("button", { name: "Save category" }),
  );

  expect(
    await screen.findByText(
      "The category could not be saved. Reload and try again.",
    ),
  ).toBeVisible();
});

it("offers only existing categories on a library row", async () => {
  const comedy = {
    id: "category-comedy",
    slug: "comedy",
    title: "Comedy",
    description: "Stand-up and sketches",
    image_asset_id: "",
    active: true,
    sort_order: 0,
    revision: 1,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/video-categories"))
        return new Response(JSON.stringify({ items: [comedy] }));
      return new Response(JSON.stringify({ items: [base] }));
    }),
  );
  render(<VideoAdmin />);

  const row = await screen.findByRole("button", {
    name: "Category for live-set",
  });
  fireEvent.click(row);
  fireEvent.change(screen.getByRole("combobox", { name: /filter$/ }), {
    target: { value: "Poetry" },
  });

  // A row may only assign a category that exists; inventing one from here is
  // exactly how the taxonomy used to drift.
  // Scoped to the create row's own wording: the panel below has a permanent
  // "Create category" button that a looser matcher would catch.
  expect(screen.queryByText(/^Create “/)).not.toBeInTheDocument();
});

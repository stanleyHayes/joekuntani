import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import {
  uploadToBunny,
  uniqueItems,
  slugify,
  VideoAdmin,
  type VideoItem,
} from "./video-admin";

const tusState = vi.hoisted(() => ({
  options: undefined as
    | undefined
    | {
        endpoint: string;
        headers: Record<string, string>;
        retryDelays: number[];
        onProgress: (uploaded: number, total: number) => void;
        onSuccess: () => void;
        onError: (error: Error) => void;
      },
  resumed: false,
  previous: true,
  fail: false,
}));
vi.mock("tus-js-client", () => ({
  Upload: class {
    constructor(_file: File, options: NonNullable<typeof tusState.options>) {
      tusState.options = options;
    }
    async findPreviousUploads() {
      return tusState.previous
        ? [{ uploadUrl: "https://video.example/resume" }]
        : [];
    }
    resumeFromPreviousUpload() {
      tusState.resumed = true;
    }
    start() {
      if (tusState.fail) {
        tusState.options?.onError(new Error("upload failed"));
        return;
      }
      tusState.options?.onProgress(5, 10);
      tusState.options?.onSuccess();
    }
  },
}));

const base: VideoItem = {
  id: "123e4567-e89b-42d3-a456-426614174000",
  slug: "live-set",
  title: "Live set",
  description: "Accra performance",
  category: "Performance",
  tags: ["live"],
  provider: "bunny",
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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  tusState.options = undefined;
  tusState.resumed = false;
  tusState.previous = true;
  tusState.fail = false;
});

it("resumes a direct TUS upload and reports progress without provider keys", async () => {
  const progress = vi.fn();
  await uploadToBunny(
    new File(["video"], "live.mp4", { type: "video/mp4" }),
    {
      endpoint: "https://video.example/tusupload",
      signature: "short-lived-signature",
      expiration_time: 1234,
      library_id: "42",
      video_id: "video-guid",
      filename: "live.mp4",
      mime_type: "video/mp4",
    },
    "Live set",
    progress,
  );

  expect(tusState.resumed).toBe(true);
  expect(progress).toHaveBeenCalledWith(50);
  expect(tusState.options?.retryDelays).toEqual([0, 1000, 3000, 5000]);
  expect(tusState.options?.headers).toEqual({
    AuthorizationSignature: "short-lived-signature",
    AuthorizationExpire: "1234",
    LibraryId: "42",
    VideoId: "video-guid",
  });
  expect(JSON.stringify(tusState.options)).not.toContain("api_key");
});

it("surfaces a direct-upload failure without a retry loop", async () => {
  tusState.previous = false;
  tusState.fail = true;
  await expect(
    uploadToBunny(
      new File(["video"], "live.mp4", { type: "video/mp4" }),
      {
        endpoint: "https://video.example/tusupload",
        signature: "signature",
        expiration_time: 1234,
        library_id: "42",
        video_id: "video-guid",
        filename: "live.mp4",
        mime_type: "video/mp4",
      },
      "Live set",
      vi.fn(),
    ),
  ).rejects.toThrow("upload failed");
  expect(tusState.resumed).toBe(false);
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

it("creates a resumable upload, reports progress and synchronizes processing", async () => {
  const uploading = {
    ...base,
    status: "uploading" as const,
    playback: undefined,
  };
  const processing = {
    ...base,
    status: "processing" as const,
    playback: undefined,
    revision: 3,
  };
  const fetcher = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (!init?.method || init.method === "GET") {
        return new Response(JSON.stringify({ items: [] }));
      }
      if (url.endsWith("/uploads")) {
        return new Response(
          JSON.stringify({
            item: uploading,
            upload: {
              endpoint: "https://video.example/tusupload",
              signature: "short-lived-signature",
              expiration_time: 1234,
              library_id: "42",
              video_id: "video-guid",
              filename: "live.mp4",
              mime_type: "video/mp4",
            },
          }),
          { status: 201 },
        );
      }
      if (url.endsWith("/sync")) {
        return new Response(JSON.stringify(processing));
      }
      return new Response(null, { status: 500 });
    },
  );
  vi.stubGlobal("fetch", fetcher);
  render(<VideoAdmin />);
  await screen.findByText("Your video library is ready");
  fireEvent.change(screen.getByLabelText("Title"), {
    target: { value: "Live set" },
  });
  expect(screen.getByLabelText("Public slug")).toHaveValue("live-set");
  fireEvent.change(screen.getByLabelText("Video file"), {
    target: {
      files: [new File(["video"], "live.mp4", { type: "video/mp4" })],
    },
  });
  expect(screen.getByText("live.mp4")).toBeVisible();
  expect(screen.getByText("Ready to upload")).toBeVisible();
  expect(screen.getByText("Replace")).toBeVisible();
  fireEvent.submit(
    screen
      .getByRole("button", { name: "Start resumable upload" })
      .closest("form")!,
  );

  expect(
    await screen.findByText(
      "Upload complete. Bunny Stream is processing the video.",
    ),
  ).toBeVisible();
  expect(await screen.findByDisplayValue("Live set")).toBeVisible();
  expect(fetcher).toHaveBeenCalledWith(
    "/api/admin/videos/uploads",
    expect.objectContaining({ method: "POST" }),
  );
  expect(fetcher).toHaveBeenCalledWith(
    expect.stringContaining("/sync"),
    expect.objectContaining({ method: "POST" }),
  );
});

it("edits metadata, synchronizes and publishes without replacing the asset", async () => {
  let current = base;
  const fetcher = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
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
  fireEvent.change(screen.getByLabelText("Category for live-set"), {
    target: { value: "Comedy" },
  });
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
  expect(
    screen.getByRole("link", { name: "Upload your first video" }),
  ).toHaveAttribute("href", "#video-upload-title");
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

  const category = await screen.findByLabelText("Category");
  expect(screen.getByRole("option", { name: "Comedy" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Create category" }));
  fireEvent.change(screen.getByLabelText("New category name"), {
    target: { value: "Behind the scenes" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add" }));

  expect(
    await screen.findByRole("option", { name: "Behind the scenes" }),
  ).toBeVisible();
  await waitFor(() => expect(category).toHaveValue("Behind the scenes"));
});

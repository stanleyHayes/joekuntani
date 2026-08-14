import { describe, expect, it, vi } from "vitest";

import {
  aspectRatioStyle,
  getPublicVideo,
  getPublicVideos,
  videosForContent,
} from "./video-data";

const id = "123e4567-e89b-42d3-a456-426614174000";
const video = {
  id,
  slug: "live-set",
  title: "Live set",
  description: "",
  category: "Performance",
  tags: [],
  thumbnail_url: "https://cdn.example/video/thumbnail.jpg",
  duration_seconds: 42,
  status: "ready",
  visibility: "public",
  is_published: true,
  created_at: "2026-08-10T00:00:00Z",
  updated_at: "2026-08-10T00:00:00Z",
  playback: {
    embed_url: "https://iframe.mediadelivery.net/embed/1/video",
    hls_url: "https://cdn.example/video/playlist.m3u8",
    thumbnail_url: "https://cdn.example/video/thumbnail.jpg",
  },
} as const;

describe("the published video library", () => {
  function listing(items: unknown[]) {
    return vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }

  it("returns the videos the API published", async () => {
    vi.stubEnv("API_BASE_URL", "https://api.example");
    await expect(getPublicVideos(listing([video]))).resolves.toEqual([video]);
  });

  // Unlisted means reachable by link, absent from the listing. The API will
  // still serve one by id, which is the point of the distinction.
  it("leaves unlisted videos out of the listing", async () => {
    vi.stubEnv("API_BASE_URL", "https://api.example");
    await expect(
      getPublicVideos(listing([{ ...video, visibility: "unlisted" }])),
    ).resolves.toEqual([]);
  });

  it("drops a record that fails the same safety checks as a single video", async () => {
    vi.stubEnv("API_BASE_URL", "https://api.example");
    const unsafe = {
      ...video,
      playback: { ...video.playback, embed_url: "https://evil.example/embed" },
    };
    await expect(getPublicVideos(listing([unsafe, video]))).resolves.toEqual([
      video,
    ]);
  });

  it("returns nothing when the API is unreachable", async () => {
    vi.stubEnv("API_BASE_URL", "https://api.example");
    const fetcher = vi.fn().mockRejectedValue(new Error("network"));
    await expect(getPublicVideos(fetcher)).resolves.toEqual([]);
  });

  it("returns nothing when the API answers with an error", async () => {
    vi.stubEnv("API_BASE_URL", "https://api.example");
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 503 }));
    await expect(getPublicVideos(fetcher)).resolves.toEqual([]);
  });

  it("returns nothing when the payload is not a list", async () => {
    vi.stubEnv("API_BASE_URL", "https://api.example");
    await expect(
      getPublicVideos(
        vi.fn().mockResolvedValue(new Response(JSON.stringify({}))),
      ),
    ).resolves.toEqual([]);
  });

  it("does not call out when no API base is configured", async () => {
    vi.stubEnv("API_BASE_URL", "");
    const fetcher = vi.fn();
    await expect(getPublicVideos(fetcher)).resolves.toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("public video data", () => {
  it("accepts a safe published stream", async () => {
    vi.stubEnv("API_BASE_URL", "https://api.example");
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(video), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await expect(getPublicVideo(id, fetcher)).resolves.toEqual(video);
  });

  it("rejects unsafe player hosts", async () => {
    vi.stubEnv("API_BASE_URL", "https://api.example");
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ...video,
          playback: { ...video.playback, embed_url: "https://evil.example/x" },
        }),
      ),
    );
    await expect(getPublicVideo(id, fetcher)).resolves.toBeNull();
  });

  it("deduplicates content association by content id", async () => {
    vi.stubEnv("API_BASE_URL", "https://api.example");
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(video)));
    await expect(
      videosForContent([{ id: "content-1", video_asset_id: id }], fetcher),
    ).resolves.toEqual({ "content-1": video });
  });

  it("does not list an unlisted stream through a public content card", async () => {
    vi.stubEnv("API_BASE_URL", "https://api.example");
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ...video, visibility: "unlisted" })),
      );
    await expect(
      videosForContent([{ id: "content-1", video_asset_id: id }], fetcher),
    ).resolves.toEqual({});
  });
});

describe("aspectRatioStyle", () => {
  it("converts the API's W:H into a CSS ratio", () => {
    expect(aspectRatioStyle("9:16")).toBe("9 / 16");
    expect(aspectRatioStyle("1:1")).toBe("1 / 1");
    expect(aspectRatioStyle("1001:1000")).toBe("1001 / 1000");
  });

  // An invalid `aspect-ratio` is ignored by the browser, which collapses the
  // reserved box to nothing and shifts the page. Better a wrong-but-stable box.
  it("falls back to landscape rather than emitting something CSS will ignore", () => {
    for (const value of [undefined, "", "16/9", "0:9", "sixteen:nine", "16:9;"])
      expect(aspectRatioStyle(value)).toBe("16 / 9");
  });
});

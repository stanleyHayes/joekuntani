import { describe, expect, it, vi } from "vitest";

import { getPublicVideo, videosForContent } from "./video-data";

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
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(video)));
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

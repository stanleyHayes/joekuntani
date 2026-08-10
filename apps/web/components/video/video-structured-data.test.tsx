import { render } from "@testing-library/react";
import { expect, it } from "vitest";

import type { PublicVideo } from "./video-data";
import { VideoStructuredData } from "./video-structured-data";

it("publishes safe VideoObject metadata for a ready stream", () => {
  const video = {
    id: "123e4567-e89b-42d3-a456-426614174000",
    title: "Joe < live",
    description: "Performance",
    thumbnail_url: "https://cdn.example/poster.jpg",
    duration_seconds: 65,
    created_at: "2026-08-10T00:00:00Z",
    playback: {
      embed_url: "https://iframe.mediadelivery.net/embed/1/video",
      hls_url: "https://cdn.example/playlist.m3u8",
    },
  } as PublicVideo;
  const { container } = render(
    <VideoStructuredData canonicalPath="/media/videos" videos={[video]} />,
  );
  const raw = container.querySelector("script")?.innerHTML ?? "";

  expect(raw).toContain('"@type":"VideoObject"');
  expect(raw).toContain('"duration":"PT1M5S"');
  expect(raw).toContain("https://joekuntani.com/media/videos#");
  expect(raw).toContain("Joe \\u003c live");
  expect(raw).not.toContain("Joe < live");
});

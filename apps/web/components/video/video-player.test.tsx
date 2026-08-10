import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import type { PublicVideo } from "./video-data";
import { VideoPlayer } from "./video-player";

const video = {
  id: "123e4567-e89b-42d3-a456-426614174000",
  title: "Live set",
  thumbnail_url: "https://cdn.example/poster.jpg",
  playback: {
    embed_url: "https://iframe.mediadelivery.net/embed/1/video",
    thumbnail_url: "https://cdn.example/poster.jpg",
    hls_url: "https://cdn.example/playlist.m3u8",
  },
} as PublicVideo;

afterEach(() => vi.useRealTimers());

it("renders a lazy poster before creating the adaptive player", () => {
  render(<VideoPlayer video={video} />);
  expect(screen.getByRole("presentation")).toHaveAttribute(
    "loading",
    "lazy",
  );
  expect(screen.queryByTitle("Live set")).toBeNull();
});

it("shows loading and playback states", () => {
  render(<VideoPlayer video={video} />);
  fireEvent.click(screen.getByRole("button", { name: "Play Live set" }));
  expect(screen.getByRole("status")).toHaveTextContent("Loading video");
  const frame = screen.getByTitle("Live set");
  expect(frame).toHaveAttribute("src", expect.stringContaining("autoplay=true"));
  fireEvent.load(frame);
  expect(screen.queryByRole("status")).toBeNull();
});

it("shows a recoverable error when the player does not load", () => {
  vi.useFakeTimers();
  render(<VideoPlayer video={video} />);
  fireEvent.click(screen.getByRole("button", { name: "Play Live set" }));
  act(() => vi.advanceTimersByTime(12_000));
  expect(screen.getByRole("alert")).toHaveTextContent("could not be loaded");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(screen.getByRole("button", { name: "Play Live set" })).toBeVisible();
});

it("falls back when the poster is unavailable", () => {
  render(<VideoPlayer video={video} />);
  fireEvent.error(screen.getByRole("presentation"));
  expect(screen.getByText("JK")).toBeVisible();
});

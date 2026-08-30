"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { Play } from "@phosphor-icons/react";

import { aspectRatioStyle, type PublicVideo } from "./video-data";
import styles from "./video-player.module.css";

export function VideoPlayer({ video }: { video: PublicVideo }) {
  // Handed to CSS rather than applied here so the poster, the frame and the
  // unavailable state all reserve the same box as the video they stand in for.
  const shape = {
    "--video-aspect": aspectRatioStyle(video.aspect_ratio),
  } as CSSProperties;
  const [state, setState] = useState<
    "poster" | "loading" | "playing" | "error"
  >("poster");
  const [posterFailed, setPosterFailed] = useState(false);
  const poster = video.thumbnail_url || video.playback.thumbnail_url;

  useEffect(() => {
    if (state !== "loading") return;
    const timeout = window.setTimeout(() => setState("error"), 12_000);
    return () => window.clearTimeout(timeout);
  }, [state]);

  if (state === "error") {
    return (
      <div className={styles.unavailable} role="alert" style={shape}>
        <p>This video could not be loaded.</p>
        <button type="button" onClick={() => setState("poster")}>
          Try again
        </button>
      </div>
    );
  }

  if (state === "loading" || state === "playing") {
    return (
      <div className={styles.player} data-state={state} style={shape}>
        <iframe
          className={styles.frame}
          src={withAutoplay(video.playback.embed_url)}
          title={video.title}
          allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; clipboard-write; web-share"
          allowFullScreen
          onLoad={() => setState("playing")}
          onError={() => setState("error")}
        />
        {state === "loading" ? (
          <span className={styles.loading} role="status">
            Loading video…
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <button
      className={styles.poster}
      style={shape}
      type="button"
      onClick={() => setState("loading")}
      aria-label={`Play ${video.title}`}
    >
      {posterFailed || !poster ? (
        <span className={styles.posterFallback} aria-hidden="true">
          {platformMark(video.platform)}
        </span>
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={poster}
            alt=""
            width={1280}
            height={720}
            loading="lazy"
            onError={() => setPosterFailed(true)}
          />
        </>
      )}
      <span>
        <Play weight="fill" size={22} aria-hidden="true" /> Play
      </span>
    </button>
  );
}

function withAutoplay(value: string) {
  const url = new URL(value);
  url.searchParams.set("autoplay", "1");
  return url.toString();
}

function platformMark(platform: PublicVideo["platform"]) {
  const marks: Record<string, string> = {
    youtube: "YT",
    instagram: "IG",
    tiktok: "TT",
    facebook: "FB",
    vimeo: "V",
  };
  return marks[platform] ?? "JK";
}

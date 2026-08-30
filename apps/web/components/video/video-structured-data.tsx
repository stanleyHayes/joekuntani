import type { PublicVideo } from "./video-data";

export function VideoStructuredData({
  canonicalPath,
  videos,
}: {
  canonicalPath: "/media/press" | "/media/videos";
  videos: PublicVideo[];
}) {
  if (!videos.length) return null;
  const value = {
    "@context": "https://schema.org",
    "@graph": videos.map((video) => ({
      "@type": "VideoObject",
      "@id": `https://joekuntani.com${canonicalPath}#${video.id}`,
      name: video.title,
      description: video.description || video.title,
      ...(video.thumbnail_url ? { thumbnailUrl: [video.thumbnail_url] } : {}),
      uploadDate: video.created_at,
      ...(video.duration_seconds > 0
        ? { duration: isoDuration(video.duration_seconds) }
        : {}),
      embedUrl: video.playback.embed_url,
      ...(video.source_url || video.playback.hls_url
        ? { contentUrl: video.source_url || video.playback.hls_url }
        : {}),
    })),
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(value).replaceAll("<", "\\u003c"),
      }}
    />
  );
}

function isoDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return `PT${hours ? `${hours}H` : ""}${minutes ? `${minutes}M` : ""}${remainder || (!hours && !minutes) ? `${remainder}S` : ""}`;
}

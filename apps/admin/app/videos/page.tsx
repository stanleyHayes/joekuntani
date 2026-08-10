import type { Metadata } from "next";
import { VideoAdmin } from "@/components/video/video-admin";

export const metadata: Metadata = {
  title: "Videos",
  robots: { index: false, follow: false },
};
export default function VideosPage() {
  return <VideoAdmin />;
}

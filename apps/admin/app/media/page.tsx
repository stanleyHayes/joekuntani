import type { Metadata } from "next";
import { MediaAdmin } from "@/components/media/media-admin";

export const metadata: Metadata = {
  title: "Media",
  robots: { index: false, follow: false },
};

export default function MediaPage() {
  return <MediaAdmin />;
}

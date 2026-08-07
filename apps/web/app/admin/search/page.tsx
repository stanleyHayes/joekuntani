import type { Metadata } from "next";
import { SearchWorkspace } from "../../../components/admin/search/search-workspace";

export const metadata: Metadata = {
  title: "Search",
  robots: { index: false, follow: false },
};

export default function SearchPage() {
  return <SearchWorkspace />;
}

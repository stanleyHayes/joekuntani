import type { Metadata } from "next";
import { SearchWorkspace } from "../../../components/admin/search/search-workspace";
import { AdminShell } from "../../../components/layout/admin-shell";

export const metadata: Metadata = {
  title: "Search",
  robots: { index: false, follow: false },
};

const navigation = [
  { href: "/admin/search", label: "Search" },
  { href: "/admin/content", label: "Content" },
  { href: "/admin/crm", label: "CRM" },
  { href: "/admin/bookings", label: "Bookings" },
  { href: "/admin/campaigns", label: "Campaigns" },
] as const;

export default function SearchPage() {
  return (
    <AdminShell currentPath="/admin/search" navigation={navigation} title="Search">
      <SearchWorkspace />
    </AdminShell>
  );
}

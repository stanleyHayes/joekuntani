import type { Metadata } from "next";
import { BookingCalendar } from "../../../components/admin/bookings/booking-calendar";
import { AdminShell } from "../../../components/layout/admin-shell";
export const metadata: Metadata = {
  title: "Booking calendar",
  robots: { index: false, follow: false },
};
const navigation = [
  { href: "/admin/settings", label: "Global settings" },
  { href: "/admin/services", label: "Services" },
  { href: "/admin/content", label: "Content" },
  { href: "/admin/media", label: "Media" },
  { href: "/admin/events", label: "Events" },
  { href: "/admin/crm", label: "CRM" },
  { href: "/admin/bookings", label: "Bookings" },
] as const;
export default function BookingPage() {
  return (
    <AdminShell
      currentPath="/admin/bookings"
      navigation={navigation}
      title="Booking calendar"
    >
      <BookingCalendar />
    </AdminShell>
  );
}

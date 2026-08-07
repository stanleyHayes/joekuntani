import type { Metadata } from "next";
import { BookingCalendar } from "../../../components/admin/bookings/booking-calendar";
export const metadata: Metadata = {
  title: "Booking calendar",
  robots: { index: false, follow: false },
};
export default function BookingPage() {
  return <BookingCalendar />;
}

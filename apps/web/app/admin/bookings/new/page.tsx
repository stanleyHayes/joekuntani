import type { Metadata } from "next";
import { BookingEditor } from "../../../../components/admin/bookings/booking-editor";

export const metadata: Metadata = {
  title: "Add booking",
  robots: { index: false, follow: false },
};

export default function NewBookingPage() {
  return <BookingEditor />;
}

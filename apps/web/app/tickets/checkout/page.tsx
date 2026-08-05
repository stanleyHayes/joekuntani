import type { Metadata } from "next";
import { CheckoutForm } from "../../../components/payments/checkout-form";

export const metadata: Metadata = {
  title: "Ticket checkout",
  description: "Reserve tickets and continue to secure payment.",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const query = await searchParams;
  return (
    <main className="shell-container" id="main-content">
      <CheckoutForm
        eventId={single(query.event)}
        ticketTypeId={single(query.ticket)}
      />
    </main>
  );
}

function single(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

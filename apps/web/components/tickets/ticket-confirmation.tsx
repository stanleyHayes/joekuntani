"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Ticket = {
  id: string;
  ticket_type_id: string;
  status: string;
  qr_bearer: string;
};
type Confirmation = {
  reference: string;
  status: string;
  buyer_email_masked: string;
  access_expires_at: string;
  tickets: Ticket[];
};

export function TicketConfirmation({
  reference,
  access,
}: {
  reference: string;
  access: string;
}) {
  const invalidLink = !/^JKT-[0-9]{4}-[A-Z0-9]{8}$/.test(reference) || !access;
  const [view, setView] = useState<Confirmation | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (invalidLink) return;
    window.history.replaceState(
      {},
      "",
      `/tickets/${encodeURIComponent(reference)}`,
    );
    fetch(`/api/public/ticket-orders/${encodeURIComponent(reference)}`, {
      cache: "no-store",
      headers: { "Order-Access-Key": access },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        setView((await response.json()) as Confirmation);
      })
      .catch(() =>
        setError("Tickets are unavailable or this secure link has expired."),
      );
  }, [reference, access, invalidLink]);
  if (invalidLink)
    return (
      <section aria-labelledby="tickets-heading">
        <h1 id="tickets-heading">Ticket access unavailable</h1>
        <p role="alert">This ticket link is incomplete or invalid.</p>
        <Link href="/events">Browse events</Link>
      </section>
    );
  if (error)
    return (
      <section aria-labelledby="tickets-heading">
        <h1 id="tickets-heading">Ticket access unavailable</h1>
        <p role="alert">{error}</p>
        <Link href="/events">Browse events</Link>
      </section>
    );
  if (!view)
    return (
      <section aria-live="polite">
        <h1>Loading your tickets</h1>
        <p role="status">Verifying secure access…</p>
      </section>
    );
  return (
    <section aria-labelledby="tickets-heading">
      <p>Payment confirmed</p>
      <h1 id="tickets-heading">Your tickets</h1>
      <p>
        Order <strong>{view.reference}</strong> · sent to{" "}
        {view.buyer_email_masked}
      </p>
      <p>
        Save each bearer securely. It contains no personal information and
        admits one guest.
      </p>
      <ol>
        {view.tickets.map((ticket, index) => (
          <li key={ticket.id}>
            <h2>Admission {index + 1}</h2>
            <p>Status: {ticket.status}</p>
            <code aria-label={`QR ticket bearer ${index + 1}`}>
              {ticket.qr_bearer}
            </code>
            <a
              download={`ticket-${index + 1}.txt`}
              href={`data:text/plain;charset=utf-8,${encodeURIComponent(ticket.qr_bearer)}`}
            >
              Download ticket
            </a>
          </li>
        ))}
      </ol>
    </section>
  );
}

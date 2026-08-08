import type { Metadata } from "next";
import { TicketConfirmation } from "../../../components/tickets/ticket-confirmation";
import styles from "./ticket-page.module.css";

export const metadata: Metadata = {
  title: "Your tickets",
  description: "Secure ticket access.",
  robots: { index: false, follow: false },
};
type Params = Promise<{ "order-reference": string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;
export default async function TicketPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const route = await params;
  const search = await searchParams;
  return (
    <main className={styles.page} id="main-content">
      <div className="shell-container">
        <TicketConfirmation
          reference={route["order-reference"]}
          access={typeof search.access === "string" ? search.access : ""}
        />
      </div>
    </main>
  );
}

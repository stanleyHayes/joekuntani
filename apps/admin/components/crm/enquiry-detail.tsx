"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { EnquiryWorkflow } from "../crm-workflow/enquiry-workflow";
import { request, type Enquiry } from "./crm-api";
import styles from "./enquiry-detail.module.css";

/**
 * Notes, tasks, attachments and proposals for one enquiry, as a page.
 *
 * Seven controls, one of which uploads a document to protected storage. A
 * modal that has to stay open across an upload is a modal an operator can
 * dismiss mid-upload, and the note, task and attachment forms stacked below
 * the fold of one anyway.
 */
export function EnquiryDetail({ enquiryID }: { enquiryID: string }) {
  const [reference, setReference] = useState("");

  // The workflow only needs the id; the reference is for the heading. There is
  // no endpoint for a single enquiry, so it comes out of the list — and a
  // failure to find it must not keep the notes and tasks off the screen.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void request("/api/admin/crm/enquiries")
        .then((body) => {
          const found = (body.items ?? []).find(
            (item: Enquiry) => item.id === enquiryID,
          );
          if (found) setReference(found.reference);
        })
        .catch(() => undefined);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [enquiryID]);

  return (
    <section className={styles.detail} aria-labelledby="crm-enquiry-heading">
      <header className="stage-head">
        <div className="stage-head__copy">
          <p className="stage-head__eyebrow">Enquiry</p>
          <h2 id="crm-enquiry-heading">{reference || "Enquiry"}</h2>
          <p className="stage-head__lede">
            Manage notes, tasks, attachments, and proposals.
          </p>
        </div>
        <div className="stage-head__actions">
          <Link className={styles.back} href="/crm">
            Back to enquiries
          </Link>
        </div>
      </header>

      <div className={styles.workflow}>
        <EnquiryWorkflow enquiryId={enquiryID} />
      </div>
    </section>
  );
}

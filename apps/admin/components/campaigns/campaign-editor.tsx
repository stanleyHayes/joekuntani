"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Select } from "@joe-kuntani/shared/ui/select";
import { currencies, request, splitValues } from "./campaign-api";
import styles from "./campaign-editor.module.css";

/**
 * The new-campaign form, as a page.
 *
 * It used to be a dialog holding twelve controls: two CRM references, the
 * dates, the money, and three comma-separated lists. A modal that size scrolls
 * inside itself, which hides the button that saves the work, and a stray click
 * on the backdrop threw away a half-typed record. On a page the fields group
 * under headings and the browser's back button means what it says.
 */
export function CampaignEditor() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setPending(true);
    setError("");
    try {
      await request("/api/admin/campaigns", {
        method: "POST",
        body: JSON.stringify({
          enquiry_id: f.get("enquiry_id"),
          organization_id: f.get("organization_id"),
          title: f.get("title"),
          objective: f.get("objective"),
          platforms: String(f.get("platforms") ?? "")
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean),
          starts_on: f.get("starts_on"),
          ends_on: f.get("ends_on"),
          status: "draft",
          fee: { amount: f.get("fee"), currency: f.get("currency") },
          expenses: { amount: f.get("expenses"), currency: f.get("currency") },
          results: parseResults(String(f.get("results") ?? "")),
          asset_ids: splitValues(String(f.get("asset_ids") ?? "")),
        }),
      });
      // Back to the list, which reloads and shows the new campaign. Staying
      // here would leave an operator wondering whether the save took.
      router.push("/campaigns");
      router.refresh();
    } catch {
      setError("Campaign was not saved.");
      setPending(false);
    }
  }

  return (
    <section
      className={styles.editor}
      aria-labelledby="campaign-editor-heading"
    >
      <header className="stage-head">
        <div className="stage-head__copy">
          <p className="stage-head__eyebrow">Brand partnerships</p>
          <h2 id="campaign-editor-heading">New campaign</h2>
          <p className="stage-head__lede">
            Create a private campaign record linked to CRM. It starts as a
            draft; deliverables and results are added on the campaign itself.
          </p>
        </div>
        <div className="stage-head__actions">
          <Link className={styles.back} href="/campaigns">
            Back to campaigns
          </Link>
        </div>
      </header>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      <form className={styles.form} onSubmit={create}>
        <fieldset className={styles.group}>
          <legend className={styles.legend}>Where it came from</legend>
          <div className={styles.fieldGrid}>
            <label>
              Enquiry ID
              <input name="enquiry_id" type="text" required />
            </label>
            <label>
              Organization ID
              <input name="organization_id" type="text" required />
            </label>
          </div>
        </fieldset>

        <fieldset className={styles.group}>
          <legend className={styles.legend}>The partnership</legend>
          <div className={styles.stack}>
            <label>
              Campaign title
              <input name="title" type="text" required />
            </label>
            <label>
              Objective
              <input
                name="objective"
                type="text"
                required
                placeholder="What Joe is being booked to achieve"
              />
            </label>
          </div>
        </fieldset>

        <fieldset className={styles.group}>
          <legend className={styles.legend}>Dates</legend>
          <div className={styles.fieldGrid}>
            <label>
              Start date
              <input name="starts_on" type="date" required />
            </label>
            <label>
              End date
              <input name="ends_on" type="date" required />
            </label>
          </div>
        </fieldset>

        <fieldset className={styles.group}>
          <legend className={styles.legend}>Money</legend>
          <div className={styles.fieldGrid}>
            <label>
              Fee
              <input name="fee" type="text" required />
            </label>
            <label>
              Expenses
              <input name="expenses" type="text" required />
            </label>
            <label>
              Currency
              <Select
                name="currency"
                defaultValue="GHS"
                options={currencies.map((currency) => ({
                  value: currency,
                  label: currency,
                }))}
                aria-label="Campaign currency"
              />
            </label>
          </div>
          <p className={styles.note}>
            The fee and the expenses are both recorded in this currency.
          </p>
        </fieldset>

        <fieldset className={styles.group}>
          <legend className={styles.legend}>Reach and results</legend>
          <div className={styles.stack}>
            <label>
              Platforms
              <input
                name="platforms"
                type="text"
                required
                placeholder="Instagram, TikTok, YouTube"
              />
            </label>
            <label>
              Results
              <input
                name="results"
                type="text"
                placeholder="Reach=120000, Saves=4300"
              />
            </label>
            <label>
              Asset IDs
              <input
                name="asset_ids"
                type="text"
                placeholder="Comma separated"
              />
            </label>
          </div>
        </fieldset>

        <div className={styles.actions}>
          <button className="primary" type="submit" disabled={pending}>
            {pending ? "Saving…" : "Create campaign"}
          </button>
          <Link className={styles.cancel} href="/campaigns">
            Cancel
          </Link>
        </div>
      </form>
    </section>
  );
}

function parseResults(value: string) {
  return splitValues(value).map((item) => {
    const separator = item.indexOf("=");
    return separator < 1
      ? { label: item, value: item }
      : {
          label: item.slice(0, separator).trim(),
          value: item.slice(separator + 1).trim(),
        };
  });
}

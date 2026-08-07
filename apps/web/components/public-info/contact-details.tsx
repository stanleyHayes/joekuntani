import type { PublicSettings } from "../../lib/settings";
import styles from "./public-info.module.css";

/**
 * The direct routes to a human. This renders from whatever is published, and
 * renders nothing at all rather than showing empty rows — but the page keeps it
 * outside the form so a visitor can still make contact when enquiry routing is
 * unavailable.
 */
export function ContactDetails({
  settings,
}: {
  settings: PublicSettings | null;
}) {
  const email = settings?.contact.public_email.trim() ?? "";
  const phone = settings?.contact.phone.trim() ?? "";
  const location = settings?.contact.location.trim() ?? "";
  const social = (settings?.social ?? []).filter(
    (item) => item.platform.trim() && item.url.trim(),
  );

  if (!email && !phone && !location && social.length === 0) return null;

  return (
    <aside className={styles.contactAside} aria-labelledby="contact-direct">
      <h2 className={styles.asideTitle} id="contact-direct">
        Reach out directly
      </h2>
      <dl className={styles.contactList}>
        {email ? (
          <div>
            <dt>Email</dt>
            <dd>
              <a className={styles.contactLink} href={`mailto:${email}`}>
                {email}
              </a>
            </dd>
          </div>
        ) : null}
        {phone ? (
          <div>
            <dt>Phone</dt>
            <dd>
              <a
                className={styles.contactLink}
                href={`tel:${phone.replace(/[^\d+]/g, "")}`}
              >
                {phone}
              </a>
            </dd>
          </div>
        ) : null}
        {location ? (
          <div>
            <dt>Based in</dt>
            <dd>{location}</dd>
          </div>
        ) : null}
      </dl>
      {social.length ? (
        <div className={styles.contactSocial}>
          <p className={styles.asideLabel}>Elsewhere</p>
          <ul>
            {social.map((item) => (
              <li key={item.url}>
                <a
                  className={styles.contactLink}
                  href={item.url}
                  rel="noopener noreferrer"
                >
                  {item.platform}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className={styles.asideNote}>
        Enquiries sent through the form are routed and tracked. Direct messages
        are read but may take longer to answer.
      </p>
    </aside>
  );
}

"use client";

import { local, type Warning } from "./booking-api";
import styles from "./schedule-conflicts.module.css";

/**
 * Overlaps reported by a write. The server only names them in the response to
 * the save that caused them, so both the diary and the editor have to be able
 * to show the same panel.
 */
export function ScheduleConflicts({
  timezone,
  warnings,
}: {
  timezone: string;
  warnings: Warning[];
}) {
  if (warnings.length === 0) return null;
  return (
    <aside className={styles.warning}>
      <h3>Schedule conflicts</h3>
      <ul>
        {warnings.map((warning) => (
          <li key={warning.booking_id}>
            <strong>{warning.status}</strong> {warning.title}:{" "}
            {local(warning.start_at, timezone)}–
            {local(warning.end_at, timezone)}
          </li>
        ))}
      </ul>
    </aside>
  );
}

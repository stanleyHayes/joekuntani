"use client";

import {
  Bell,
  Check,
  CheckCircle,
  ClockCounterClockwise,
  X,
} from "@phosphor-icons/react";
import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import styles from "./admin-notifications.module.css";

type AuditEntry = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  outcome?: string;
  created_at: string;
};

export type AdminNotification = AuditEntry & {
  href: string;
  title: string;
  description: string;
};

type NotificationContextValue = {
  badgeFor: (href: string) => number;
  error: boolean;
  loading: boolean;
  isUnread: (id: string) => boolean;
  markAllRead: () => void;
  markRead: (id: string) => void;
  notifications: AdminNotification[];
  refresh: () => void;
  unreadCount: number;
};

const NotificationContext = createContext<NotificationContextValue | null>(
  null,
);
const READ_KEY = "jk.admin.notifications.read";
const POLL_INTERVAL = 45_000;

export function AdminNotificationsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [readIds, setReadIds] = useState<string[]>(readStoredIds);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [toast, setToast] = useState<AdminNotification | null>(null);
  const initialized = useRef(false);
  const knownIds = useRef(new Set<string>());

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/audit?limit=40", {
        cache: "no-store",
        credentials: "include",
      });
      if (!response.ok) throw new Error("notification feed unavailable");
      const payload = (await response.json()) as { items?: AuditEntry[] };
      const next = (payload.items ?? [])
        .map(toNotification)
        .filter((item): item is AdminNotification => item !== null)
        .slice(0, 20);

      if (initialized.current) {
        const newest = next.find((item) => !knownIds.current.has(item.id));
        if (newest) setToast(newest);
      }
      knownIds.current = new Set(next.map((item) => item.id));
      initialized.current = true;
      setNotifications(next);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_INTERVAL);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 5200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const unread = useMemo(
    () => notifications.filter((item) => !readIds.includes(item.id)),
    [notifications, readIds],
  );

  const persistRead = useCallback((ids: string[]) => {
    const limited = ids.slice(-120);
    setReadIds(limited);
    try {
      localStorage.setItem(READ_KEY, JSON.stringify(limited));
    } catch {
      /* Reading a notification should still work without local storage. */
    }
  }, []);

  const markRead = useCallback(
    (id: string) => {
      if (!readIds.includes(id)) persistRead([...readIds, id]);
    },
    [persistRead, readIds],
  );

  const markAllRead = useCallback(() => {
    persistRead([
      ...new Set([...readIds, ...notifications.map((item) => item.id)]),
    ]);
  }, [notifications, persistRead, readIds]);

  const badgeFor = useCallback(
    (href: string) => unread.filter((item) => item.href === href).length,
    [unread],
  );
  const isUnread = useCallback(
    (id: string) => !readIds.includes(id),
    [readIds],
  );

  return (
    <NotificationContext.Provider
      value={{
        badgeFor,
        error,
        isUnread,
        loading,
        markAllRead,
        markRead,
        notifications,
        refresh: load,
        unreadCount: unread.length,
      }}
    >
      {children}
      {toast ? (
        <aside className={styles.toast} aria-live="polite">
          <span className={styles.toastIcon} aria-hidden="true">
            <CheckCircle size={20} weight="fill" />
          </span>
          <div>
            <strong>{toast.title}</strong>
            <p>{toast.description}</p>
          </div>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Dismiss notification"
          >
            <X size={15} weight="bold" aria-hidden="true" />
          </button>
        </aside>
      ) : null}
    </NotificationContext.Provider>
  );
}

export function NotificationBell() {
  const context = useAdminNotifications();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    window.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Notifications${context.unreadCount ? `, ${context.unreadCount} unread` : ""}`}
        onClick={() => setOpen((value) => !value)}
      >
        <Bell
          size={19}
          weight={context.unreadCount ? "fill" : "regular"}
          aria-hidden="true"
        />
        {context.unreadCount ? (
          <span className={styles.count}>
            {formatCount(context.unreadCount)}
          </span>
        ) : null}
      </button>

      {open ? (
        <section
          className={styles.popover}
          role="dialog"
          aria-label="Notifications"
        >
          <header className={styles.head}>
            <div>
              <p>Live desk</p>
              <h2>Notifications</h2>
            </div>
            {context.unreadCount ? (
              <button type="button" onClick={context.markAllRead}>
                <Check size={14} weight="bold" aria-hidden="true" />
                Mark all read
              </button>
            ) : null}
          </header>

          <div className={styles.feed}>
            {context.loading ? (
              <p className={styles.state}>Checking recent activity…</p>
            ) : context.error ? (
              <div className={styles.state}>
                <p>Notifications could not be loaded.</p>
                <button type="button" onClick={context.refresh}>
                  Try again
                </button>
              </div>
            ) : context.notifications.length ? (
              context.notifications.map((item) => {
                const unread = context.isUnread(item.id);
                return (
                  <Link
                    href={item.href}
                    className={styles.item}
                    data-unread={unread ? "true" : "false"}
                    key={item.id}
                    onClick={() => {
                      context.markRead(item.id);
                      setOpen(false);
                    }}
                  >
                    <span className={styles.dot} aria-hidden="true" />
                    <span className={styles.itemCopy}>
                      <strong>{item.title}</strong>
                      <span>{item.description}</span>
                      <time dateTime={item.created_at}>
                        {relativeTime(item.created_at)}
                      </time>
                    </span>
                  </Link>
                );
              })
            ) : (
              <div className={styles.empty}>
                <CheckCircle size={28} weight="duotone" aria-hidden="true" />
                <strong>You’re caught up</strong>
                <p>New operational activity will appear here.</p>
              </div>
            )}
          </div>

          <footer className={styles.foot}>
            <Link href="/audit" onClick={() => setOpen(false)}>
              <ClockCounterClockwise size={15} aria-hidden="true" />
              View complete activity register
            </Link>
          </footer>
        </section>
      ) : null}
    </div>
  );
}

export function useAdminNotifications() {
  const context = useContext(NotificationContext);
  if (!context)
    throw new Error("Admin notifications must be used inside its provider");
  return context;
}

function toNotification(entry: AuditEntry): AdminNotification | null {
  const action = entry.action.toLowerCase();
  if (action.startsWith("auth.") || action.includes("bootstrap")) return null;

  const target = routeFor(action, entry.entity_type.toLowerCase());
  const verb = action.split(".").at(-1)?.replaceAll("_", " ") ?? "updated";
  const subject = subjectFor(target);
  return {
    ...entry,
    href: target,
    title: `${subject} ${humanizeVerb(verb)}`,
    description: descriptionFor(entry, subject),
  };
}

function routeFor(action: string, entity: string) {
  if (action.includes("invite") || action.startsWith("user.")) return "/team";
  if (action.startsWith("privacy.")) return "/privacy";
  if (action.startsWith("export.")) return "/exports";
  if (action.includes("checkin")) return "/checkin";
  if (action.startsWith("ticket.") || entity.includes("ticket"))
    return "/tickets";
  if (action.startsWith("event.") || entity === "event") return "/events";
  if (action.startsWith("booking.") || entity === "booking") return "/bookings";
  if (action.startsWith("enquiry.") || entity.includes("enquiry"))
    return "/crm";
  if (action.startsWith("campaign.") || entity === "campaign")
    return "/campaigns";
  if (action.startsWith("media.") || entity === "media") return "/media";
  if (action.startsWith("service.") || entity === "service") return "/services";
  if (action.startsWith("settings.")) return "/settings";
  if (action.startsWith("content.") || entity === "content") return "/content";
  return "/audit";
}

function subjectFor(href: string) {
  return (
    {
      "/team": "Team access",
      "/privacy": "Privacy workflow",
      "/exports": "Export",
      "/checkin": "Check-in",
      "/tickets": "Ticket order",
      "/events": "Event",
      "/bookings": "Booking",
      "/crm": "Enquiry",
      "/campaigns": "Campaign",
      "/media": "Media asset",
      "/services": "Service",
      "/settings": "Site settings",
      "/content": "Content",
      "/audit": "Admin activity",
    } as Record<string, string>
  )[href];
}

function humanizeVerb(value: string) {
  const labels: Record<string, string> = {
    create: "created",
    created: "created",
    update: "updated",
    updated: "updated",
    publish: "published",
    published: "published",
    delete: "deleted",
    deleted: "deleted",
    invite: "sent",
    invited: "sent",
    accepted: "accepted",
  };
  return labels[value] ?? value;
}

function descriptionFor(entry: AuditEntry, subject: string) {
  const outcome =
    entry.outcome && entry.outcome !== "accepted" ? ` · ${entry.outcome}` : "";
  const reference = entry.entity_id
    ? ` · ${shortReference(entry.entity_id)}`
    : "";
  return `${subject} activity was recorded${reference}${outcome}.`;
}

function shortReference(value: string) {
  if (value.includes("@")) return value;
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
}

function relativeTime(value: string) {
  const elapsed = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(elapsed / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatCount(value: number) {
  return value > 9 ? "9+" : String(value);
}

function readStoredIds() {
  if (typeof window === "undefined") return [];
  try {
    const saved = JSON.parse(localStorage.getItem(READ_KEY) ?? "[]") as unknown;
    return Array.isArray(saved)
      ? saved.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

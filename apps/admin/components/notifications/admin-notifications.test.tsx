import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import {
  AdminNotificationsProvider,
  NotificationBell,
  useAdminNotifications,
} from "./admin-notifications";

const READ_KEY = "jk.admin.notifications.read";

type Entry = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  outcome: string;
  created_at: string;
};

const entry = (over: Partial<Entry> = {}): Entry => ({
  id: `id-${Math.abs(hash(JSON.stringify(over)))}`,
  action: "content.publish",
  entity_type: "content",
  entity_id: "7a1c9f2e-1111-4222-8333-444455556666",
  outcome: "accepted",
  created_at: new Date().toISOString(),
  ...over,
});

/** Stable ids without Math.random, so a rerun sees the same feed. */
function hash(value: string) {
  let total = 0;
  for (const character of value)
    total = (total * 31 + character.charCodeAt(0)) | 0;
  return total;
}

function stubFeed(items: Entry[] = [entry()], ok = true) {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(
      ok
        ? new Response(JSON.stringify({ items }), { status: 200 })
        : new Response(null, { status: 503 }),
    );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function open(items?: Entry[], ok?: boolean) {
  stubFeed(items, ok);
  render(
    <AdminNotificationsProvider>
      <NotificationBell />
    </AdminNotificationsProvider>,
  );
  // Let the initial load settle before the popover is opened.
  await act(async () => {});
  fireEvent.click(screen.getByRole("button", { name: /Notifications/ }));
  return screen.getByRole("dialog", { name: "Notifications" });
}

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("shows the unread count on the bell and drops it once read", async () => {
  const dialog = await open([entry({ id: "a" }), entry({ id: "b" })]);
  expect(
    screen.getByRole("button", { name: "Notifications, 2 unread" }),
  ).toBeVisible();

  fireEvent.click(
    within(dialog).getByRole("button", { name: /Mark all read/ }),
  );
  expect(screen.getByRole("button", { name: "Notifications" })).toBeVisible();
  expect(JSON.parse(localStorage.getItem(READ_KEY) ?? "[]")).toEqual([
    "a",
    "b",
  ]);
});

// Nine is the last count worth reading precisely; past that the number matters
// less than the fact that there is a pile.
it("caps the badge at 9+", async () => {
  const many = Array.from({ length: 12 }, (_, index) =>
    entry({ id: `n${index}` }),
  );
  await open(many);
  expect(screen.getByText("9+")).toBeVisible();
});

it("marks a single notification read when it is followed", async () => {
  const dialog = await open([entry({ id: "one" }), entry({ id: "two" })]);
  fireEvent.click(within(dialog).getAllByRole("link")[0]);

  expect(JSON.parse(localStorage.getItem(READ_KEY) ?? "[]")).toEqual(["one"]);
  // Following a notification closes the popover.
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("restores what was already read from storage", async () => {
  localStorage.setItem(READ_KEY, JSON.stringify(["seen"]));
  await open([entry({ id: "seen" }), entry({ id: "fresh" })]);
  expect(
    screen.getByRole("button", { name: "Notifications, 1 unread" }),
  ).toBeVisible();
});

it.each([
  ["not an array", '{"nope":true}'],
  ["unparseable", "{"],
])(
  "ignores a %s read-state entry rather than failing to render",
  async (_name, stored) => {
    localStorage.setItem(READ_KEY, stored);
    await open([entry({ id: "x" })]);
    expect(
      screen.getByRole("button", { name: "Notifications, 1 unread" }),
    ).toBeVisible();
  },
);

it("offers a retry when the feed cannot be loaded", async () => {
  const dialog = await open([], false);
  expect(
    within(dialog).getByText("Notifications could not be loaded."),
  ).toBeVisible();

  stubFeed([entry({ id: "recovered" })]);
  await act(async () => {
    fireEvent.click(within(dialog).getByRole("button", { name: "Try again" }));
  });
  expect(screen.getByRole("dialog")).toHaveTextContent("Content published");
});

it("says the desk is clear when nothing has happened", async () => {
  const dialog = await open([]);
  expect(within(dialog).getByText("You’re caught up")).toBeVisible();
});

// Sign-in noise and bootstrap records are not operational activity; showing
// them would bury the entries someone has to act on.
it.each(["auth.login", "auth.mfa.verify", "platform.bootstrap"])(
  "keeps %s out of the feed",
  async (action) => {
    const dialog = await open([entry({ id: "noise", action })]);
    expect(within(dialog).getByText("You’re caught up")).toBeVisible();
  },
);

// Every notification is a link to the screen that can act on it, so the
// routing table is the part that has to be right.
it.each([
  ["user.invite", "user", "/team", "Team access"],
  ["privacy.hold.place", "enquiry", "/privacy", "Privacy workflow"],
  ["export.download", "export", "/exports", "Export"],
  ["ticket.checkin", "ticket", "/checkin", "Check-in"],
  ["ticket.refund", "ticket", "/tickets", "Ticket order"],
  ["event.publish", "event", "/events", "Event"],
  ["booking.create", "booking", "/bookings", "Booking"],
  ["enquiry.stage", "enquiry", "/crm", "Enquiry"],
  ["campaign.update", "campaign", "/campaigns", "Campaign"],
  ["media.upload", "media", "/media", "Media asset"],
  ["service.update", "service", "/services", "Service"],
  ["settings.publish", "settings", "/settings", "Site settings"],
  ["content.publish", "content", "/content", "Content"],
  ["something.unmapped", "mystery", "/audit", "Admin activity"],
])("routes %s to %s", async (action, entity, href, subject) => {
  const dialog = await open([
    entry({ id: "routed", action, entity_type: entity }),
  ]);
  const link = within(dialog).getAllByRole("link")[0];
  expect(link).toHaveAttribute("href", href);
  expect(link).toHaveTextContent(subject);
});

// Asserted on the title alone: a link's text content runs the title, the
// description and the timestamp together, so an anchored match never lands.
it.each([
  ["content.create", "Content created"],
  ["content.updated", "Content updated"],
  ["content.publish", "Content published"],
  ["content.delete", "Content deleted"],
  ["user.invite", "Team access sent"],
  ["user.accepted", "Team access accepted"],
  // An unmapped verb is shown as written rather than swallowed.
  ["content.archive", "Content archive"],
])("reads %s as '%s'", async (action, title) => {
  const dialog = await open([entry({ id: "verb", action })]);
  expect(within(dialog).getByText(title)).toBeVisible();
});

it("names a failed outcome but stays quiet about an accepted one", async () => {
  const dialog = await open([
    entry({ id: "ok", outcome: "accepted" }),
    entry({ id: "bad", outcome: "rejected" }),
  ]);
  const [accepted, rejected] = within(dialog).getAllByRole("link");
  expect(accepted).not.toHaveTextContent("· accepted");
  expect(rejected).toHaveTextContent("· rejected");
});

it.each([
  [
    "shortens a long reference",
    "7a1c9f2e-1111-4222-8333-444455556666",
    "7a1c9f2e…6666",
  ],
  ["leaves an email intact", "booker@example.test", "booker@example.test"],
  ["leaves a short id intact", "JK-2026-AB", "JK-2026-AB"],
])("%s", async (_name, entityID, expected) => {
  const dialog = await open([entry({ id: "ref", entity_id: entityID })]);
  expect(within(dialog).getAllByRole("link")[0]).toHaveTextContent(expected);
});

it("omits the reference when the record has no entity", async () => {
  const dialog = await open([entry({ id: "none", entity_id: "" })]);
  expect(within(dialog).getAllByRole("link")[0]).toHaveTextContent(
    "Content activity was recorded.",
  );
});

it.each([
  ["Just now", 0],
  ["5m ago", 5 * 60_000],
  ["3h ago", 3 * 60 * 60_000],
  ["2d ago", 2 * 24 * 60 * 60_000],
])("dates an entry as %s", async (label, age) => {
  const dialog = await open([
    entry({ id: "aged", created_at: new Date(Date.now() - age).toISOString() }),
  ]);
  expect(within(dialog).getByText(label)).toBeVisible();
});

// The toast is for activity arriving while someone is watching, so it must
// stay silent for the batch already on screen when the console opened.
it("announces later activity but not the first load, and dismisses", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const fetchMock = stubFeed([entry({ id: "first" })]);
  render(
    <AdminNotificationsProvider>
      <NotificationBell />
    </AdminNotificationsProvider>,
  );
  await act(async () => {});
  expect(
    screen.queryByRole("button", { name: "Dismiss notification" }),
  ).toBeNull();

  fetchMock.mockResolvedValue(
    new Response(
      JSON.stringify({
        items: [entry({ id: "second", action: "booking.create" })],
      }),
      { status: 200 },
    ),
  );
  // The poll is the only refresh a healthy feed performs.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(45_000);
  });
  expect(screen.getByText("Booking created")).toBeVisible();

  fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));
  expect(
    screen.queryByRole("button", { name: "Dismiss notification" }),
  ).toBeNull();
});

it("retires the toast on its own after a few seconds", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const fetchMock = stubFeed([entry({ id: "first" })]);
  render(
    <AdminNotificationsProvider>
      <NotificationBell />
    </AdminNotificationsProvider>,
  );
  await act(async () => {});
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ items: [entry({ id: "later" })] }), {
      status: 200,
    }),
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(45_000);
  });
  expect(
    screen.getByRole("button", { name: "Dismiss notification" }),
  ).toBeVisible();

  await act(async () => {
    await vi.advanceTimersByTimeAsync(5_300);
  });
  expect(
    screen.queryByRole("button", { name: "Dismiss notification" }),
  ).toBeNull();
});

// Polling a hidden tab wastes a request per tab per interval.
it("skips the poll while the tab is hidden", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const fetchMock = stubFeed([entry({ id: "first" })]);
  render(
    <AdminNotificationsProvider>
      <NotificationBell />
    </AdminNotificationsProvider>,
  );
  await act(async () => {});
  expect(fetchMock).toHaveBeenCalledTimes(1);

  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => "hidden",
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(45_000);
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);

  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => "visible",
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(45_000);
  });
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("closes the popover on Escape and on a click outside", async () => {
  await open([entry({ id: "x" })]);
  fireEvent.keyDown(window, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: /Notifications/ }));
  expect(screen.getByRole("dialog")).toBeVisible();
  fireEvent.mouseDown(document.body);
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("keeps working when local storage refuses to persist", async () => {
  vi.stubGlobal("localStorage", {
    getItem: () => null,
    setItem: () => {
      throw new Error("quota exceeded");
    },
    removeItem: () => undefined,
    clear: () => undefined,
  });
  const dialog = await open([entry({ id: "unsaved" })]);
  fireEvent.click(
    within(dialog).getByRole("button", { name: /Mark all read/ }),
  );
  expect(screen.getByRole("button", { name: "Notifications" })).toBeVisible();
});

/** Exposes the per-section badge count, which nothing else renders here. */
function BadgeProbe({ href }: { href: string }) {
  return (
    <output aria-label="Section badge">
      {useAdminNotifications().badgeFor(href)}
    </output>
  );
}

// The sidebar counts unread activity per section, so an operator can see where
// the work is without opening the bell.
it("counts unread activity against the section it belongs to", async () => {
  stubFeed([
    entry({ id: "e1", action: "event.publish", entity_type: "event" }),
    entry({ id: "e2", action: "event.update", entity_type: "event" }),
    entry({ id: "c1", action: "content.publish", entity_type: "content" }),
  ]);
  render(
    <AdminNotificationsProvider>
      <NotificationBell />
      <BadgeProbe href="/events" />
    </AdminNotificationsProvider>,
  );
  await act(async () => {});
  expect(screen.getByLabelText("Section badge")).toHaveTextContent("2");

  // Reading everything clears the section badge too.
  fireEvent.click(screen.getByRole("button", { name: /Notifications/ }));
  fireEvent.click(screen.getByRole("button", { name: /Mark all read/ }));
  expect(screen.getByLabelText("Section badge")).toHaveTextContent("0");
});

it("refuses to be used outside its provider", () => {
  expect(() => render(<BadgeProbe href="/events" />)).toThrow();
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import {
  AdminNotificationsProvider,
  NotificationBell,
  useAdminNotifications,
} from "./admin-notifications";

const items = [
  {
    id: "audit-1",
    action: "event.publish",
    entity_type: "event",
    entity_id: "event-123",
    outcome: "accepted",
    created_at: new Date().toISOString(),
  },
  {
    id: "audit-2",
    action: "user.invite",
    entity_type: "auth",
    entity_id: "staff@example.com",
    outcome: "accepted",
    created_at: new Date().toISOString(),
  },
  {
    id: "audit-3",
    action: "auth.login",
    entity_type: "auth",
    entity_id: "user-1",
    outcome: "accepted",
    created_at: new Date().toISOString(),
  },
];

function BadgeProbe() {
  const notifications = useAdminNotifications();
  return (
    <output aria-label="Event badge">
      {notifications.badgeFor("/events")}
    </output>
  );
}

describe("AdminNotifications", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ items }), { status: 200 }),
    );
  });

  afterEach(() => vi.restoreAllMocks());

  it("shows meaningful unread activity and filters noisy sign-ins", async () => {
    render(
      <AdminNotificationsProvider>
        <NotificationBell />
        <BadgeProbe />
      </AdminNotificationsProvider>,
    );

    const bell = await screen.findByRole("button", {
      name: "Notifications, 2 unread",
    });
    expect(screen.getByLabelText("Event badge")).toHaveTextContent("1");

    fireEvent.click(bell);
    expect(
      screen.getByRole("heading", { name: "Notifications" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Event published")).toBeInTheDocument();
    expect(screen.getByText("Team access sent")).toBeInTheDocument();
    expect(screen.queryByText(/sign in/i)).not.toBeInTheDocument();
  });

  it("marks the feed read and persists the state", async () => {
    render(
      <AdminNotificationsProvider>
        <NotificationBell />
      </AdminNotificationsProvider>,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Notifications, 2 unread" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Mark all read" }));

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Notifications" }),
      ).toBeInTheDocument(),
    );
    expect(
      JSON.parse(localStorage.getItem("jk.admin.notifications.read") ?? "[]"),
    ).toEqual(["audit-1", "audit-2"]);
  });

  it("offers retry when the feed is unavailable", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 503 }));
    render(
      <AdminNotificationsProvider>
        <NotificationBell />
      </AdminNotificationsProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
    expect(
      await screen.findByText("Notifications could not be loaded."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
  });
});

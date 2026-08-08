import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TeamWorkspace } from "./team-workspace";

beforeEach(() => {
  // A leading space survives the split on ";" — csrfCookie has to trim before
  // matching, or the header goes out empty and the API fails the request closed.
  Object.defineProperty(document, "cookie", {
    configurable: true,
    writable: true,
    value: "jk_theme=dark; jk_admin_csrf=test-csrf",
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "clipboard");
});

function stubUsers(users: unknown[]) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ users }),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** Directory payload shaped the way `load()` reads it. */
function directory(users: unknown[]) {
  return Response.json({ users });
}

function stubSequence(...responses: Response[]) {
  const fetchMock = vi.fn();
  for (const response of responses) fetchMock.mockResolvedValueOnce(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const staffUser = {
  id: "10000000-0000-4000-8000-000000000001",
  name: "Ama Mensah",
  email: "ama@example.com",
  role: "content_editor",
  status: "active",
  mfa_enabled: true,
};

async function openInviteDialog() {
  fireEvent.click(screen.getByRole("button", { name: "Invite staff" }));
  return screen.findByRole("dialog", { name: "Invite staff" });
}

describe("TeamWorkspace", () => {
  it("puts the invite action in the shared header beside the copy, not under it", async () => {
    stubUsers([staffUser]);
    render(<TeamWorkspace />);

    const heading = await screen.findByRole("heading", {
      name: "Users & roles",
    });
    // The action has to live in the same `stage-head` element as the copy —
    // that is what keeps it pinned right instead of stacking below the lede.
    const header = heading.closest("header");
    expect(header).toHaveClass("stage-head");
    expect(
      within(header as HTMLElement).getByRole("button", {
        name: "Invite staff",
      }),
    ).toBeInTheDocument();
    expect(
      within(header as HTMLElement).getByText(/Provision staff/),
    ).toHaveClass("stage-head__lede");
  });

  it("shows the empty state instead of a bare table when no staff exist", async () => {
    stubUsers([]);
    render(<TeamWorkspace />);

    expect(
      await screen.findByRole("heading", { name: "No staff accounts yet" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();

    // The empty state has to be a way out of the dead end, not just a message.
    fireEvent.click(
      within(
        screen.getByRole("heading", { name: "No staff accounts yet" })
          .parentElement as HTMLElement,
      ).getByRole("button", { name: "Invite staff" }),
    );
    expect(
      await screen.findByRole("dialog", { name: "Invite staff" }),
    ).toBeInTheDocument();
  });

  it("renders the directory table once staff exist", async () => {
    stubUsers([staffUser]);
    render(<TeamWorkspace />);

    expect(await screen.findByText("ama@example.com")).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "No staff accounts yet" }),
    ).not.toBeInTheDocument();
  });

  it("renders every staff member as a row carrying their name, email, role and status", async () => {
    stubUsers([
      staffUser,
      {
        ...staffUser,
        id: "10000000-0000-4000-8000-000000000002",
        name: "Kofi Boateng",
        email: "kofi@example.com",
        role: "analyst",
        status: "disabled",
      },
    ]);
    render(<TeamWorkspace />);

    await screen.findByText("ama@example.com");
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    // Header row plus one row per user — a directory that silently drops a
    // staff account is how a stale administrator keeps their access.
    expect(rows).toHaveLength(3);

    const active = within(rows[1] as HTMLElement);
    expect(active.getByText("Ama Mensah")).toBeInTheDocument();
    expect(active.getByRole("button", { name: "Role for Ama Mensah" })).toHaveTextContent(
      "Content editor",
    );
    expect(active.getByRole("button", { name: "Disable" })).toBeEnabled();

    // A disabled account must not be re-roled or disabled again: the role
    // control is locked and the action cell falls back to a dash.
    const inactive = within(rows[2] as HTMLElement);
    expect(inactive.getByText("disabled")).toBeInTheDocument();
    expect(
      inactive.getByRole("button", { name: "Role for Kofi Boateng" }),
    ).toBeDisabled();
    expect(
      inactive.queryByRole("button", { name: "Disable" }),
    ).not.toBeInTheDocument();
  });

  it("treats a directory response with no users key as an empty directory", async () => {
    // The API omits `users` entirely rather than sending `[]`. Without the
    // fallback, `users.map` runs on undefined and the whole page white-screens.
    stubSequence(Response.json({}));
    render(<TeamWorkspace />);

    expect(
      await screen.findByRole("heading", { name: "No staff accounts yet" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Staff directory is unavailable" }),
    ).not.toBeInTheDocument();
  });

  it("reports a load failure without leaking the server error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );
    render(<TeamWorkspace />);

    expect(
      await screen.findByRole("heading", {
        name: "Staff directory is unavailable",
      }),
    ).toBeInTheDocument();
  });

  it("reports a load failure when the request never reaches the API", async () => {
    // A rejected fetch takes a different path to the same state as a 500: the
    // `.catch` on the effect, not the `!response.ok` throw.
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(<TeamWorkspace />);

    expect(
      await screen.findByText("Staff directory could not be loaded."),
    ).toBeVisible();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("explains the administrator-only restriction on 403", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 403 }),
    );
    render(<TeamWorkspace />);

    expect(
      await screen.findByRole("heading", {
        name: "Administrator access required",
      }),
    ).toBeInTheDocument();
    // Forbidden is not the same as broken: the invite affordance must be gone
    // rather than offered to someone the API will reject.
    expect(
      screen.queryByRole("button", { name: "Invite staff" }),
    ).not.toBeInTheDocument();
  });

  it("invites with an email and a role only, and never sends a name", async () => {
    const fetchMock = stubSequence(
      directory([staffUser]),
      Response.json({
        email: "kwame@example.com",
        accept_url: "https://joekuntani.com/admin/accept/tok",
        emailed: true,
      }),
      directory([
        staffUser,
        {
          ...staffUser,
          id: "10000000-0000-4000-8000-000000000003",
          name: "",
          email: "kwame@example.com",
          role: "administrator",
          status: "invited",
        },
      ]),
    );
    render(<TeamWorkspace />);
    await screen.findByText("ama@example.com");

    const dialog = await openInviteDialog();
    // The invitee sets their own name from the link, so the form must not ask
    // for one — email is the only text field in it.
    expect(within(dialog).queryByLabelText(/name/i)).not.toBeInTheDocument();
    expect(within(dialog).getAllByRole("textbox")).toHaveLength(1);

    fireEvent.change(within(dialog).getByLabelText("Email"), {
      target: { value: "kwame@example.com" },
    });
    const roleTrigger = within(dialog).getByRole("button", { name: /Role/ });
    // Content editor is the least-privileged default: an invite form that
    // pre-selects administrator hands out the keys on a mis-click.
    expect(roleTrigger).toHaveTextContent("Content editor");
    fireEvent.click(roleTrigger);
    fireEvent.click(screen.getByRole("option", { name: "Administrator" }));
    fireEvent.submit(
      within(dialog)
        .getByRole("button", { name: "Send invitation" })
        .closest("form") as HTMLFormElement,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe("/api/admin/auth/users");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual(
      expect.objectContaining({ "X-CSRF-Token": "test-csrf" }),
    );
    const payload = JSON.parse(String(init.body));
    expect(payload).toEqual({
      email: "kwame@example.com",
      role: "administrator",
    });
    expect(payload).not.toHaveProperty("name");

    // Success closes the dialog, states the 15-minute expiry, and re-reads the
    // directory so the pending invite is visible without a manual refresh.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("status")).toHaveTextContent(
      /Invitation sent to kwame@example.com/,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      /expires in 15 minutes/,
    );
    expect(screen.getByText("kwame@example.com")).toBeInTheDocument();
    // Delivery happened, so the raw single-use link must not be left on screen.
    expect(screen.queryByLabelText("Invitation link")).not.toBeInTheDocument();
  });

  it("keeps the invite dialog open and explains a rejected invitation", async () => {
    const fetchMock = stubSequence(
      directory([staffUser]),
      new Response(null, { status: 409 }),
    );
    render(<TeamWorkspace />);
    await screen.findByText("ama@example.com");

    const dialog = await openInviteDialog();
    fireEvent.change(within(dialog).getByLabelText("Email"), {
      target: { value: "ama@example.com" },
    });
    fireEvent.submit(
      within(dialog)
        .getByRole("button", { name: "Send invitation" })
        .closest("form") as HTMLFormElement,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not send that invitation. Check that the email address is valid and not already in use.",
    );
    // The typed address has to survive the failure — closing the dialog would
    // make the operator retype it, and reloading would hide the reason.
    expect(screen.getByRole("dialog", { name: "Invite staff" })).toBeVisible();
    expect(within(dialog).getByLabelText("Email")).toHaveValue(
      "ama@example.com",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("hands back the single-use link when email delivery is not configured", async () => {
    const writeText = vi.fn();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const fetchMock = stubSequence(
      directory([staffUser]),
      Response.json({
        email: "kwame@example.com",
        accept_url: "https://joekuntani.com/admin/accept/tok-123",
        emailed: false,
      }),
      directory([staffUser]),
    );
    render(<TeamWorkspace />);
    await screen.findByText("ama@example.com");

    const dialog = await openInviteDialog();
    fireEvent.change(within(dialog).getByLabelText("Email"), {
      target: { value: "kwame@example.com" },
    });
    fireEvent.submit(
      within(dialog)
        .getByRole("button", { name: "Send invitation" })
        .closest("form") as HTMLFormElement,
    );

    // Without this panel the account exists and nobody can reach it: the link
    // is the only way in when the mailer is not wired up.
    const link = await screen.findByLabelText("Invitation link");
    expect(link).toHaveValue("https://joekuntani.com/admin/accept/tok-123");
    expect(screen.getByRole("status")).toHaveTextContent(
      /Email delivery is not configured/,
    );
    expect(
      screen.getByText(/works once and expires 15\s+minutes after it was issued/),
    ).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith(
      "https://joekuntani.com/admin/accept/tok-123",
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("shows no link panel when delivery failed and no link came back", async () => {
    const fetchMock = stubSequence(
      directory([staffUser]),
      Response.json({ email: "kwame@example.com", emailed: false }),
      directory([staffUser]),
    );
    render(<TeamWorkspace />);
    await screen.findByText("ama@example.com");

    const dialog = await openInviteDialog();
    fireEvent.change(within(dialog).getByLabelText("Email"), {
      target: { value: "kwame@example.com" },
    });
    fireEvent.submit(
      within(dialog)
        .getByRole("button", { name: "Send invitation" })
        .closest("form") as HTMLFormElement,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    // An absent accept_url must collapse to no panel at all. Rendering the
    // box anyway gives the operator an empty field to copy and a Copy button
    // that silently puts nothing on the clipboard.
    expect(screen.queryByLabelText("Invitation link")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      /Email delivery is not configured/,
    );
  });

  it("dismisses the invite dialog without provisioning anyone", async () => {
    const fetchMock = stubSequence(directory([staffUser]));
    render(<TeamWorkspace />);
    await screen.findByText("ama@example.com");

    await openInviteDialog();
    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // Cancelling must not have created an account.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("changes a role through an audited PATCH and re-reads the directory", async () => {
    const fetchMock = stubSequence(
      directory([staffUser]),
      new Response(null, { status: 204 }),
      directory([{ ...staffUser, role: "booking_manager" }]),
    );
    render(<TeamWorkspace />);
    await screen.findByText("ama@example.com");

    fireEvent.click(screen.getByRole("button", { name: "Role for Ama Mensah" }));
    fireEvent.click(screen.getByRole("option", { name: "Booking manager" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `/api/admin/auth/users/${staffUser.id}/role`,
      expect.objectContaining({
        method: "PATCH",
        credentials: "include",
        body: JSON.stringify({ role: "booking_manager" }),
        headers: expect.objectContaining({ "X-CSRF-Token": "test-csrf" }),
      }),
    );
    // The control is driven by server state, so it may only settle on the new
    // role once the reload confirms it — an optimistic label would lie.
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Role for Ama Mensah" }),
      ).toHaveTextContent("Booking manager"),
    );
  });

  it("reports a rejected role change and leaves the shown role alone", async () => {
    const fetchMock = stubSequence(
      directory([staffUser]),
      new Response(null, { status: 403 }),
    );
    render(<TeamWorkspace />);
    await screen.findByText("ama@example.com");

    fireEvent.click(screen.getByRole("button", { name: "Role for Ama Mensah" }));
    fireEvent.click(screen.getByRole("option", { name: "Administrator" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not update role.",
    );
    // No reload after a failure, and the row still shows the role the server
    // actually holds.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      screen.getByRole("button", { name: "Role for Ama Mensah" }),
    ).toHaveTextContent("Content editor");
  });

  it("disables a user and reloads so the row loses its actions", async () => {
    const fetchMock = stubSequence(
      directory([staffUser]),
      new Response(null, { status: 204 }),
      directory([{ ...staffUser, status: "disabled" }]),
    );
    render(<TeamWorkspace />);
    await screen.findByText("ama@example.com");

    fireEvent.click(screen.getByRole("button", { name: "Disable" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `/api/admin/auth/users/${staffUser.id}/disable`,
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: expect.objectContaining({ "X-CSRF-Token": "test-csrf" }),
      }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Disable" }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: "Role for Ama Mensah" }),
    ).toBeDisabled();
  });

  it("reports a rejected disable and keeps the account actionable", async () => {
    const fetchMock = stubSequence(
      directory([staffUser]),
      new Response(null, { status: 500 }),
    );
    render(<TeamWorkspace />);
    await screen.findByText("ama@example.com");

    fireEvent.click(screen.getByRole("button", { name: "Disable" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not disable user.",
    );
    // A failed disable must not look like it worked: the button stays so the
    // operator can retry.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Disable" })).toBeInTheDocument();
  });

  it("sends an empty CSRF token rather than the literal string undefined", async () => {
    // csrfCookie falls back to "" when the cookie is absent. Without the
    // fallback the header value would be `undefined` and the browser would
    // send the four characters "undefined", which reads as a forged token.
    Object.defineProperty(document, "cookie", {
      configurable: true,
      writable: true,
      value: "jk_theme=dark",
    });
    const fetchMock = stubSequence(
      directory([staffUser]),
      new Response(null, { status: 500 }),
    );
    render(<TeamWorkspace />);
    await screen.findByText("ama@example.com");

    fireEvent.click(screen.getByRole("button", { name: "Disable" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toEqual({
      "X-CSRF-Token": "",
    });
  });
});

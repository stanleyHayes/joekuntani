import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TeamWorkspace } from "./team-workspace";

afterEach(() => vi.unstubAllGlobals());

function stubUsers(users: unknown[]) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ users }),
  });
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
  });
});

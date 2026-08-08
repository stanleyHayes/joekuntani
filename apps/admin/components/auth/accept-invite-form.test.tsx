import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { AcceptInviteForm } from "./accept-invite-form";

const replace = vi.fn();
const refresh = vi.fn();
let token = "invite-token";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh }),
  useSearchParams: () => new URLSearchParams(token ? `token=${token}` : ""),
}));

const invitation = {
  name: "Ama Mensah",
  email: "ama@example.invalid",
  role: "content_editor",
};

describe("AcceptInviteForm", () => {
  beforeEach(() => {
    replace.mockReset();
    refresh.mockReset();
    token = "invite-token";
    vi.restoreAllMocks();
  });

  it("sets the password and hands off to sign-in", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(invitation), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    render(<AcceptInviteForm />);
    expect(await screen.findByText("Welcome, Ama Mensah")).toBeVisible();

    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "correct horse battery" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "correct horse battery" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Set password and continue" }),
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/admin/login"));
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(url).toBe("/api/admin/auth/invitations/invite-token/accept");
    expect(JSON.parse(String(init?.body))).toEqual({
      password: "correct horse battery",
    });
  });

  it("refuses to submit when the confirmation does not match", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify(invitation), { status: 200 }),
      );
    render(<AcceptInviteForm />);
    await screen.findByText("Welcome, Ama Mensah");

    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "correct horse battery" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "a different password" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Set password and continue" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Those passwords do not match.",
    );
    // Only the initial invitation lookup — nothing was sent.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(replace).not.toHaveBeenCalled();
  });

  it("explains a spent or expired link instead of offering the form", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 404 }),
    );
    render(<AcceptInviteForm />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ask an administrator to send you a new invitation.",
    );
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
  });

  it("does not call the API at all when the link carries no token", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    token = "";
    render(<AcceptInviteForm />);

    expect(await screen.findByRole("alert")).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

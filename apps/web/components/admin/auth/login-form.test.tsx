import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { LoginForm } from "./login-form";

const replace = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh }) }));

describe("LoginForm", () => {
  beforeEach(() => {
    replace.mockReset();
    refresh.mockReset();
    vi.restoreAllMocks();
  });
  it("submits credentials without rendering them and continues to MFA", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ mfa_required: true }), { status: 200 }),
      );
    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: " staff@example.invalid " },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: " correct horse battery staple " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue securely" }));
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/admin/login/mfa"),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/auth/login",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({
          email: "staff@example.invalid",
          password: "correct horse battery staple",
        }),
      }),
    );
    expect(
      screen.queryByText("correct horse battery staple"),
    ).not.toBeInTheDocument();
  });
  it("shows a generic rejection", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 401 }),
    );
    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "staff@example.invalid" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "wrong but long enough" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue securely" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Sign-in was not accepted",
    );
  });
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { MFAForm } from "./mfa-form";

const replace = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh }) }));

describe("MFAForm", () => {
  beforeEach(() => {
    replace.mockReset();
    refresh.mockReset();
    vi.restoreAllMocks();
  });
  it("submits a six-digit code and enters admin", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ authenticated: true }), { status: 200 }),
    );
    render(<MFAForm />);
    fireEvent.change(screen.getByLabelText("Verification code"), {
      target: { value: "123456" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Verify and continue" }),
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/admin"));
  });
  it("does not expose provider details on rejection", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 401 }),
    );
    render(<MFAForm />);
    fireEvent.change(screen.getByLabelText("Verification code"), {
      target: { value: "000000" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Verify and continue" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("not accepted");
  });
});

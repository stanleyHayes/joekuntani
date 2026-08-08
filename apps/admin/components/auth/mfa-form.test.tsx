import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { MFAForm } from "./mfa-form";

const replace = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh }) }));
vi.mock("qrcode", () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,qr"),
  },
}));

const setupPayload = {
  email: "admin@example.invalid",
  secret: "JBSWY3DPEHPK3PXP",
  otpauth_uri:
    "otpauth://totp/Joe%20Kuntani:admin@example.invalid?secret=JBSWY3DPEHPK3PXP&issuer=Joe%20Kuntani",
};

function enterCode(code: string) {
  const first = screen.getByLabelText("Digit 1 of 6");
  fireEvent.paste(first, {
    clipboardData: { getData: () => code },
  });
}

describe("MFAForm", () => {
  beforeEach(() => {
    replace.mockReset();
    refresh.mockReset();
  });

  it("shows a scannable QR in the authenticator setup panel", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(setupPayload), { status: 200 }),
    );
    render(<MFAForm />);
    expect(
      await screen.findByAltText(
        "Scan this QR code with your authenticator app",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(setupPayload.secret)).toBeInTheDocument();
  });

  it("submits a six-digit code and enters admin", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/mfa/setup")) {
        return new Response(JSON.stringify(setupPayload), { status: 200 });
      }
      return new Response(JSON.stringify({ authenticated: true }), {
        status: 200,
      });
    });
    render(<MFAForm />);
    enterCode("123456");
    fireEvent.click(
      screen.getByRole("button", { name: "Verify and continue" }),
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/admin"));
  });

  it("does not expose provider details on rejection", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/mfa/setup")) {
        return new Response(null, { status: 401 });
      }
      return new Response(null, { status: 401 });
    });
    render(<MFAForm />);
    enterCode("000000");
    fireEvent.click(
      screen.getByRole("button", { name: "Verify and continue" }),
    );
    expect(await screen.findByText(/not accepted/i)).toBeInTheDocument();
  });
});

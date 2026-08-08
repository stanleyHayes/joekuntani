import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PrivacyWorkspace } from "./privacy-workspace";

afterEach(() => {
  document.cookie = "jk_admin_csrf=; Max-Age=0";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("PrivacyWorkspace", () => {
  it("loads retention status, places a hold, and runs retention", async () => {
    document.cookie = "jk_admin_csrf=token";
    let holds: Array<{
      id: string;
      contact_id: string;
      reason: string;
      created_at: string;
    }> = [];
    let eligible = 2;
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        if (url === "/api/admin/privacy" && method === "GET") {
          return {
            ok: true,
            json: async () => ({
              retention_months: 24,
              eligible_count: eligible,
              active_holds: holds.length,
              generated_at: "2026-08-05T12:00:00Z",
            }),
          };
        }
        if (url === "/api/admin/privacy/holds" && method === "GET") {
          return { ok: true, json: async () => ({ items: holds }) };
        }
        if (url === "/api/admin/privacy/holds" && method === "POST") {
          holds = [
            {
              id: "10000000-0000-4000-8000-000000000001",
              contact_id: "20000000-0000-4000-8000-000000000002",
              reason: "Litigation hold for active dispute",
              created_at: "2026-08-05T12:00:00Z",
            },
          ];
          return { ok: true, json: async () => holds[0] };
        }
        if (
          url.startsWith("/api/admin/privacy/retention") &&
          method === "POST"
        ) {
          eligible = 1;
          return {
            ok: true,
            json: async () => ({
              purged: 1,
              skipped: 1,
              cutoff_at: "2024-08-05T12:00:00Z",
              completed_at: "2026-08-05T12:02:00Z",
            }),
          };
        }
        return { ok: false, json: async () => ({}) };
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<PrivacyWorkspace />);
    expect(await screen.findByText(/24 months/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Contact ID"), {
      target: { value: "20000000-0000-4000-8000-000000000002" },
    });
    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "Litigation hold for active dispute" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Place hold" }).closest("form")!,
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Legal hold placed"),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/privacy/holds",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        headers: expect.objectContaining({ "X-CSRF-Token": "token" }),
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Run retention batch" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Purged 1"),
    );
  });

  it("fails closed when status cannot load", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    render(<PrivacyWorkspace />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Privacy controls are unavailable",
    );
  });
});

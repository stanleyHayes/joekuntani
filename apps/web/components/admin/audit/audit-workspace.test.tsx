import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuditWorkspace } from "./audit-workspace";

afterEach(() => vi.unstubAllGlobals());

describe("AuditWorkspace", () => {
  it("submits filters and renders accessible audit rows", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        query: "export",
        limited: false,
        items: [
          {
            id: "10000000-0000-4000-8000-000000000001",
            action: "export.bookings",
            entity_type: "export",
            entity_id: "bookings",
            created_at: "2026-08-05T18:00:00Z",
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AuditWorkspace />);
    fireEvent.change(screen.getByLabelText("Free-text filter"), {
      target: { value: "export" },
    });
    fireEvent.submit(screen.getByRole("search"));
    expect(await screen.findByText("export.bookings")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("q=export"),
      expect.objectContaining({
        credentials: "same-origin",
        cache: "no-store",
      }),
    );
    expect(screen.getByRole("status")).toHaveTextContent("1 event");
  });

  it("reports empty and failure states without raw server errors", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ query: "", limited: false, items: [] }),
      })
      .mockResolvedValueOnce({ ok: false });
    vi.stubGlobal("fetch", fetchMock);
    render(<AuditWorkspace />);
    fireEvent.submit(screen.getByRole("search"));
    expect(
      await screen.findByRole("heading", { name: "No audit events" }),
    ).toBeInTheDocument();
    fireEvent.submit(screen.getByRole("search"));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "could not be completed",
      ),
    );
  });
});

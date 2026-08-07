import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExportsWorkspace } from "./exports-workspace";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ExportsWorkspace", () => {
  it("loads authorized resources and downloads an audited CSV", async () => {
    const blob = new Blob(["id\n1\n"], { type: "text/csv" });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ resources: ["bookings", "campaigns"] }),
      })
      .mockResolvedValueOnce({ ok: true, blob: async () => blob });
    vi.stubGlobal("fetch", fetchMock);
    const click = vi.fn();
    const anchor = {
      click,
      set href(_value: string) {},
      set download(_value: string) {},
    } as unknown as HTMLAnchorElement;
    const createElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
      if (tag === "a") return anchor;
      return createElement(tag);
    }) as typeof document.createElement);
    vi.stubGlobal("URL", {
      createObjectURL: () => "blob:export",
      revokeObjectURL: vi.fn(),
    });

    render(<ExportsWorkspace />);
    await screen.findByText("Choose a resource your role may export.");
    fireEvent.click(screen.getByRole("button", { name: "Export resource" }));
    fireEvent.click(screen.getByRole("option", { name: "Bookings" }));
    fireEvent.submit(
      screen.getByRole("button", { name: "Download CSV" }).closest("form")!,
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("audited"),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/admin/exports/bookings",
      expect.objectContaining({
        credentials: "same-origin",
        cache: "no-store",
      }),
    );
    expect(click).toHaveBeenCalled();
  });

  it("fails closed when resources cannot be loaded", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    render(<ExportsWorkspace />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Exports are unavailable",
    );
  });
});

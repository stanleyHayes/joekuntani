import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SearchWorkspace } from "./search-workspace";

afterEach(() => vi.unstubAllGlobals());

describe("SearchWorkspace", () => {
  it("submits an encoded bounded query and renders minimal accessible results", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        query: "launch & press",
        limited: false,
        items: [
          {
            id: "10000000-0000-4000-8000-000000000001",
            kind: "content",
            title: "Launch story",
            context: "press_items · published",
            href: "/content?item=10000000-0000-4000-8000-000000000001",
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<SearchWorkspace />);
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "launch & press" },
    });
    fireEvent.submit(screen.getByRole("search"));
    expect(
      await screen.findByRole("link", { name: /Launch story/ }),
    ).toHaveAttribute("href", expect.stringContaining("/content"));
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("launch%20%26%20press"),
      expect.objectContaining({
        credentials: "same-origin",
        cache: "no-store",
      }),
    );
    expect(screen.getByRole("status")).toHaveTextContent("1 result");
  });

  it("reports empty, limited and failure states without exposing raw server errors", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ query: "none", limited: true, items: [] }),
      })
      .mockResolvedValueOnce({ ok: false });
    vi.stubGlobal("fetch", fetchMock);
    render(<SearchWorkspace />);
    const input = screen.getByRole("searchbox");
    fireEvent.change(input, { target: { value: "none" } });
    fireEvent.submit(screen.getByRole("search"));
    expect(
      await screen.findByRole("heading", { name: "No matches" }),
    ).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "retry" } });
    fireEvent.submit(screen.getByRole("search"));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "could not be completed",
      ),
    );
  });

  it("rejects a one-character query before network access", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<SearchWorkspace />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "x" } });
    fireEvent.submit(screen.getByRole("search"));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "could not be completed",
    );
  });
});

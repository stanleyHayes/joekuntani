import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiAssist } from "./ai-assist";

afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = "jk_admin_csrf=; max-age=0";
});

function streamingResponse(chunks: string[]) {
  const encoder = new TextEncoder();
  return {
    ok: true,
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
  };
}

describe("AiAssist", () => {
  it("keeps the actions disabled until there is a draft to edit", () => {
    render(<AiAssist value="   " onApply={vi.fn()} />);

    expect(screen.getByRole("button", { name: /Rewrite/ })).toBeDisabled();
    expect(screen.getByText(/Write a rough draft first/)).toBeInTheDocument();
  });

  it("streams a suggestion and only applies it once accepted", async () => {
    document.cookie = "jk_admin_csrf=token-123";
    const fetchMock = vi
      .fn()
      .mockResolvedValue(streamingResponse(["Joe brings ", "the house down."]));
    vi.stubGlobal("fetch", fetchMock);
    const onApply = vi.fn();

    render(<AiAssist field="summary" value="joe is funny" onApply={onApply} />);
    fireEvent.click(screen.getByRole("button", { name: /Rewrite/ }));

    expect(
      await screen.findByText("Joe brings the house down."),
    ).toBeInTheDocument();
    // The field must not change while the operator is still deciding.
    expect(onApply).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole("button", { name: /Use this/ }));
    expect(onApply).toHaveBeenCalledWith("Joe brings the house down.");

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({
      action: "rewrite",
      field: "summary",
      text: "joe is funny",
    });
    expect(init.headers["X-CSRF-Token"]).toBe("token-123");
  });

  it("discards a suggestion without touching the field", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(streamingResponse(["A tighter line."])),
    );
    const onApply = vi.fn();

    render(<AiAssist value="a rambling line" onApply={onApply} />);
    fireEvent.click(screen.getByRole("button", { name: /Shorten/ }));

    fireEvent.click(await screen.findByRole("button", { name: /Discard/ }));

    await waitFor(() =>
      expect(screen.queryByText("A tighter line.")).not.toBeInTheDocument(),
    );
    expect(onApply).not.toHaveBeenCalled();
  });

  it("restores the previous draft when the AI edit is undone", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(streamingResponse(["Rewritten."])),
    );
    const onApply = vi.fn();

    render(<AiAssist value="original draft" onApply={onApply} />);
    fireEvent.click(screen.getByRole("button", { name: /Rewrite/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Use this/ }));

    fireEvent.click(
      await screen.findByRole("button", { name: "Undo AI edit" }),
    );
    expect(onApply).toHaveBeenLastCalledWith("original draft");
  });

  it("surfaces the server's reason without leaking a raw error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ title: "Writing assistant is not configured" }),
      }),
    );

    render(<AiAssist value="draft copy" onApply={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Formalize/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Writing assistant is not configured",
    );
  });

  it("stops a run in progress without reporting it as a failure", async () => {
    const encoder = new TextEncoder();
    // Emits a first chunk then stays open, so the run can only end by abort.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url: string, init: RequestInit) => ({
        ok: true,
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode("Half a sugg"));
            init.signal?.addEventListener("abort", () =>
              controller.error(
                Object.assign(new Error("aborted"), { name: "AbortError" }),
              ),
            );
          },
        }),
      })),
    );
    const onApply = vi.fn();

    render(<AiAssist value="draft copy" onApply={onApply} />);
    fireEvent.click(screen.getByRole("button", { name: /Rewrite/ }));

    fireEvent.click(await screen.findByRole("button", { name: /Stop/ }));

    await waitFor(() =>
      expect(screen.queryByText("Half a sugg")).not.toBeInTheDocument(),
    );
    // Aborting is a deliberate act, not an error to report.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Rewrite/ })).toBeEnabled(),
    );
  });

  it("says so when the model returns nothing usable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(streamingResponse(["   "])),
    );

    render(<AiAssist value="draft copy" onApply={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Expand/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No suggestion came back",
    );
  });

  it("stays inert while the surrounding form is disabled", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<AiAssist value="draft copy" onApply={vi.fn()} disabled />);

    const rewrite = screen.getByRole("button", { name: /Rewrite/ });
    expect(rewrite).toBeDisabled();
    fireEvent.click(rewrite);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to a generic message when the failure body is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => {
          throw new SyntaxError("not JSON");
        },
      }),
    );

    render(<AiAssist value="draft copy" onApply={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Rewrite/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The writing assistant is unavailable.",
    );
  });

  it("reports a network failure instead of hanging on the spinner", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    render(<AiAssist value="draft copy" onApply={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Proofread/ }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Proofread/ })).toBeEnabled(),
    );
  });
});

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import type { PublicService } from "../../services/types";
import { ServiceEditor } from "./service-editor";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

const first: PublicService = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Approved first",
  slug: "approved-first",
  summary: "Approved summary",
  description: "",
  category: "Approved category",
  active: true,
  state: "active",
  version: 1,
  sort_order: 0,
  form_schema: { version: 1, questions: [] },
  cta: { label: "Share a brief", href: "/book" },
  created_at: "2026-08-05T00:00:00Z",
  updated_at: "2026-08-05T00:00:00Z",
};
const second = {
  ...first,
  id: "22222222-2222-4222-8222-222222222222",
  name: "Approved second",
  slug: "approved-second",
  active: false,
  sort_order: 1,
};

function stubCSRF() {
  Object.defineProperty(document, "cookie", {
    configurable: true,
    value: "jk_admin_csrf=test-csrf",
  });
}

afterEach(() => {
  push.mockReset();
  refresh.mockReset();
  vi.unstubAllGlobals();
});

it("edits a service, validates the schema and persists with CSRF", async () => {
  stubCSRF();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [first, second] }), { status: 200 }),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify(first), { status: 200 }),
    );
  vi.stubGlobal("fetch", fetcher);
  render(<ServiceEditor serviceID={first.id} />);

  const name = await screen.findByLabelText("Service name");
  expect(name).toHaveValue("Approved first");
  fireEvent.change(name, { target: { value: "Approved updated" } });
  const questions = screen.getByLabelText(/Service-specific questions/);
  fireEvent.change(questions, { target: { value: "{" } });
  expect(questions).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByRole("button", { name: "Save service" })).toBeDisabled();
  fireEvent.change(questions, { target: { value: "[]" } });
  fireEvent.click(screen.getByRole("button", { name: "Save service" }));

  await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/services"));
  expect(fetcher.mock.calls[1]).toEqual([
    `/api/admin/services/${first.id}`,
    expect.objectContaining({
      method: "PUT",
      headers: expect.objectContaining({ "X-CSRF-Token": "test-csrf" }),
    }),
  ]);
  const body = JSON.parse(fetcher.mock.calls[1]?.[1]?.body as string);
  expect(body).toMatchObject({ name: "Approved updated", version: 1 });
});

it("creates a service at the end of the display order", async () => {
  stubCSRF();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [first, second] }), { status: 200 }),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify(first), { status: 201 }),
    );
  vi.stubGlobal("fetch", fetcher);
  render(<ServiceEditor serviceID="new" />);

  fireEvent.change(await screen.findByLabelText("Service name"), {
    target: { value: "Approved third" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create service" }));

  await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/services"));
  expect(fetcher.mock.calls[1]?.[0]).toBe("/api/admin/services");
  expect(fetcher.mock.calls[1]?.[1]?.method).toBe("POST");
  const body = JSON.parse(fetcher.mock.calls[1]?.[1]?.body as string);
  // Two services already exist, so the new one sorts after them, and a service
  // that has never been saved carries no version to check.
  expect(body.sort_order).toBe(2);
  expect(body.version).toBeUndefined();
});

it("keeps the draft on the page when a name conflicts", async () => {
  stubCSRF();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [first] }), { status: 200 }),
    )
    .mockResolvedValueOnce(new Response(null, { status: 409 }));
  vi.stubGlobal("fetch", fetcher);
  render(<ServiceEditor serviceID={first.id} />);

  fireEvent.change(await screen.findByLabelText("Service name"), {
    target: { value: "Approved second" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save service" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "conflicts with an existing immutable slug",
  );
  expect(push).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Service name")).toHaveValue("Approved second");
});

it("reports a service that cannot be opened without exposing internals", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("secret")));
  render(<ServiceEditor serviceID={first.id} />);
  expect(
    await screen.findByText("That service could not be opened"),
  ).toBeVisible();
  expect(screen.queryByText("secret")).toBeNull();
});

it("rewrites service copy through the assistant without renaming the field", async () => {
  stubCSRF();
  const encoder = new TextEncoder();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [first] }), { status: 200 }),
    )
    .mockResolvedValueOnce({
      ok: true,
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode("A polished service summary."));
          controller.close();
        },
      }),
    });
  vi.stubGlobal("fetch", fetcher);
  render(<ServiceEditor serviceID={first.id} />);

  const summary = await screen.findByRole("textbox", { name: "Summary" });
  fireEvent.click(
    within(summary.closest("div") as HTMLElement).getByRole("button", {
      name: /Rewrite/,
    }),
  );
  fireEvent.click(await screen.findByRole("button", { name: /Use this/ }));

  await waitFor(() =>
    expect(screen.getByRole("textbox", { name: "Summary" })).toHaveValue(
      "A polished service summary.",
    ),
  );
  // The bar lives outside the <label>, so the control keeps its own name.
  expect(
    screen.getByRole("textbox", { name: "Description" }),
  ).toBeInTheDocument();
  expect(fetcher.mock.calls.at(-1)?.[0]).toBe("/api/admin/ai/assist");
});

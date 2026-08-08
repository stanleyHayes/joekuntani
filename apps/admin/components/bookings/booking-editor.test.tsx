import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { BookingEditor } from "./booking-editor";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

const conflict = {
  booking_id: "018f47f6-9f5d-4d3a-8d4e-45f0f7d4c204",
  id: "018f47f6-9f5d-4d3a-8d4e-45f0f7d4c204",
  title: "Other show",
  status: "confirmed",
  start_at: "2026-08-20T18:00:00Z",
  end_at: "2026-08-20T20:00:00Z",
};

/** Stub the calendar read the editor makes to learn the business timezone. */
function stubFetch(warnings: unknown[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_path: string, init?: RequestInit) => {
      if (init?.method === "POST")
        return Response.json({ booking: {}, warnings }, { status: 201 });
      return Response.json({ items: [], timezone: "Africa/Accra" });
    }),
  );
}

async function fillForm() {
  const form = (
    await screen.findByRole("button", { name: "Create booking" })
  ).closest("form")!;
  for (const [name, value] of Object.entries({
    title: "New show",
    enquiry_id: "018f47f6-9f5d-4d3a-8d4e-45f0f7d4c202",
    service_id: "018f47f6-9f5d-4d3a-8d4e-45f0f7d4c203",
    start_at: "2026-08-20T18:00",
    end_at: "2026-08-20T20:00",
    venue: "Venue",
    city: "Accra",
    country: "GH",
    fee: "10.00",
    currency: "GHS",
  })) {
    fireEvent.change(form.querySelector(`[name="${name}"]`)!, {
      target: { value },
    });
  }
  return form;
}

beforeEach(() => {
  vi.restoreAllMocks();
  push.mockReset();
  refresh.mockReset();
  Object.defineProperty(document, "cookie", {
    value: "jk_admin_csrf=csrf-token",
    configurable: true,
  });
});

it("creates in the configured timezone and surfaces confirmed conflicts", async () => {
  stubFetch([conflict]);
  render(<BookingEditor />);
  fireEvent.submit(await fillForm());
  expect(
    await screen.findByText("Booking saved with schedule warnings."),
  ).toBeInTheDocument();
  expect(screen.getByText(/confirmed/)).toBeInTheDocument();
  // A clash is only named in this response, so the editor holds its ground.
  expect(push).not.toHaveBeenCalled();
  const call = vi
    .mocked(fetch)
    .mock.calls.find(([, init]) => init?.method === "POST")!;
  expect(JSON.parse(String(call[1]?.body)).start_at).toBe(
    "2026-08-20T18:00:00.000Z",
  );
  expect(call[1]?.headers).toMatchObject({ "X-CSRF-Token": "csrf-token" });
});

it("returns to the diary when nothing clashes", async () => {
  stubFetch([]);
  render(<BookingEditor />);
  fireEvent.submit(await fillForm());
  await waitFor(() => expect(push).toHaveBeenCalledWith("/bookings"));
  expect(refresh).toHaveBeenCalled();
});

it("reports a rejected booking without leaving the form", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_path: string, init?: RequestInit) => {
      if (init?.method === "POST") return new Response("", { status: 422 });
      return Response.json({ items: [], timezone: "Africa/Accra" });
    }),
  );
  render(<BookingEditor />);
  fireEvent.submit(await fillForm());
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Booking could not be saved.",
  );
  expect(push).not.toHaveBeenCalled();
});

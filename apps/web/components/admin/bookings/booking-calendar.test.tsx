import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { BookingCalendar, calendarRange } from "./booking-calendar";

const booking = {
  id: "018f47f6-9f5d-4d3a-8d4e-45f0f7d4c201",
  enquiry_id: "018f47f6-9f5d-4d3a-8d4e-45f0f7d4c202",
  title: "Accra show",
  service_id: "018f47f6-9f5d-4d3a-8d4e-45f0f7d4c203",
  start_at: "2026-08-20T18:00:00Z",
  end_at: "2026-08-20T20:00:00Z",
  venue: "National Theatre",
  city: "Accra",
  country: "GH",
  status: "tentative",
  fee: "1000.00",
  currency: "GHS",
  requirements: { notes: "Sound check" },
  version: 1,
};
beforeEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(document, "cookie", {
    value: "jk_admin_csrf=csrf-token",
    configurable: true,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_path: string, init?: RequestInit) => {
      if (init?.method === "POST")
        return Response.json(
          {
            booking,
            warnings: [
              {
                booking_id: crypto.randomUUID(),
                title: "Other show",
                status: "confirmed",
                start_at: booking.start_at,
                end_at: booking.end_at,
              },
            ],
          },
          { status: 201 },
        );
      if (init?.method === "PATCH")
        return Response.json({
          booking: { ...booking, status: "confirmed", version: 2 },
          warnings: [],
        });
      return Response.json({ items: [booking], timezone: "Africa/Accra" });
    }),
  );
});
it("switches month week and list views and exposes private iCal", async () => {
  render(<BookingCalendar />);
  expect(await screen.findByText("Accra show")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /week/i }));
  expect(screen.getByRole("button", { name: /week/i })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  fireEvent.click(screen.getByRole("button", { name: /list/i }));
  expect(screen.getByRole("link", { name: "Export iCal" })).toHaveAttribute(
    "href",
    expect.stringContaining("calendar.ics"),
  );
});
it("creates in the configured timezone and surfaces confirmed conflicts", async () => {
  render(<BookingCalendar />);
  await screen.findByText("Accra show");
  expect(
    screen.queryByRole("dialog", { name: "Add booking" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Add booking" }));
  const dialog = screen.getByRole("dialog", { name: "Add booking" });
  const form = within(dialog)
    .getByRole("button", { name: "Create booking" })
    .closest("form")!;
  for (const [name, value] of Object.entries({
    title: "New show",
    enquiry_id: booking.enquiry_id,
    service_id: booking.service_id,
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
  fireEvent.submit(form);
  expect(
    await screen.findByText("Booking saved with schedule warnings."),
  ).toBeInTheDocument();
  expect(screen.getByText(/confirmed/)).toBeInTheDocument();
  await waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(
      "/api/admin/bookings",
      expect.objectContaining({ method: "POST" }),
    ),
  );
  const call = vi
    .mocked(fetch)
    .mock.calls.find(([, init]) => init?.method === "POST")!;
  expect(JSON.parse(String(call[1]?.body)).start_at).toBe(
    "2026-08-20T18:00:00.000Z",
  );
});
it("uses CSRF protected lifecycle actions", async () => {
  render(<BookingCalendar />);
  await screen.findByText("Accra show");
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  await waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(booking.id),
      expect.objectContaining({
        method: "PATCH",
        headers: expect.objectContaining({ "X-CSRF-Token": "csrf-token" }),
      }),
    ),
  );
});
it("uses exact business-timezone month and week boundaries", () => {
  const anchor = new Date("2026-08-20T12:00:00Z");
  expect(calendarRange(anchor, "month", "Pacific/Auckland")).toEqual({
    start: new Date("2026-07-31T12:00:00.000Z"),
    end: new Date("2026-08-31T12:00:00.000Z"),
  });
  expect(calendarRange(anchor, "week", "Pacific/Auckland")).toEqual({
    start: new Date("2026-08-15T12:00:00.000Z"),
    end: new Date("2026-08-22T12:00:00.000Z"),
  });
});

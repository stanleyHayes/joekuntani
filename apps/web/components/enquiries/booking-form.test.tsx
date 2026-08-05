import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { PublicService } from "../services/types";
import { BookingForm, DynamicQuestion } from "./booking-form";

const service: PublicService = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Approved strategy",
  slug: "approved-strategy",
  summary: "Approved summary",
  description: "",
  category: "Strategy",
  active: true,
  state: "active",
  version: 1,
  sort_order: 0,
  form_schema: {
    version: 1,
    questions: [
      {
        key: "goal",
        label: "Primary goal",
        type: "text",
        required: true,
      },
    ],
  },
  cta: { label: "Enquire", href: "/book" },
  created_at: "2026-08-05T00:00:00Z",
  updated_at: "2026-08-05T00:00:00Z",
};

beforeEach(() => {
  const values = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
});

afterEach(() => {
  window.localStorage.clear();
  delete (window as unknown as { turnstile?: unknown }).turnstile;
  vi.unstubAllGlobals();
});

it("completes the five accessible steps and clears the draft on success", async () => {
  vi.stubGlobal("crypto", { randomUUID: () => "idem-1234567890123456" });
  Object.defineProperty(window, "turnstile", {
    configurable: true,
    value: {
      render: (
        _node: HTMLElement,
        options: { callback: (token: string) => void },
      ) => options.callback("verified-token"),
    },
  });
  const fetcher = vi.fn().mockImplementation((url: string) =>
    Promise.resolve(
      url.includes("challenge")
        ? new Response(
            JSON.stringify({
              enabled: true,
              provider: "turnstile",
              site_key: "public-site-key",
            }),
            { status: 200 },
          )
        : new Response(JSON.stringify({ reference: "JK-2026-ABC234" }), {
            status: 201,
          }),
    ),
  );
  vi.stubGlobal("fetch", fetcher);
  render(<BookingForm initialSlug={service.slug} services={[service]} />);
  fireEvent.change(screen.getByLabelText("How did you hear about Joe?"), {
    target: { value: "search" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  fireEvent.change(screen.getByLabelText("Name"), {
    target: { value: "Ada Person" },
  });
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "ada@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Role"), {
    target: { value: "Director" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  for (const [label, value] of [
    ["Event type", "Comedy"],
    ["Event date and time", "2026-08-10T18:00"],
    ["Venue", "National Theatre"],
    ["City", "Accra"],
    ["Event country code", "GH"],
    ["Expected audience size", "500"],
    ["Performance duration", "60 minutes"],
  ])
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fireEvent.change(screen.getByLabelText("Primary goal"), {
    target: { value: "Launch safely" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  fireEvent.change(screen.getByLabelText("Budget range"), {
    target: { value: "GHS 1,000-2,000" },
  });
  fireEvent.change(screen.getByLabelText("Decision deadline"), {
    target: { value: "2026-08-09" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(await screen.findByText("Anti-spam verification")).toBeVisible();
  fireEvent.click(screen.getByLabelText(/I consent to the processing/));
  fireEvent.click(screen.getByRole("button", { name: "Submit enquiry" }));
  expect(await screen.findByText("JK-2026-ABC234")).toBeVisible();
  expect(
    screen.getByText(
      "Submission is not confirmation of availability or booking.",
    ),
  ).toBeVisible();
  expect(window.localStorage.getItem("jk-enquiry-draft-v1")).toBeNull();
  expect(fetcher).toHaveBeenCalledWith(
    "/api/public/enquiries",
    expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({
        "Idempotency-Key": "idem-1234567890123456",
      }),
    }),
  );
});

it("keeps a versioned draft and reports incomplete steps", async () => {
  render(<BookingForm initialSlug="" services={[service]} />);
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(
    screen.getByText("Complete the required fields before continuing."),
  ).toBeVisible();
  fireEvent.click(screen.getByLabelText(/Approved strategy/));
  await waitFor(() =>
    expect(window.localStorage.getItem("jk-enquiry-draft-v1")).toContain(
      '"version":1',
    ),
  );
});

it("submits the exact brand and commercial fields with optional marketing consent", async () => {
  vi.stubGlobal("crypto", { randomUUID: () => "idem-brand-1234567890" });
  const fetcher = vi.fn().mockImplementation((url: string) =>
    Promise.resolve(
      url.includes("challenge")
        ? new Response(
            JSON.stringify({ enabled: false, provider: "", site_key: "" }),
            { status: 200 },
          )
        : new Response(JSON.stringify({ reference: "JK-2026-BRAND1" }), {
            status: 201,
          }),
    ),
  );
  vi.stubGlobal("fetch", fetcher);
  render(<BookingForm initialSlug={service.slug} services={[service]} />);
  await waitFor(() =>
    expect(fetcher).toHaveBeenCalledWith(
      "/api/public/enquiries/challenge",
      expect.objectContaining({ cache: "no-store" }),
    ),
  );
  fireEvent.change(screen.getByLabelText("Enquiry type"), {
    target: { value: "brand" },
  });
  fireEvent.change(screen.getByLabelText("How did you hear about Joe?"), {
    target: { value: "referral" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  for (const [label, value] of [
    ["Name", "Brand Person"],
    ["Email", "brand@example.com"],
    ["Role", "Marketing lead"],
  ])
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  for (const [label, value] of [
    ["Campaign objective", "Awareness"],
    ["Target audience", "Adults"],
    ["Channels (comma separated)", "Web, Live"],
    ["Requested deliverables", "Two videos"],
    ["Usage rights", "Digital"],
    ["Exclusivity", "None"],
    ["Launch dates", "October 2026"],
    ["Primary goal", "Launch safely"],
  ])
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  fireEvent.change(screen.getByLabelText("Budget range"), {
    target: { value: "GHS 10,000" },
  });
  fireEvent.change(screen.getByLabelText("Decision deadline"), {
    target: { value: "2026-08-20" },
  });
  fireEvent.change(screen.getByLabelText("Additional notes"), {
    target: { value: "Please respond by email." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  fireEvent.click(screen.getByLabelText(/I consent to the processing/));
  fireEvent.click(screen.getByLabelText(/occasional marketing/));
  fireEvent.click(screen.getByRole("button", { name: "Submit enquiry" }));
  expect(await screen.findByText("JK-2026-BRAND1")).toBeVisible();
  const call = fetcher.mock.calls.find(
    ([url]) => url === "/api/public/enquiries",
  );
  const payload = JSON.parse(String(call?.[1]?.body));
  expect(payload).toMatchObject({
    enquiry_type: "brand",
    source: "referral",
    currency: "GHS",
    marketing_consent: true,
    details: { channels: ["Web", "Live"], campaign_objective: "Awareness" },
  });
});

it("fails safely when no approved services exist", () => {
  render(<BookingForm initialSlug="" services={[]} />);
  expect(
    screen.getByText(
      "No approved services are available yet. Please return soon.",
    ),
  ).toBeVisible();
});

it("renders and updates every dynamic control family", () => {
  const onChange = vi.fn();
  const { rerender } = render(
    <DynamicQuestion
      onChange={onChange}
      question={{
        key: "channel",
        label: "Channel",
        type: "select",
        required: true,
        options: ["Web", "Live"],
      }}
      value=""
    />,
  );
  fireEvent.change(screen.getByLabelText("Channel"), {
    target: { value: "Web" },
  });
  expect(onChange).toHaveBeenLastCalledWith("Web");
  rerender(
    <DynamicQuestion
      onChange={onChange}
      question={{
        key: "channels",
        label: "Channels",
        type: "multi_select",
        required: true,
        options: ["Web", "Live"],
      }}
      value={["Web"]}
    />,
  );
  fireEvent.click(screen.getByLabelText("Live"));
  expect(onChange).toHaveBeenLastCalledWith(["Web", "Live"]);
  fireEvent.click(screen.getByLabelText("Web"));
  expect(onChange).toHaveBeenLastCalledWith([]);
  rerender(
    <DynamicQuestion
      onChange={onChange}
      question={{
        key: "approved",
        label: "Approved",
        type: "checkbox",
        required: false,
      }}
      value={false}
    />,
  );
  fireEvent.click(screen.getByLabelText("Approved"));
  expect(onChange).toHaveBeenLastCalledWith(true);
  rerender(
    <DynamicQuestion
      onChange={onChange}
      question={{
        key: "context",
        label: "Context",
        type: "textarea",
        required: true,
      }}
      value=""
    />,
  );
  fireEvent.change(screen.getByLabelText("Context"), {
    target: { value: "Detail" },
  });
  expect(onChange).toHaveBeenLastCalledWith("Detail");
  rerender(
    <DynamicQuestion
      onChange={onChange}
      question={{
        key: "quantity",
        label: "Quantity",
        type: "number",
        required: true,
      }}
      value=""
    />,
  );
  fireEvent.change(screen.getByLabelText("Quantity"), {
    target: { value: "4" },
  });
  expect(onChange).toHaveBeenLastCalledWith(4);
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { PublicSettings } from "../../lib/settings";
import type { PublicService } from "../services/types";
import { ContactForm } from "./contact-form";

const settings: PublicSettings = {
  navigation: [],
  footer: [],
  ctas: [],
  contact: { public_email: "approved@example.test", phone: "", location: "" },
  social: [],
  brand: {
    name: "Joe Kuntani",
    tagline: "",
    logo_asset_id: "",
    favicon_asset_id: "",
  },
  seo: {
    title_template: "",
    default_title: "",
    description: "",
    canonical_base: "",
    social_image_asset_id: "",
  },
  consent: {
    version: "approved-v1",
    privacy_label: "Approved privacy consent",
    marketing_label: "",
    privacy_url: "/privacy",
  },
};
const service: PublicService = {
  id: crypto.randomUUID(),
  name: "Approved service",
  slug: "approved",
  summary: "",
  description: "",
  category: "",
  active: true,
  state: "active",
  version: 1,
  sort_order: 1,
  form_schema: { version: 1, questions: [] },
  cta: { label: "Enquire", href: "/book" },
  created_at: "2026-08-05T00:00:00Z",
  updated_at: "2026-08-05T00:00:00Z",
};
afterEach(() => vi.unstubAllGlobals());

it("fails closed without approved routing and consent", () => {
  render(<ContactForm services={[]} settings={null} />);
  // Still fails closed — no form is rendered — but the visitor is now given an
  // explanation and a route onward instead of a bare notice.
  expect(screen.queryByRole("form")).toBeNull();
  expect(
    screen.getByRole("heading", { name: "The enquiry form isn't open yet" }),
  ).toBeVisible();
  expect(screen.getByRole("link", { name: /what's offered/i })).toHaveAttribute(
    "href",
    "/services",
  );
});

it("submits approved routing, versioned consent, idempotency and spam hooks", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ reference: "JK-TEST" }), { status: 201 }),
    );
  vi.stubGlobal("fetch", fetcher);
  render(<ContactForm services={[service]} settings={settings} />);
  fireEvent.change(screen.getByLabelText("Name"), {
    target: { value: "Test Person" },
  });
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "test@example.test" },
  });
  fireEvent.change(screen.getByLabelText("Message"), {
    target: { value: "A sufficiently detailed approved-routing enquiry." },
  });
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Send enquiry" }));
  expect(await screen.findByRole("status")).toHaveTextContent("JK-TEST");
  await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
  const [, init] = fetcher.mock.calls[0] as [string, RequestInit];
  expect(init.headers).toEqual(
    expect.objectContaining({ "Idempotency-Key": expect.any(String) }),
  );
  expect(JSON.parse(String(init.body))).toEqual(
    expect.objectContaining({
      service_id: service.id,
      consent_text: settings.consent.privacy_label,
      consent_version: settings.consent.version,
      website: "",
      captcha_token: "",
    }),
  );
});

function fill() {
  fireEvent.change(screen.getByLabelText("Name"), {
    target: { value: "  Test Person  " },
  });
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: " test@example.test " },
  });
  fireEvent.change(screen.getByLabelText("Message"), {
    target: { value: "A sufficiently detailed approved-routing enquiry." },
  });
  fireEvent.click(screen.getByRole("checkbox"));
}

it("blocks an incomplete submission client-side instead of bouncing it off the server", () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  render(<ContactForm services={[service]} settings={settings} />);

  fireEvent.click(screen.getByRole("button", { name: "Send enquiry" }));

  // The form used to carry `noValidate` with no client checks, so an empty
  // submit reached the API and came back as one generic failure.
  expect(fetcher).not.toHaveBeenCalled();
  expect(screen.getByText("Tell us who the enquiry is from.")).toBeVisible();
  expect(
    screen.getByText("Enter an email address we can reply to."),
  ).toBeVisible();
  expect(screen.getByLabelText("Name")).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByLabelText("Name")).toHaveFocus();
});

it("clears a field error as soon as that field is edited", () => {
  vi.stubGlobal("fetch", vi.fn());
  render(<ContactForm services={[service]} settings={settings} />);
  fireEvent.click(screen.getByRole("button", { name: "Send enquiry" }));
  expect(screen.getByText("Tell us who the enquiry is from.")).toBeVisible();

  fireEvent.change(screen.getByLabelText("Name"), {
    target: { value: "Test Person" },
  });
  expect(screen.queryByText("Tell us who the enquiry is from.")).toBeNull();
});

it("rejects consent-less submissions without contacting the server", () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  render(<ContactForm services={[service]} settings={settings} />);
  fill();
  fireEvent.click(screen.getByRole("checkbox")); // untick it again

  fireEvent.click(screen.getByRole("button", { name: "Send enquiry" }));
  expect(fetcher).not.toHaveBeenCalled();
  expect(
    screen.getByText("Accept the approved privacy consent before submitting."),
  ).toBeVisible();
});

it("reuses one idempotency key across a retry so a failed send cannot duplicate", async () => {
  const fetcher = vi
    .fn()
    .mockRejectedValueOnce(new Error("network"))
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ reference: "JK-RETRY" }), { status: 201 }),
    );
  vi.stubGlobal("fetch", fetcher);
  render(<ContactForm services={[service]} settings={settings} />);
  fill();

  fireEvent.click(screen.getByRole("button", { name: "Send enquiry" }));
  expect(await screen.findByRole("alert")).toBeVisible();

  fireEvent.click(screen.getByRole("button", { name: "Send enquiry" }));
  expect(await screen.findByRole("status")).toHaveTextContent("JK-RETRY");

  const keyOf = (call: number) =>
    (
      fetcher.mock.calls[call]![1] as RequestInit & {
        headers: Record<string, string>;
      }
    ).headers["Idempotency-Key"];
  expect(keyOf(0)).toBe(keyOf(1));
});

it("trims contact details and sends the optional phone number", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ reference: "JK-TRIM" }), { status: 201 }),
    );
  vi.stubGlobal("fetch", fetcher);
  render(<ContactForm services={[service]} settings={settings} />);
  fill();
  fireEvent.change(screen.getByLabelText(/Phone/), {
    target: { value: "+233 20 000 0000" },
  });

  fireEvent.click(screen.getByRole("button", { name: "Send enquiry" }));
  await screen.findByRole("status");

  expect(JSON.parse(String(fetcher.mock.calls[0]![1].body)).contact).toEqual({
    name: "Test Person",
    email: "test@example.test",
    phone: "+233 20 000 0000",
    organization: "",
  });
});

it("explains a rate limit rather than blaming the visitor's details", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("{}", { status: 429 })),
  );
  render(<ContactForm services={[service]} settings={settings} />);
  fill();

  fireEvent.click(screen.getByRole("button", { name: "Send enquiry" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    /too many enquiries/i,
  );
});

it("confirms with a reference and can return to a blank form", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ reference: "JK-DONE" }), { status: 201 }),
      ),
  );
  render(<ContactForm services={[service]} settings={settings} />);
  fill();
  fireEvent.click(screen.getByRole("button", { name: "Send enquiry" }));

  const status = await screen.findByRole("status");
  expect(status).toHaveTextContent("JK-DONE");
  // The address is quoted back, so it must survive the draft being cleared.
  expect(status).toHaveTextContent("test@example.test");

  fireEvent.click(screen.getByRole("button", { name: "Send another enquiry" }));
  expect(screen.getByLabelText("Name")).toHaveValue("");
});

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
  expect(screen.getByRole("status")).toHaveTextContent("not available yet");
  expect(screen.queryByRole("form")).toBeNull();
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

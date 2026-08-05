import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SettingsForm } from "./settings-form";

const draft = {
  navigation: [{ label: "Home", href: "/" }],
  footer: [],
  ctas: [],
  contact: { public_email: "", phone: "", location: "" },
  social: [],
  brand: {
    name: "Joe Kuntani",
    tagline: "",
    logo_asset_id: "",
    favicon_asset_id: "",
  },
  seo: {
    title_template: "",
    default_title: "Joe Kuntani",
    description: "",
    canonical_base: "",
    social_image_asset_id: "",
  },
  consent: {
    version: "draft-v1",
    privacy_label: "Approved privacy copy",
    marketing_label: "",
    privacy_url: "/privacy",
  },
  integrations: {
    email_provider: "resend",
    media_provider: "cloudinary",
    analytics_provider: "posthog",
    payment_provider: "",
  },
  team: { notification_recipients: [], business_timezone: "Africa/Accra" },
};
const admin = {
  key: "global",
  version: 1,
  draft,
  content_complete: false,
  updated_by: "actor",
  updated_at: "2026-08-05T00:00:00Z",
  can_manage: true,
  secret_status: {
    email_configured: true,
    media_configured: false,
    analytics_configured: false,
    payment_configured: false,
  },
};

afterEach(() => vi.unstubAllGlobals());
it("edits, saves and publishes without rendering secret values", async () => {
  Object.defineProperty(document, "cookie", {
    configurable: true,
    value: "jk_admin_csrf=test-csrf",
  });
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(admin), { status: 200 }))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ...admin, version: 2, content_complete: true }),
        { status: 200 },
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ...admin, version: 3, content_complete: true }),
        { status: 200 },
      ),
    );
  vi.stubGlobal("fetch", fetch);
  render(<SettingsForm />);
  expect(await screen.findByLabelText("Public brand name")).toHaveValue(
    "Joe Kuntani",
  );
  expect(screen.getByText(/secrets are environment-managed/i)).toBeVisible();
  expect(screen.queryByText(/api[_-]?key/i)).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Approved tagline"), {
    target: { value: "Approved tagline" },
  });
  for (const label of [
    "Public brand name",
    "Logo asset UUID",
    "Favicon asset UUID",
    "Default page title",
    "Title template",
    "SEO description",
    "Canonical HTTPS base",
    "Default social image asset UUID",
    "Public email",
    "Public phone",
    "Location label",
    "Consent version",
    "Privacy consent label",
    "Optional marketing label",
    "Privacy notice path",
    "Email provider",
    "Media provider",
    "Analytics provider",
    "Payment provider",
    "Business timezone",
  ]) {
    const input = screen.getByLabelText(label);
    fireEvent.change(input, {
      target: { value: `${(input as HTMLInputElement).value}x` },
    });
  }
  for (const label of [
    "Primary navigation",
    "Footer links",
    "Calls to action",
    "Approved social links",
    "Internal notification recipients",
  ]) {
    const textarea = screen.getByRole("textbox", {
      name: new RegExp(`^${label}`),
    });
    const value = (textarea as HTMLTextAreaElement).value;
    fireEvent.change(textarea, { target: { value: "{" } });
    expect(textarea).toHaveAttribute("aria-invalid", "true");
    fireEvent.change(textarea, { target: { value } });
  }
  fireEvent.click(screen.getByLabelText(/I confirm all public settings/i));
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await screen.findByText("Draft settings saved and audited.");
  fireEvent.click(
    screen.getByRole("button", { name: "Publish approved settings" }),
  );
  await screen.findByText("Approved settings published.");
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
  expect(fetch.mock.calls[1]?.[1]).toEqual(
    expect.objectContaining({
      method: "PUT",
      headers: expect.objectContaining({ "X-CSRF-Token": "test-csrf" }),
    }),
  );
});

it("shows a safe error when settings cannot load", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  render(<SettingsForm />);
  expect(
    await screen.findByText("Settings could not be loaded. Try again."),
  ).toBeVisible();
});

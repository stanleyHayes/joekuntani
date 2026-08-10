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
    /^Public brand name/,
    /^Fallback page title/,
    /^Browser tab title pattern/,
    /^Search result description/,
    /^Website address/,
    /^Public email/,
    /^Public phone/,
    /^Location shown publicly/,
    /^Consent version/,
    /^Privacy consent label/,
    /^Optional marketing label/,
    /^Privacy page address/,
    /^Email provider/,
    /^Media provider/,
    /^Analytics provider/,
    /^Payment provider/,
    /^Business timezone/,
  ]) {
    const input = screen.getByLabelText(label);
    fireEvent.change(input, {
      target: { value: `${(input as HTMLInputElement).value}x` },
    });
  }
  // Images are chosen from the device, never by typing an asset id: there is a
  // file picker and no text box to paste a media-library UUID into.
  for (const image of [
    "Logo image",
    "Browser tab icon",
    "Default sharing image",
  ]) {
    expect(screen.getByText(image)).toBeVisible();
    expect(screen.queryByRole("textbox", { name: image })).toBeNull();
    expect(screen.getByLabelText(`Choose ${image}`)).toHaveAttribute(
      "type",
      "file",
    );
  }
  // Structured lists are edited as rows, never as raw JSON.
  expect(
    screen.queryByRole("textbox", { name: /^Primary navigation/ }),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Add footer link" }));
  const footerText = screen.getAllByLabelText(/^Link text/)[0];
  fireEvent.change(footerText, { target: { value: "Privacy" } });
  expect(footerText).toHaveValue("Privacy");
  fireEvent.click(
    screen.getByRole("button", { name: "Remove Footer links entry 1" }),
  );
  expect(screen.queryByLabelText(/^Link text/)).toBeNull();
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
}, 40_000);

it("shows a safe error when settings cannot load", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  render(<SettingsForm />);
  expect(
    await screen.findByText("Settings could not be loaded. Try again."),
  ).toBeVisible();
});

/** Loads settings, then answers the next call with `status`. */
function stubSettings(status: number, loaded: Record<string, unknown> = admin) {
  Object.defineProperty(document, "cookie", {
    configurable: true,
    value: "jk_admin_csrf=test-csrf",
  });
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify(loaded), { status: 200 }),
    )
    .mockResolvedValueOnce(new Response(JSON.stringify(admin), { status }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

/** Publishing is only offered once the settings are marked complete. */
const complete = { ...admin, content_complete: true };

// Settings are the public face of the site. A save that quietly fails while
// the screen says it succeeded is how a wrong phone number goes live.
it.each([
  [409, "Another editor saved changes. Reload before trying again."],
  [422, "The settings were not accepted. Review every field."],
])(
  "reports a %s from saving instead of claiming success",
  async (status, message) => {
    stubSettings(status);
    render(<SettingsForm />);
    await screen.findByLabelText("Public brand name");
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    expect(await screen.findByText(message)).toBeVisible();
    expect(screen.queryByText("Draft settings saved and audited.")).toBeNull();
  },
);

it.each([
  [409, "The draft changed. Reload before publishing."],
  [422, "Publishing is blocked until content is complete and valid."],
])("reports a %s from publishing", async (status, message) => {
  stubSettings(status, complete);
  render(<SettingsForm />);
  await screen.findByLabelText("Public brand name");
  fireEvent.click(
    screen.getByRole("button", { name: "Publish approved settings" }),
  );

  expect(await screen.findByText(message)).toBeVisible();
  expect(screen.queryByText("Approved settings published.")).toBeNull();
});

it("says so when the network drops mid-save", async () => {
  Object.defineProperty(document, "cookie", {
    configurable: true,
    value: "jk_admin_csrf=test-csrf",
  });
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(admin), { status: 200 }),
      )
      .mockRejectedValueOnce(new Error("offline")),
  );
  render(<SettingsForm />);
  await screen.findByLabelText("Public brand name");
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  expect(await screen.findByText("Settings could not be saved.")).toBeVisible();
});

// An editor without the manage permission can read the settings but must not
// be offered a publish button that would fail server-side anyway.
it("withholds publishing from someone who cannot manage settings", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ...admin, can_manage: false }), {
        status: 200,
      }),
    ),
  );
  render(<SettingsForm />);
  await screen.findByLabelText("Public brand name");
  expect(
    screen.queryByRole("button", { name: "Publish approved settings" }),
  ).toBeNull();
});

// Publishing before the settings are confirmed complete would fail on the
// server; the button says so by being unavailable rather than by erroring.
it("keeps publishing unavailable until the settings are marked complete", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(admin), { status: 200 })),
  );
  render(<SettingsForm />);
  await screen.findByLabelText("Public brand name");
  expect(
    screen.getByRole("button", { name: "Publish approved settings" }),
  ).toBeDisabled();
});

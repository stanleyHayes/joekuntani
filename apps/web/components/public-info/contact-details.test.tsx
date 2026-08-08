import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import type { PublicSettings } from "../../lib/settings";
import { ContactDetails } from "./contact-details";

const published = (
  contact: Partial<PublicSettings["contact"]> = {},
  social: PublicSettings["social"] = [],
): PublicSettings => ({
  navigation: [],
  footer: [],
  ctas: [],
  contact: {
    public_email: "approved@example.test",
    phone: "+233 (0) 24-000 0000",
    location: "Accra, Ghana",
    ...contact,
  },
  social,
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
    privacy_label: "",
    marketing_label: "",
    privacy_url: "/privacy",
  },
});

const panel = () =>
  screen.getByRole("complementary", { name: "Reach out directly" });

const blank = { public_email: "  ", phone: "", location: "\t" };

it("publishes every direct route a visitor can act on", () => {
  render(
    <ContactDetails
      settings={published({}, [
        { platform: "Instagram", url: "https://instagram.test/joe" },
        { platform: "YouTube", url: "https://youtube.test/joe" },
      ])}
    />,
  );

  expect(
    screen.getByRole("link", { name: "approved@example.test" }),
  ).toHaveAttribute("href", "mailto:approved@example.test");
  expect(
    screen.getByRole("link", { name: "+233 (0) 24-000 0000" }),
  ).toHaveAttribute("href", "tel:+2330240000000");
  expect(screen.getByText("Accra, Ghana")).toBeVisible();

  expect(screen.getByText("Elsewhere")).toBeVisible();
  expect(screen.getByRole("link", { name: "Instagram" })).toHaveAttribute(
    "href",
    "https://instagram.test/joe",
  );
  expect(screen.getByRole("link", { name: "YouTube" })).toHaveAttribute(
    "href",
    "https://youtube.test/joe",
  );

  // The panel exists precisely because the enquiry form can be unavailable, so
  // it has to keep saying these routes are slower than the tracked form.
  expect(
    screen.getByText(
      /Direct messages\s+are read but may take longer to answer/,
    ),
  ).toBeVisible();
});

// A published number is written for humans — spaces, brackets, dashes. Handing
// that straight to `tel:` gives a link a phone dialler will not act on, so the
// separators must be stripped while the leading country code survives.
it.each([
  ["+233 (0) 24-000 0000", "tel:+2330240000000"],
  ["024 000 0000", "tel:0240000000"],
  ["+233.24.000.0000", "tel:+233240000000"],
])("dials %s as %s", (phone, href) => {
  render(<ContactDetails settings={published({ phone })} />);

  expect(screen.getByRole("link", { name: phone })).toHaveAttribute(
    "href",
    href,
  );
});

it("renders nothing at all when no settings have been published", () => {
  const { container } = render(<ContactDetails settings={null} />);

  expect(container).toBeEmptyDOMElement();
  expect(screen.queryByRole("complementary")).toBeNull();
});

// An empty aside would still print the heading and the trailing note, telling a
// visitor to "reach out directly" with no way to do it.
it("renders nothing rather than an empty panel when every field is blank", () => {
  const { container } = render(
    <ContactDetails settings={published(blank, [])} />,
  );

  expect(container).toBeEmptyDOMElement();
  expect(screen.queryByText("Reach out directly")).toBeNull();
});

// Whitespace is not a published address. Without the trim these render as
// `mailto:` and `tel:` with nothing after the colon — links that look live and
// do nothing when tapped.
it("drops whitespace-only fields instead of linking an empty address", () => {
  render(
    <ContactDetails
      settings={published({ public_email: "   ", phone: "  " })}
    />,
  );

  expect(within(panel()).queryByRole("link")).toBeNull();
  expect(screen.queryByText("Email")).toBeNull();
  expect(screen.queryByText("Phone")).toBeNull();
  expect(screen.getByText("Based in")).toBeVisible();
  expect(screen.getByText("Accra, Ghana")).toBeVisible();
});

it("trims a padded email before putting it in the mailto link", () => {
  render(
    <ContactDetails
      settings={published({
        public_email: "  approved@example.test  ",
        phone: "",
        location: "",
      })}
    />,
  );

  // A stray space survives into the href otherwise, and mail clients treat
  // "mailto:  approved@example.test" as a malformed address.
  expect(
    screen.getByRole("link", { name: "approved@example.test" }),
  ).toHaveAttribute("href", "mailto:approved@example.test");
  expect(screen.queryByText("Phone")).toBeNull();
  expect(screen.queryByText("Based in")).toBeNull();
});

// Social profiles alone are enough of a reason to show the panel — the early
// return must count them, not just the three contact fields.
it("keeps the panel when the only published route is a social profile", () => {
  render(
    <ContactDetails
      settings={published(blank, [
        { platform: "Instagram", url: "https://instagram.test/joe" },
      ])}
    />,
  );

  expect(panel()).toBeVisible();
  expect(screen.getByText("Elsewhere")).toBeVisible();
  expect(screen.getByRole("link", { name: "Instagram" })).toHaveAttribute(
    "href",
    "https://instagram.test/joe",
  );
  expect(screen.queryByText("Email")).toBeNull();
  expect(screen.queryByText("Phone")).toBeNull();
  expect(screen.queryByText("Based in")).toBeNull();
});

// A half-filled row from the settings admin would otherwise ship either a link
// with no href (which reloads the contact page) or a link with no accessible
// name at all.
it("ignores a social row missing its platform name or its url", () => {
  render(
    <ContactDetails
      settings={published(blank, [
        { platform: "Instagram", url: "   " },
        { platform: "  ", url: "https://tiktok.test/joe" },
        { platform: "YouTube", url: "https://youtube.test/joe" },
      ])}
    />,
  );

  const rows = within(panel()).getAllByRole("listitem");
  expect(rows).toHaveLength(1);
  expect(
    within(rows[0]).getByRole("link", { name: "YouTube" }),
  ).toHaveAttribute("href", "https://youtube.test/joe");
  expect(screen.queryByRole("link", { name: "Instagram" })).toBeNull();
});

it("hides the Elsewhere block when every social row is unusable", () => {
  render(
    <ContactDetails
      settings={published({ phone: "", location: "" }, [
        { platform: "Instagram", url: "" },
      ])}
    />,
  );

  expect(screen.queryByText("Elsewhere")).toBeNull();
  expect(within(panel()).queryByRole("list")).toBeNull();
  // The email still has to survive the social rows being thrown away.
  expect(
    screen.getByRole("link", { name: "approved@example.test" }),
  ).toBeVisible();
});

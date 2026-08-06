import { render, screen, within } from "@testing-library/react";

import { AdminShell } from "./admin-shell";
import { PublicShell } from "./public-shell";

describe("PublicShell", () => {
  it("provides labelled navigation, current page, skip link and one contextual footer CTA", () => {
    render(
      <PublicShell
        currentPath="/work"
        footerCta={{
          description: "Provide the details the team needs.",
          href: "/book",
          label: "Make an enquiry",
          title: "Planning a booking?",
        }}
      >
        <main id="main-content">
          <h1>Work</h1>
        </main>
      </PublicShell>,
    );

    expect(
      screen.getByRole("link", { name: "Skip to content" }),
    ).toHaveAttribute("href", "#main-content");
    const primary = screen.getByRole("navigation", {
      name: "Primary navigation",
    });
    expect(within(primary).getByRole("link", { name: "Work" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("navigation", { name: "Footer navigation" }),
    ).toBeVisible();
    expect(
      screen.getAllByRole("link", { name: "Make an enquiry" }),
    ).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Open menu" }),
    ).toBeInTheDocument();
  });

  it("keeps decorative visual rhythm out of the accessibility tree", () => {
    const { container } = render(
      <PublicShell
        footerCta={{
          description: "Provide the details the team needs.",
          href: "/book",
          label: "Make an enquiry",
          title: "Planning a booking?",
        }}
      >
        <main id="main-content">
          <span className="hero__rhythm" aria-hidden="true" />
        </main>
      </PublicShell>,
    );

    expect(container.querySelector(".hero__rhythm")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("renders only explicitly supplied published shell settings", () => {
    render(
      <PublicShell
        settings={{
          navigation: [{ href: "/approved", label: "Approved" }],
          footer: [{ href: "/privacy", label: "Approved privacy" }],
          ctas: [
            {
              key: "header",
              href: "/approved-contact",
              label: "Approved CTA",
              title: "",
              description: "",
            },
          ],
          contact: { public_email: "", phone: "", location: "" },
          social: [],
          brand: {
            name: "Approved name",
            tagline: "Approved tagline",
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
            version: "v1",
            privacy_label: "Approved consent",
            marketing_label: "",
            privacy_url: "/privacy",
          },
        }}
        footerCta={{
          description: "Fallback",
          href: "/book",
          label: "Fallback CTA",
          title: "Fallback",
        }}
      >
        <main id="main-content" />
      </PublicShell>,
    );
    expect(screen.getAllByRole("link", { name: "Approved" })).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: "Approved CTA" })).toHaveLength(
      1,
    );
    expect(
      screen.queryByRole("link", { name: "Make an enquiry" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Approved tagline")).toBeVisible();
  });
});

describe("AdminShell", () => {
  it("always exposes the content warning and accessible workspace landmarks", () => {
    render(
      <AdminShell
        currentPath="/admin/content"
        missingContentCount={4}
        navigation={[{ href: "/admin/content", label: "Content" }]}
        title="Content workspace"
      >
        <p>Workspace content</p>
      </AdminShell>,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Content incomplete");
    expect(screen.getByRole("status")).toHaveTextContent("4 items remain");
    expect(
      screen.getByRole("navigation", { name: "Administration" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Services" })).toHaveAttribute(
      "href",
      "/admin/services",
    );
    expect(
      screen.getByRole("heading", { name: "Content workspace" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Skip to workspace" }),
    ).toHaveAttribute("href", "#admin-main-content");
  });

  it("keeps the blocking warning explicit when an item count is unavailable", () => {
    render(
      <AdminShell navigation={[]} title="Overview">
        <p>No content yet</p>
      </AdminShell>,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Production publishing is blocked",
    );
    expect(screen.getByRole("status")).not.toHaveTextContent("items remain");
  });

  it("preserves an already complete operations navigation without duplicates", () => {
    const navigation = [
      { href: "/admin/services", label: "Services" },
      { href: "/admin/events", label: "Events" },
      { href: "/admin/crm", label: "CRM" },
      { href: "/admin/bookings", label: "Bookings" },
      { href: "/admin/campaigns", label: "Campaigns" },
    ];
    render(
      <AdminShell
        currentPath="/admin/campaigns"
        navigation={navigation}
        title="Campaigns"
      >
        <p>Campaign workspace</p>
      </AdminShell>,
    );

    for (const item of navigation) {
      expect(screen.getAllByRole("link", { name: item.label })).toHaveLength(1);
    }
    expect(screen.getByRole("link", { name: "Campaigns" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});

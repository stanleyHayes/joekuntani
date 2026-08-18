import {
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";

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
    ).toHaveLength(1);
    expect(within(primary).getByRole("link", { name: "Book" })).toHaveAttribute(
      "href",
      "/book",
    );
    expect(within(primary).getByRole("link", { name: "Shop" })).toHaveAttribute(
      "href",
      "/shop",
    );
    expect(screen.getByRole("button", { name: "Support" })).toBeVisible();
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

  it("renders published shell settings while keeping the storefront discoverable", () => {
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
    expect(
      screen.getAllByRole("link", { name: "Shop" }).length,
    ).toBeGreaterThan(0);
    expect(
      within(
        screen.getByRole("navigation", { name: "Primary navigation" }),
      ).getByRole("link", { name: "Book" }),
    ).toHaveAttribute("href", "/approved-contact");
    expect(
      screen.queryByRole("link", { name: "Make an enquiry" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Approved tagline")).toBeVisible();
  });
});

it("keeps Gallery in the Media dropdown and mobile menu when old settings omit it", () => {
  render(
    <PublicShell
      settings={{
        navigation: [
          { href: "/media/videos", label: "Videos" },
          { href: "/media/press", label: "Press" },
        ],
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
          default_title: "",
          description: "",
          canonical_base: "",
          social_image_asset_id: "",
        },
        consent: {
          version: "v1",
          privacy_label: "",
          marketing_label: "",
          privacy_url: "/privacy",
        },
      }}
      footerCta={{
        description: "Provide the details the team needs.",
        href: "/book",
        label: "Make an enquiry",
        title: "Planning a booking?",
      }}
    >
      <main id="main-content" />
    </PublicShell>,
  );

  fireEvent.click(screen.getByRole("button", { name: /Media/ }));
  const dropdown = screen.getByRole("list", { name: "Media" });
  expect(
    within(dropdown).getByRole("link", { name: "Gallery" }),
  ).toHaveAttribute("href", "/media/gallery");

  fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
  const drawer = screen.getByRole("dialog", { name: "Menu" });
  expect(
    within(drawer).getByRole("link", { name: "Gallery" }),
  ).toHaveAttribute("href", "/media/gallery");
});

// The Media dropdown showed two bare titles. Each item now carries its title,
// a line saying what is behind it, and an icon — and the panel a watermark.
// The icon and watermark are decoration, so they must stay out of the
// accessible name rather than be read out as extra content.
it("gives every Media dropdown item a title, description and icon", () => {
  render(
    <PublicShell
      currentPath="/"
      footerCta={{
        description: "Provide the details the team needs.",
        href: "/book",
        label: "Make an enquiry",
        title: "Planning a booking?",
      }}
    >
      <main id="main-content" />
    </PublicShell>,
  );
  fireEvent.click(screen.getByRole("button", { name: /Media/ }));

  const menu = screen.getByRole("list", { name: "Media" });
  const videos = within(menu).getByRole("link", { name: "Videos" });
  expect(videos).toHaveAttribute("href", "/media/videos");
  expect(videos).toHaveTextContent("Reels, live clips and interview cuts.");

  const press = within(menu).getByRole("link", { name: "Press" });
  expect(press).toHaveAttribute("href", "/media/press");
  expect(press).toHaveTextContent("Interviews, features and coverage.");

  const gallery = within(menu).getByRole("link", { name: "Gallery" });
  expect(gallery).toHaveAttribute("href", "/media/gallery");
  expect(gallery).toHaveTextContent("Photography from shows and shoots.");

  // Decoration must not leak into what a screen reader announces.
  expect(videos).toHaveAccessibleName("Videos");
  expect(menu.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(
    0,
  );
});

it("opens the Media dropdown when its hanging microphone is pulled", () => {
  render(
    <PublicShell
      currentPath="/"
      footerCta={{
        description: "Provide the details the team needs.",
        href: "/book",
        label: "Make an enquiry",
        title: "Planning a booking?",
      }}
    >
      <main id="main-content" />
    </PublicShell>,
  );
  const trigger = screen.getByRole("button", { name: /Media/ });
  const microphone = trigger.querySelector("svg")?.parentElement?.parentElement;
  expect(microphone).toBeInstanceOf(HTMLElement);
  Object.defineProperty(microphone, "setPointerCapture", { value: () => {} });

  fireEvent.pointerDown(microphone!, { pointerId: 1, clientY: 10 });
  fireEvent.pointerMove(microphone!, { pointerId: 1, clientY: 30 });
  fireEvent.pointerUp(microphone!, { pointerId: 1, clientY: 30 });

  expect(trigger).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("list", { name: "Media" })).toBeVisible();
});

import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import * as data from "../../components/services/data";
import type { PublicService } from "../../components/services/types";
import ServicesPage from "./page";

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.NEXT_PUBLIC_DEMO_CONTENT;
});

it("shows a content-safe empty state without invented service claims", async () => {
  vi.spyOn(data, "getPublicServices").mockResolvedValue([]);
  render(await ServicesPage());
  expect(
    screen.getByRole("heading", {
      name: "Services are still being cleared",
    }),
  ).toBeVisible();
  expect(
    screen.getByRole("link", { name: "Make a general enquiry" }),
  ).toHaveAttribute("href", "/book");
  expect(screen.queryByText(/brand campaign|comedy performance/i)).toBeNull();
});

it("renders approved services with contextual booking CTAs", async () => {
  const item: PublicService = {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Approved service",
    slug: "approved-service",
    summary: "Approved summary",
    description: "Approved detail",
    category: "Approved category",
    active: true,
    state: "active",
    version: 1,
    sort_order: 0,
    form_schema: { version: 1, questions: [] },
    cta: { label: "Share a brief", href: "/book" },
    created_at: "2026-08-05T00:00:00Z",
    updated_at: "2026-08-05T00:00:00Z",
  };
  vi.spyOn(data, "getPublicServices").mockResolvedValue([item]);
  render(await ServicesPage());
  expect(screen.getByRole("heading", { name: item.name })).toBeVisible();
  expect(screen.getByRole("link", { name: "Share a brief" })).toHaveAttribute(
    "href",
    "/book?service=approved-service",
  );
});

it("labels demo services and renders the enquiry process", async () => {
  process.env.NEXT_PUBLIC_DEMO_CONTENT = "1";
  vi.spyOn(data, "getPublicServices").mockResolvedValue([]);
  render(await ServicesPage());

  expect(screen.getAllByText("Services").length).toBeGreaterThan(0);
  expect(
    screen.getByRole("heading", { name: "Live delivery set" }),
  ).toBeVisible();
  expect(
    screen.getByRole("heading", { name: "From brief to booking" }),
  ).toBeVisible();
  expect(
    screen.getByRole("heading", { name: "Align the scope" }),
  ).toBeVisible();
});

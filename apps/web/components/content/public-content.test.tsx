import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import type { ContentItem } from "./types";
import { ContentEmpty, ContentGrid } from "./public-content";

const base: ContentItem = {
  id: "123e4567-e89b-42d3-a456-426614174000",
  revision: 1,
  kind: "portfolio",
  slug: "approved-work",
  title: "Approved work",
  summary: "Approved summary",
  category: "Live arts",
  outlet: "",
  tags: [],
  featured: true,
  gallery_asset_ids: [],
  results: [],
  seo: {
    title: "",
    description: "",
    canonical_url: "",
    social_image_asset_id: "",
  },
  status: "published",
  approved: true,
  created_at: "2026-08-05T00:00:00Z",
  updated_at: "2026-08-05T00:00:00Z",
};
it("renders internal case-study links and external sources safely", () => {
  render(
    <ContentGrid
      items={[
        base,
        {
          ...base,
          id: "223e4567-e89b-42d3-a456-426614174000",
          kind: "press",
          slug: undefined,
          category: "",
          outlet: "Approved outlet",
          external_url: "https://press.example/story",
        },
      ]}
      detailBase="/work"
    />,
  );
  expect(
    screen.getByRole("link", { name: "Read the case study" }),
  ).toHaveAttribute("href", "/work/approved-work");
  expect(
    screen.getByRole("link", { name: "View original source" }),
  ).toHaveAttribute("rel", "noopener noreferrer");
});
it("renders an explicit incomplete state", () => {
  render(<ContentEmpty label="Press coverage" />);
  expect(screen.getByRole("status")).toHaveTextContent("awaiting approval");
});

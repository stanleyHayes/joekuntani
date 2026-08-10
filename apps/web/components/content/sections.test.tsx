import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { ContentSections } from "./sections";
import type { ContentSection } from "./types";

const block = (partial: Partial<ContentSection>): ContentSection => ({
  type: "prose",
  asset_ids: [],
  items: [],
  ...partial,
});

const image = (assetID: string) =>
  assetID ? `https://cdn.example.test/${assetID}.jpg` : undefined;

// Every record predates blocks. Without the fallback the site would empty out
// the moment this shipped.
it("falls back to the markdown body when a record has no blocks", () => {
  render(<ContentSections body={"Joe plays **guitar**."} />);
  expect(screen.getByText("guitar").tagName).toBe("STRONG");
});

it("prefers blocks over the body once a record has them", () => {
  render(
    <ContentSections
      body="the old body"
      sections={[block({ heading: "The story", body: "the new copy" })]}
    />,
  );
  expect(screen.getByText("the new copy")).toBeInTheDocument();
  expect(screen.queryByText("the old body")).toBeNull();
});

// Blocks sit beneath the page's own h1, so they must not introduce a second.
it("starts block headings at h2", () => {
  render(<ContentSections sections={[block({ heading: "A unique style" })]} />);
  expect(
    screen.getByRole("heading", { level: 2, name: "A unique style" }),
  ).toBeInTheDocument();
  expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
});

it("renders section tags as block-level topics", () => {
  render(
    <ContentSections
      sections={[block({ heading: "A unique style", tags: ["comedy", "guitar"] })]}
    />,
  );
  const topics = screen.getByRole("list", { name: "A unique style topics" });
  expect(topics).toHaveTextContent("comedy");
  expect(topics).toHaveTextContent("guitar");
});

it("renders a quote as a blockquote rather than prose", () => {
  const { container } = render(
    <ContentSections
      sections={[block({ type: "quote", body: "He doesn't tell comedy — he plays it." })]}
    />,
  );
  expect(container.querySelector("blockquote")).toHaveTextContent(
    "he plays it.",
  );
  expect(container.querySelector("blockquote")).toHaveClass(
    "scroll-reveal-target",
  );
});

it("renders stats as a description list of label and value", () => {
  render(
    <ContentSections
      sections={[
        block({
          type: "stats",
          items: [
            { label: "Shows", value: "40+" },
            { label: "Countries", value: "2" },
          ],
        }),
      ]}
    />,
  );
  expect(screen.getByText("Shows")).toBeInTheDocument();
  expect(screen.getByText("40+")).toBeInTheDocument();
  expect(screen.getByText("Countries").tagName).toBe("DT");
  expect(screen.getByText("2").tagName).toBe("DD");
});

// An id that resolves to nothing would otherwise render a broken image.
it("drops gallery images whose ids do not resolve", () => {
  const { container } = render(
    <ContentSections
      sections={[block({ type: "gallery", asset_ids: ["good", ""] })]}
      resolveImage={image}
    />,
  );
  const images = container.querySelectorAll("img");
  expect(images).toHaveLength(1);
  expect(images[0]).toHaveAttribute("src", image("good"));
});

// A prose_image block with no usable image must read as prose, not as a
// two-column layout with a hole where the picture should be.
it("degrades prose_image to prose when the image is missing", () => {
  const { container } = render(
    <ContentSections
      sections={[block({ type: "prose_image", body: "copy", asset_ids: [] })]}
      resolveImage={image}
    />,
  );
  expect(screen.getByText("copy")).toBeInTheDocument();
  expect(container.querySelector("img")).toBeNull();
  expect(container.querySelector("figure")).toBeNull();
});

it("renders prose_image with its picture when the id resolves", () => {
  const { container } = render(
    <ContentSections
      sections={[block({ type: "prose_image", body: "copy", asset_ids: ["hero"] })]}
      resolveImage={image}
    />,
  );
  expect(container.querySelector("figure img")).toHaveAttribute(
    "src",
    image("hero"),
  );
});

// Consecutive image blocks marching down one edge is the thing `flip` exists to
// prevent; alternating is the default so an editor gets it without opting in.
it("alternates prose_image sides without being asked", () => {
  const { container } = render(
    <ContentSections
      sections={[
        block({ type: "prose_image", body: "one", asset_ids: ["a"] }),
        block({ type: "prose_image", body: "two", asset_ids: ["b"] }),
      ]}
      resolveImage={image}
    />,
  );
  const blocks = container.querySelectorAll("[data-flip]");
  expect(blocks[0]).toHaveAttribute("data-flip", "false");
  expect(blocks[1]).toHaveAttribute("data-flip", "true");
});

// A stats or gallery block with nothing in it is a gap on the page.
it("renders nothing for blocks with no content to show", () => {
  const { container } = render(
    <ContentSections
      sections={[
        block({ type: "stats", items: [] }),
        block({ type: "gallery", asset_ids: [] }),
      ]}
      resolveImage={image}
    />,
  );
  expect(container.querySelectorAll("section")).toHaveLength(0);
});

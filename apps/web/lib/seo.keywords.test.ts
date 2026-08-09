import { expect, it } from "vitest";
import { keywordsFor } from "./seo";

// The site published no keywords at all, so this is the floor: a page that
// passes none still describes the brand.
it("always includes the brand terms", () => {
  const keywords = keywordsFor();
  expect(keywords).toContain("Joe Kuntani");
  expect(keywords).toContain("guitar comedian");
  expect(keywords.length).toBeGreaterThan(8);
});

it("adds page terms on top of the brand set", () => {
  const keywords = keywordsFor(["wedding entertainer Ghana", "book a set"]);
  expect(keywords).toContain("book a set");
  expect(keywords).toContain("Joe Kuntani");
});

// A record's tags often repeat a brand term; emitting it twice is keyword
// repetition, which is the thing search engines discount.
it("de-duplicates case-insensitively and drops blanks", () => {
  const keywords = keywordsFor(["joe kuntani", "JOE KUNTANI", "  ", ""]);
  const brandHits = keywords.filter((k) => k.toLowerCase() === "joe kuntani");
  expect(brandHits).toHaveLength(1);
  expect(keywords.every((k) => k.trim().length > 0)).toBe(true);
});

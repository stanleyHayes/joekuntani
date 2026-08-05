import { readFileSync } from "node:fs";

const css = readFileSync("app/globals.css", "utf8");

function token(block: string, name: string): string {
  const match = block.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i"));
  if (!match?.[1]) throw new Error(`Missing ${name} token`);
  return match[1];
}

function luminance(hex: string): number {
  const channels = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map(
    (value) => Number.parseInt(value, 16) / 255,
  );
  const [red = 0, green = 0, blue = 0] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(first: string, second: string): number {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return ((values[0] ?? 0) + 0.05) / ((values[1] ?? 0) + 0.05);
}

describe("selection design tokens", () => {
  it("uses the accent pair and meets WCAG AA in light and dark themes", () => {
    const light = css.match(/:root\s*\{([\s\S]*?)\}/)?.[1] ?? "";
    const dark =
      css.match(
        /@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{([\s\S]*?)\}/,
      )?.[1] ?? "";

    expect(css).toMatch(
      /::selection\s*\{[^}]*background:\s*var\(--accent\);[^}]*color:\s*var\(--accent-contrast\)/s,
    );
    expect(
      contrast(token(light, "accent"), token(light, "accent-contrast")),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(token(dark, "accent"), token(dark, "accent-contrast")),
    ).toBeGreaterThanOrEqual(4.5);
  });
});

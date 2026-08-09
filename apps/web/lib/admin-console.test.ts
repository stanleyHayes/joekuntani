import { expect, it } from "vitest";

import { adminConsoleRedirects } from "./admin-console";

// Unset means unchanged. `next dev` relies on this to keep serving the local
// admin, and a deployment not yet pointed at a console must behave as before.
it("adds no redirects when no console is configured", () => {
  expect(adminConsoleRedirects(undefined)).toEqual([]);
  expect(adminConsoleRedirects("")).toEqual([]);
  expect(adminConsoleRedirects("   ")).toEqual([]);
});

it("sends the section root and everything under it to the console", () => {
  const rules = adminConsoleRedirects("https://admin.joekuntani.com");
  expect(rules).toEqual([
    {
      source: "/admin",
      destination: "https://admin.joekuntani.com",
      permanent: false,
    },
    {
      source: "/admin/:path*",
      destination: "https://admin.joekuntani.com/:path*",
      permanent: false,
    },
  ]);
});

// A trailing slash would build `https://host//login`. Browsers read the
// leading `//` as protocol-relative and resolve it to a host called "login".
it("tolerates a trailing slash on the configured URL", () => {
  const rules = adminConsoleRedirects("https://admin.joekuntani.com///");
  expect(rules.map((rule) => rule.destination)).toEqual([
    "https://admin.joekuntani.com",
    "https://admin.joekuntani.com/:path*",
  ]);
});

// Permanent redirects are cached by the browser and are painful to undo if the
// console ever moves, so this stays temporary deliberately.
it("keeps the redirect temporary", () => {
  const rules = adminConsoleRedirects("https://admin.joekuntani.com");
  expect(rules.every((rule) => rule.permanent === false)).toBe(true);
});

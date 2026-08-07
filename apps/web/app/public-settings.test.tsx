import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

/**
 * Every public page must fetch published settings and pass them to PublicShell.
 *
 * PublicShell cannot resolve them itself: doing so makes it an async component,
 * which the synchronous test harness cannot render. So the obligation sits with
 * the pages — and it was silently broken on nine of the ten public routes,
 * meaning navigation, brand name, footer links and CTAs configured in the admin
 * were replaced by hardcoded fallbacks everywhere but /contact.
 *
 * This test exists so that regression is loud rather than invisible.
 */
const ADMIN_OR_INTERNAL = ["admin", "api", "support"];

function publicPages(directory: string, found: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      if (ADMIN_OR_INTERNAL.includes(entry)) continue;
      publicPages(path, found);
    } else if (entry === "page.tsx") {
      found.push(path);
    }
  }
  return found;
}

it("passes published settings to the shell on every public page", () => {
  const offenders = publicPages(join(process.cwd(), "app"))
    .map((path) => ({ path, source: readFileSync(path, "utf8") }))
    .filter(({ source }) => source.includes("<PublicShell"))
    .filter(({ source }) => !/settings=\{/.test(source))
    .map(({ path }) => path.slice(path.indexOf("app/")));

  expect(offenders).toEqual([]);
});

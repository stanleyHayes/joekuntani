/**
 * Longest-prefix route resolution for the admin section.
 *
 * Both the topbar titles and the per-page guide key off the same routes, and
 * they resolved a pathname independently until this existed — so a detail route
 * could inherit one section's title and another section's guide. One resolver
 * means they can only ever disagree if the two tables disagree.
 */

/**
 * Resolves `pathname` against `table`, preferring an exact hit, then the
 * longest registered prefix, then `/admin`.
 *
 * `/admin` is skipped while scanning prefixes because every admin route starts
 * with it — left in, it would match everything at length 6 and defeat the
 * fallback's meaning.
 */
export function matchAdminRoute<T>(
  table: Record<string, T>,
  pathname: string,
): T {
  const exact = table[pathname];
  if (exact) return exact;

  let best: T | undefined;
  let bestLength = -1;
  for (const [route, value] of Object.entries(table)) {
    if (route === "/admin") continue;
    if (pathname.startsWith(`${route}/`) && route.length > bestLength) {
      best = value;
      bestLength = route.length;
    }
  }
  return best ?? table["/admin"];
}

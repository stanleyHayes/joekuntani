/**
 * Longest-prefix route resolution for the console.
 *
 * The topbar titles and the per-page guide key off the same routes, and they
 * resolved a pathname independently until this existed — so a detail route
 * could inherit one section's title and another section's guide. One resolver
 * means they can only disagree if the two tables disagree.
 */

/**
 * Resolves `pathname` against `table`, preferring an exact hit, then the
 * longest registered prefix, then `root`.
 *
 * `root` is skipped while scanning prefixes because every route starts with
 * it — left in, it would match everything and defeat the fallback's meaning.
 * It is a parameter rather than a constant because this console serves its
 * sections from `/`, while the same tables were once mounted under `/admin`.
 */
export function matchAdminRoute<T>(
  table: Record<string, T>,
  pathname: string,
  root = "/",
): T {
  const exact = table[pathname];
  if (exact) return exact;

  let best: T | undefined;
  let bestLength = -1;
  for (const [route, value] of Object.entries(table)) {
    if (route === root) continue;
    if (pathname.startsWith(`${route}/`) && route.length > bestLength) {
      best = value;
      bestLength = route.length;
    }
  }
  return best ?? table[root];
}

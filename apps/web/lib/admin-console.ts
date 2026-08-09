/**
 * Where the staff console lives, for the public app's build configuration.
 *
 * The console is its own app now, but its routes still exist in this one. A
 * public deployment that serves them shows a staff login that cannot succeed:
 * the API's same-origin check accepts exactly one origin, and it is the
 * console's host rather than this one. The form posts, gets a 403, and says
 * nothing useful.
 *
 * Kept out of `next.config.ts` so it can be tested without loading the config,
 * which drags in the Sentry wrapper and the whole build pipeline with it.
 */
export type AdminRedirect = {
  source: string;
  destination: string;
  permanent: boolean;
};

/**
 * Redirects sending `/admin` and everything under it to the standalone console.
 *
 * An unset or blank value yields none, which is what keeps `next dev` serving
 * the local admin — gate this on NODE_ENV instead and there is no way to work
 * on those routes at all. It also means a deployment that has not been pointed
 * at a console yet behaves exactly as it did before.
 */
export function adminConsoleRedirects(
  adminURL: string | undefined,
): AdminRedirect[] {
  // Trailing slashes would produce `//login`, which is a protocol-relative
  // path to a host named "login" once a browser resolves it.
  const target = adminURL?.trim().replace(/\/+$/, "");
  if (!target) return [];
  return [
    // Bare `/admin` is listed separately from the wildcard: it is the link
    // people actually have bookmarked, and `:path*` is not guaranteed to
    // match the section root across path-to-regexp versions.
    { source: "/admin", destination: target, permanent: false },
    {
      source: "/admin/:path*",
      destination: `${target}/:path*`,
      // Temporary on purpose: browsers cache a permanent redirect, and that is
      // painful to walk back if the console ever moves home.
      permanent: false,
    },
  ];
}

/**
 * Asks the public site to drop the caches for something just published.
 *
 * The work itself cannot happen here: `revalidatePath` and `revalidateTag`
 * only reach the caches of the app they run in, so the endpoint that does it
 * has to stay in the public site. But the operator's session cookie is set on
 * this host and never reaches that one, so the browser cannot call it directly
 * either — before this existed the console posted to its own origin, hit the
 * catch-all proxy to the Go API, and got a 404 that nothing surfaced.
 *
 * So the check happens here, where the session is, and the call across is made
 * server-to-server with a shared secret that never reaches a browser.
 */
const MAX_BODY = 16 * 1024;

export async function POST(request: Request) {
  if (!sameOrigin(request)) return problem(403, "Request origin rejected");

  const csrf = request.headers.get("x-csrf-token") ?? "";
  if (
    !csrf ||
    csrf !== cookie(request.headers.get("cookie") ?? "", "jk_admin_csrf")
  )
    return problem(403, "CSRF validation failed");

  const sessionCookie = request.headers.get("cookie") ?? "";
  if (!(await administrator(sessionCookie)))
    return problem(403, "Access denied");

  const target = publicSite();
  const secret = process.env.CACHE_INVALIDATION_SECRET ?? "";
  // Stated rather than silently skipped: publishing appearing to succeed while
  // the public site keeps serving the old page is the failure this endpoint
  // exists to prevent.
  if (!target || secret.length < 32)
    return problem(503, "Cache invalidation is not configured");

  // Numeric, not lexicographic: as strings "9" sorts above "16384".
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY)
    return problem(413, "Invalid request");
  const body = await request.text();
  if (!body || body.length > MAX_BODY) return problem(400, "Invalid request");

  try {
    const response = await fetch(`${target}/api/admin/cms/cache-invalidation`, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "x-cache-invalidation-secret": secret,
      },
      body,
      signal: AbortSignal.timeout(5000),
    });
    if (response.status === 204) return new Response(null, { status: 204 });
    // The public site's verdict is passed through rather than flattened, so a
    // rejected payload reads differently from an unreachable deployment.
    return problem(
      response.status === 403 || response.status === 422
        ? response.status
        : 502,
      response.status === 403
        ? "The public site rejected the invalidation secret"
        : response.status === 422
          ? "Invalid cache invalidation request"
          : "The public site could not be reached",
    );
  } catch {
    return problem(504, "The public site did not respond");
  }
}

/** The public site this console publishes to. */
function publicSite() {
  try {
    const configured = new URL(process.env.PUBLIC_WEB_URL ?? "");
    if (configured.protocol !== "http:" && configured.protocol !== "https:")
      return "";
    if (process.env.NODE_ENV === "production" && configured.protocol !== "https:")
      return "";
    if (configured.username || configured.password) return "";
    return configured.origin;
  } catch {
    return "";
  }
}

function sameOrigin(request: Request) {
  try {
    // The console's own origin, falling back to the public one for a
    // deployment still serving the console from the public site.
    const configured = new URL(
      process.env.PUBLIC_ADMIN_URL || process.env.PUBLIC_WEB_URL || "",
    );
    if (
      (configured.protocol !== "http:" && configured.protocol !== "https:") ||
      configured.username ||
      configured.password ||
      configured.search ||
      configured.hash ||
      (process.env.NODE_ENV === "production" &&
        configured.protocol !== "https:")
    )
      return false;
    return request.headers.get("origin") === configured.origin;
  } catch {
    return false;
  }
}

async function administrator(sessionCookie: string) {
  const apiBase = process.env.API_BASE_URL;
  if (!apiBase) return false;
  try {
    const response = await fetch(`${apiBase}/api/admin/auth/me`, {
      headers: { cookie: sessionCookie },
      cache: "no-store",
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) return false;
    return (
      ((await response.json()) as { role?: string }).role === "administrator"
    );
  } catch {
    return false;
  }
}

function cookie(header: string, name: string) {
  const prefix = `${name}=`;
  const value =
    header
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(prefix))
      ?.slice(prefix.length) ?? "";
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
}

function problem(status: number, title: string) {
  return Response.json(
    { type: "about:blank", title, status },
    { status, headers: { "Content-Type": "application/problem+json" } },
  );
}

import { timingSafeEqual } from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";

/**
 * Invalidates this app's caches when the console publishes something.
 *
 * `revalidatePath` and `revalidateTag` only reach the caches of the app they
 * run in, so this has to live in the public site — it cannot move to the
 * console alongside the rest of the admin. But the console is on its own
 * origin now, so the operator's session cookie never arrives here and the
 * origin and CSRF pair that used to guard this route cannot apply.
 *
 * The console authenticates the operator on its own side, where the session
 * lives, and calls this server-to-server with a shared secret — the pattern
 * Next documents for external callers that need immediate expiry. The secret
 * never reaches a browser.
 */
const kinds = new Set(["page", "portfolio", "video", "press", "testimonial"]);
const actions = new Set(["publish", "schedule", "unpublish"]);
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type Input = {
  content_id: string;
  revision: number;
  kind: string;
  slug: string;
  action: string;
  paths: string[];
  tags: string[];
};

export const SECRET_HEADER = "x-cache-invalidation-secret";

export async function POST(request: Request) {
  if (!authorized(request)) return problem(403, "Access denied");
  let input: Input;
  try {
    input = (await request.json()) as Input;
  } catch {
    return problem(400, "Invalid request");
  }
  if (!valid(input)) return problem(422, "Invalid cache invalidation request");
  try {
    for (const path of input.paths) revalidatePath(path);
    for (const tag of input.tags) revalidateTag(tag, { expire: 0 });
    return new Response(null, { status: 204 });
  } catch {
    return problem(503, "Cache invalidation unavailable");
  }
}

/**
 * Fails closed. An unset or short secret authorises nothing, so a deployment
 * that forgets the variable stops invalidating caches rather than accepting
 * anyone who finds the URL.
 */
function authorized(request: Request) {
  const expected = process.env.CACHE_INVALIDATION_SECRET ?? "";
  if (expected.length < 32) return false;
  return matches(request.headers.get(SECRET_HEADER) ?? "", expected);
}

function matches(presented: string, expected: string) {
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch, and comparing lengths first
  // leaks only the length — which the caller chose anyway.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function valid(input: Input) {
  if (
    !input ||
    Object.keys(input).sort().join(",") !==
      "action,content_id,kind,paths,revision,slug,tags"
  )
    return false;
  if (
    !uuid.test(input.content_id) ||
    !Number.isSafeInteger(input.revision) ||
    input.revision < 1
  )
    return false;
  if (
    !kinds.has(input.kind) ||
    !actions.has(input.action) ||
    (input.slug !== "" && !slug.test(input.slug))
  )
    return false;
  const expected = invalidationTargets(
    input.kind,
    input.slug,
    input.content_id,
  );
  return exact(input.paths, expected.paths) && exact(input.tags, expected.tags);
}

export function invalidationTargets(
  kind: string,
  itemSlug: string,
  contentID: string,
) {
  const collection =
    kind === "portfolio"
      ? "/work"
      : kind === "video"
        ? "/videos"
        : kind === "press"
          ? "/press"
          : "/";
  const paths = new Set([collection]);
  if (itemSlug)
    paths.add(
      kind === "portfolio"
        ? `/work/${itemSlug}`
        : kind === "page"
          ? `/${itemSlug}`
          : collection,
    );
  return {
    paths: [...paths],
    tags: ["public-content", `content:${kind}`, `content:${contentID}`],
  };
}

function exact(actual: unknown, expected: string[]) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}



function problem(status: number, title: string) {
  return Response.json(
    { type: "about:blank", title, status },
    { status, headers: { "Content-Type": "application/problem+json" } },
  );
}

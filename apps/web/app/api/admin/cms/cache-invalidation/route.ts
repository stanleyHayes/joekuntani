import { revalidatePath, revalidateTag } from "next/cache";

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

export async function POST(request: Request) {
  if (!sameOrigin(request)) return problem(403, "Request origin rejected");
  const csrf = request.headers.get("x-csrf-token") ?? "";
  if (
    !csrf ||
    csrf !== cookie(request.headers.get("cookie") ?? "", "jk_admin_csrf")
  )
    return problem(403, "CSRF validation failed");
  const actor = await administrator(request.headers.get("cookie") ?? "");
  if (!actor) return problem(403, "Access denied");
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

function sameOrigin(request: Request) {
  try {
    const configured = new URL(process.env.PUBLIC_WEB_URL ?? "");
    if (
      (configured.protocol !== "http:" && configured.protocol !== "https:") ||
      configured.username ||
      configured.password ||
      configured.pathname !== "/" ||
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

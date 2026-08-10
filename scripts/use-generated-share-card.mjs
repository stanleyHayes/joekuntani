#!/usr/bin/env node
/**
 * Makes the generated card at /og the share image for every page.
 *
 * A shared link picks its image from the first of three places that has one:
 * the record's own SEO image, then the global one in Settings, then /og. So
 * "use the generated card" means clearing the overrides — and they are easy to
 * miss, because a record-level image is invisible from Settings and there is
 * no screen that lists them together.
 *
 * This finds every override, clears it, and points canonical_base at the host
 * the site actually serves from, so the relative /og URL resolves without a
 * redirect. It prints what it will change and stops unless --apply is given.
 *
 * Credentials come from the environment and the second factor from your own
 * authenticator — this never reads an MFA secret out of the database.
 *
 *   JK_API=https://api.joekuntani.com \
 *   JK_ORIGIN=https://admin.joekuntani.com \
 *   JK_EMAIL=you@example.com JK_PASSWORD=… JK_TOTP=123456 \
 *   node scripts/use-generated-share-card.mjs --canonical https://www.joekuntani.com --apply
 */
const API = process.env.JK_API ?? "http://localhost:8080";
const ORIGIN = process.env.JK_ORIGIN ?? "http://localhost:3000";
const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const CANONICAL = (() => {
  const at = argv.indexOf("--canonical");
  return at >= 0 ? (argv[at + 1] ?? "") : "";
})();

/** Every kind that can carry its own social image. */
const KINDS = ["page", "portfolio", "video", "press", "testimonial"];

function fail(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

let cookie = "";
let csrf = "";

async function call(method, path, body) {
  const headers = { Origin: ORIGIN };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = cookie;
  if (csrf) headers["X-CSRF-Token"] = csrf;

  const response = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const issued = response.headers.getSetCookie?.() ?? [];
  if (issued.length) {
    const jar = new Map(
      cookie
        .split(";")
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => [part.slice(0, part.indexOf("=")), part]),
    );
    for (const entry of issued) {
      const pair = entry.split(";")[0];
      jar.set(pair.slice(0, pair.indexOf("=")), pair);
    }
    cookie = [...jar.values()].join("; ");
    const token = cookie.match(/jk_admin_csrf=([^;]+)/);
    if (token) csrf = decodeURIComponent(token[1]);
  }

  const text = await response.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { raw: text.slice(0, 200) };
  }
  return { status: response.status, body: parsed };
}

async function signIn() {
  const { JK_EMAIL, JK_PASSWORD, JK_TOTP } = process.env;
  if (!JK_EMAIL || !JK_PASSWORD || !JK_TOTP)
    fail(
      "Set JK_EMAIL, JK_PASSWORD and JK_TOTP (the current code from your authenticator).",
    );

  const login = await call("POST", "/api/admin/auth/login", {
    email: JK_EMAIL,
    password: JK_PASSWORD,
  });
  if (login.status === 403)
    fail(
      `The API rejected the origin ${ORIGIN}. Set JK_ORIGIN to the console's URL.`,
    );
  if (login.status >= 400)
    fail(`Sign-in failed (${login.status}). ${login.body.title ?? ""}`);

  const verified = await call("POST", "/api/admin/auth/mfa/verify", {
    code: JK_TOTP,
  });
  if (verified.status >= 400)
    fail(
      `The authenticator code was not accepted (${verified.status}). Codes last 30 seconds.`,
    );

  const me = await call("GET", "/api/admin/auth/me");
  if (me.status !== 200) fail(`Signed in but /me returned ${me.status}.`);
  if (me.body.role !== "administrator")
    fail("Clearing settings requires the administrator role.");
  console.log(`  signed in as ${me.body.email ?? JK_EMAIL}\n`);
}

/** The record-level overrides, which no single screen lists. */
async function findOverrides() {
  const found = [];
  for (const kind of KINDS) {
    const listed = await call("GET", `/api/admin/content/${kind}`);
    if (listed.status !== 200) continue;
    for (const item of listed.body.items ?? []) {
      const asset = (item.seo?.social_image_asset_id ?? "").trim();
      if (asset) found.push({ kind, item, asset });
    }
  }
  return found;
}

async function clearRecord({ kind, item }) {
  // The whole record goes back: the API replaces rather than patches, so an
  // omitted field would be cleared along with the image.
  const body = {
    revision: item.revision,
    slug: item.slug ?? "",
    title: item.title,
    summary: item.summary ?? "",
    body: item.body ?? "",
    category: item.category ?? "",
    tags: item.tags ?? [],
    featured: Boolean(item.featured),
    gallery_asset_ids: item.gallery_asset_ids ?? [],
    results: item.results ?? [],
    sections: item.sections ?? [],
    external_url: item.external_url ?? "",
    embed_url: item.embed_url ?? "",
    video_asset_id: item.video_asset_id ?? "",
    outlet: item.outlet ?? "",
    person_name: item.person_name ?? "",
    person_title: item.person_title ?? "",
    organization: item.organization ?? "",
    seo: { ...item.seo, social_image_asset_id: "" },
  };
  const saved = await call(
    "PUT",
    `/api/admin/content/${kind}/${item.id}`,
    body,
  );
  if (saved.status !== 200)
    return `  ✗ ${kind}/${item.slug ?? item.id} — ${saved.status} ${saved.body.title ?? ""}`;
  return `  ✓ ${kind}/${item.slug ?? item.id} — cleared (now revision ${saved.body.revision}, ${saved.body.status})`;
}

async function updateSettings() {
  const current = await call("GET", "/api/admin/settings");
  if (current.status !== 200)
    fail(`Settings could not be read (${current.status}).`);

  const values = structuredClone(current.body.draft);
  const before = {
    social: values.seo.social_image_asset_id ?? "",
    canonical: values.seo.canonical_base ?? "",
  };
  values.seo.social_image_asset_id = "";
  if (CANONICAL) values.seo.canonical_base = CANONICAL.replace(/\/+$/, "");

  const nothingToDo =
    !before.social &&
    (!CANONICAL || before.canonical === values.seo.canonical_base);
  if (nothingToDo) return "  · settings already correct";

  if (!APPLY)
    return (
      `  → settings: social image "${before.social || "(none)"}" → ""` +
      (CANONICAL
        ? `, canonical "${before.canonical}" → "${values.seo.canonical_base}"`
        : "")
    );

  const saved = await call("PUT", "/api/admin/settings", {
    version: current.body.version,
    values,
    content_complete: current.body.content_complete,
  });
  if (saved.status !== 200)
    return `  ✗ settings — ${saved.status} ${saved.body.title ?? ""}`;

  // Settings are drafted then published; without the second call the public
  // site keeps serving the previous approved copy.
  const published = await call("POST", "/api/admin/settings/publish", {
    version: saved.body.version,
  });
  return published.status === 200
    ? "  ✓ settings — cleared and published"
    : `  ✗ settings saved but not published — ${published.status} ${published.body.title ?? ""}`;
}

async function main() {
  console.log(`\n  API    ${API}\n  origin ${ORIGIN}`);
  console.log(
    `  mode   ${APPLY ? "APPLY" : "dry run (pass --apply to write)"}\n`,
  );
  await signIn();

  const overrides = await findOverrides();
  console.log(`  record-level social images found: ${overrides.length}`);
  for (const found of overrides)
    console.log(
      `    ${found.kind}/${found.item.slug ?? found.item.id} → ${found.asset}`,
    );
  console.log("");

  for (const found of overrides)
    console.log(
      APPLY
        ? await clearRecord(found)
        : `  → ${found.kind}/${found.item.slug ?? found.item.id} would be cleared`,
    );

  console.log(await updateSettings());

  console.log(
    APPLY
      ? "\n  Done. Every page now falls through to the generated card at /og.\n"
      : "\n  Nothing was changed. Re-run with --apply to make it so.\n",
  );
}

main().catch((error) => fail(error?.message ?? String(error)));

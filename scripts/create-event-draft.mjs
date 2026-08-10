#!/usr/bin/env node
/**
 * Creates a draft event from a poster, through the admin API.
 *
 * A poster gives you a title, a performer and artwork; it rarely gives you a
 * date, a venue or a price. Those are the fields the event schema insists on,
 * so making the record by hand means uploading the image, confirming it,
 * inventing four placeholders and typing the copy off the poster before the
 * draft even exists. This does that part and stops, leaving the facts only you
 * know to be filled in and published from the console.
 *
 * The event is created as a DRAFT: it is not on the public site until you
 * publish it, even though the banner is configured, so the artwork is visible
 * in the console while the details are still placeholders.
 *
 * Credentials come from the environment and the second factor from your own
 * authenticator — this never reads an MFA secret out of the database.
 *
 *   JK_API=https://api.joekuntani.com \
 *   JK_ORIGIN=https://admin.joekuntani.com \
 *   JK_EMAIL=you@example.com JK_PASSWORD=… JK_TOTP=123456 \
 *   node scripts/create-event-draft.mjs ./poster.png ./event.json
 *
 * `event.json` is optional; without it the Strum & Laugh defaults below apply.
 */
import { readFile, stat } from "node:fs/promises";
import { basename, extname } from "node:path";

const API = process.env.JK_API ?? "http://localhost:8080";
const ORIGIN = process.env.JK_ORIGIN ?? "http://localhost:3000";
const [posterPath, detailPath] = process.argv.slice(2);

/**
 * Only what the poster actually states. Everything the poster is silent about
 * is a placeholder that says so, so nothing here can be mistaken for a fact
 * about the show.
 */
const PLACEHOLDER_NOTE =
  "PLACEHOLDER DETAILS — the poster announces the show but not its date, " +
  "venue, capacity or ticket price. Those four are stand-ins so the record " +
  "can exist; replace them before publishing.";

const DEFAULTS = {
  title: "Strum & Laugh",
  summary:
    "A standup comedy special by Joe Kuntani (Numero Uno), presented by " +
    "Eagle's Code Multimedia. Coming soon — date and venue to be announced.",
  description:
    "STRUM & LAUGH\n\nA standup comedy special by Joe Kuntani (Numero Uno). " +
    "Presented by Eagle's Code Multimedia. Coming soon.\n\n" +
    "For sponsorship: 0243610626\n\n" +
    PLACEHOLDER_NOTE,
  timezone: "Africa/Accra",
  venue: {
    name: "Venue to be announced",
    address: "To be announced",
    city: "To be announced",
    country_code: "GH",
  },
  policies: {
    refunds: "To be announced with the on-sale date.",
    entry: "To be announced with the on-sale date.",
    age_limit: 16,
  },
  capacity: 300,
  /** Months out, so the placeholder window is obviously not a real date. */
  monthsAhead: 3,
  altText:
    "Promotional poster for Strum & Laugh, a Joe Kuntani comedy special.",
};

function fail(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

let cookie = "";
let csrf = "";

async function call(method, path, body, extraHeaders = {}) {
  const headers = { Origin: ORIGIN, ...extraHeaders };
  if (body !== undefined && !(body instanceof FormData))
    headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = cookie;
  if (csrf) headers["X-CSRF-Token"] = csrf;

  const response = await fetch(`${API}${path}`, {
    method,
    headers,
    body:
      body === undefined || body instanceof FormData
        ? body
        : JSON.stringify(body),
  });

  // The session and CSRF pair arrive as Set-Cookie and are needed by every
  // later call; fetch exposes them only through getSetCookie().
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
      `The authenticator code was not accepted (${verified.status}). Codes last 30 seconds — try the current one.`,
    );

  const me = await call("GET", "/api/admin/auth/me");
  if (me.status !== 200) fail(`Signed in but /me returned ${me.status}.`);
  console.log(`  signed in as ${me.body.email ?? JK_EMAIL} (${me.body.role})`);
  if (me.body.role !== "administrator")
    fail("Creating events requires the administrator role.");
}

/**
 * Stops before the upload if the show already has a record.
 *
 * The API derives the slug from the title and rejects a duplicate with a bare
 * 409, which arrives after the poster has already been stored — so a rerun
 * would leave an orphan copy in the media library every time.
 */
async function refuseDuplicate(title) {
  const listed = await call("GET", "/api/admin/events");
  if (listed.status !== 200) return;
  const existing = (listed.body.items ?? []).find(
    (event) => event.title.trim().toLowerCase() === title.trim().toLowerCase(),
  );
  if (existing)
    fail(
      `"${existing.title}" already exists as ${existing.slug} (${existing.status}). ` +
        `Edit it in the console, or delete it first if you want a fresh draft.`,
    );
}

async function uploadPoster(path) {
  const bytes = await readFile(path);
  const { size } = await stat(path);
  const extension = extname(path).toLowerCase();
  const mime =
    extension === ".png"
      ? "image/png"
      : extension === ".webp"
        ? "image/webp"
        : "image/jpeg";

  const requested = await call("POST", "/api/admin/media/uploads", {
    filename: basename(path),
    mime_type: mime,
    folder: "events",
    alt_text: DEFAULTS.altText,
    tags: ["events", "promo"],
    transformations: [],
    bytes: size,
    // Read from the file rather than guessed; the API stores what it is told.
    ...(await pngSize(bytes)),
  });
  if (requested.status !== 201)
    fail(
      `The upload could not be started (${requested.status}). ${requested.body.title ?? ""}`,
    );

  const { asset, upload } = requested.body;
  if (!upload)
    fail(
      `No media provider is configured, so the poster cannot be stored. The draft was not created.`,
    );

  const form = new FormData();
  for (const field of [
    "api_key",
    "timestamp",
    "signature",
    "folder",
    "public_id",
  ])
    form.append(field, String(upload[field]));
  form.append("tags", "events,promo");
  form.append("file", new Blob([bytes], { type: mime }), basename(path));

  const stored = await fetch(upload.upload_url, { method: "POST", body: form });
  if (!stored.ok)
    fail(`The storage provider rejected the poster (${stored.status}).`);
  const reply = await stored.text();

  // The confirm endpoint verifies the provider's signed reply, so it has to be
  // the body — not a re-encoded copy.
  const finished = await fetch(`${API}/api/admin/media/${asset.id}/confirm`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: ORIGIN,
      Cookie: cookie,
      "X-CSRF-Token": csrf,
    },
    body: reply,
  });
  if (finished.status !== 200)
    fail(
      `The poster reached storage but could not be confirmed (${finished.status}).`,
    );

  console.log(`  poster uploaded — asset ${asset.id}`);
  return asset.id;
}

/** Dimensions straight from the PNG/JPEG header, so nothing is invented. */
async function pngSize(bytes) {
  if (bytes.length > 24 && bytes.toString("ascii", 1, 4) === "PNG")
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  for (let at = 2; at + 9 < bytes.length; ) {
    if (bytes[at] !== 0xff) break;
    const marker = bytes[at + 1];
    const length = bytes.readUInt16BE(at + 2);
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      ![0xc4, 0xc8, 0xcc].includes(marker)
    )
      return {
        height: bytes.readUInt16BE(at + 5),
        width: bytes.readUInt16BE(at + 7),
      };
    at += 2 + length;
  }
  return { width: 1200, height: 1600 };
}

async function createDraft(assetID, detail) {
  const starts = new Date();
  starts.setMonth(
    starts.getMonth() + (detail.monthsAhead ?? DEFAULTS.monthsAhead),
  );
  starts.setHours(19, 0, 0, 0);
  const ends = new Date(starts.getTime() + 3 * 60 * 60 * 1000);

  const created = await call("POST", "/api/admin/events", {
    title: detail.title,
    summary: detail.summary,
    description: detail.description,
    timezone: detail.timezone,
    banner_asset_id: assetID,
    venue: detail.venue,
    policies: detail.policies,
    starts_at: starts.toISOString(),
    ends_at: ends.toISOString(),
    capacity: detail.capacity,
    // Featured so the poster is attached and visible while editing. A draft is
    // not on the public site, so nothing shows until it is published.
    banner: {
      featured: true,
      starts_at: new Date().toISOString(),
      ends_at: ends.toISOString(),
    },
  });
  if (created.status !== 201)
    fail(
      `The draft was rejected (${created.status}). ${created.body.title ?? ""}`,
    );
  return created.body;
}

async function main() {
  if (!posterPath)
    fail("Usage: node scripts/create-event-draft.mjs <poster> [event.json]");
  const detail = detailPath
    ? { ...DEFAULTS, ...JSON.parse(await readFile(detailPath, "utf8")) }
    : DEFAULTS;

  console.log(`\n  API    ${API}\n  origin ${ORIGIN}\n`);
  await signIn();
  await refuseDuplicate(detail.title);
  const assetID = await uploadPoster(posterPath);
  const event = await createDraft(assetID, detail);

  console.log(`  draft created — ${event.slug} (${event.status})`);
  console.log(
    `\n  Open it in the console, then replace the four placeholders:`,
  );
  console.log(`    · date and time      currently ${event.starts_at}`);
  console.log(`    · venue              currently "${event.venue.name}"`);
  console.log(`    · capacity           currently ${event.capacity}`);
  console.log(
    `    · at least one ticket type — an event cannot publish without one`,
  );
  console.log(`\n  It stays off the public site until you publish it.\n`);
}

main().catch((error) => fail(error?.message ?? String(error)));

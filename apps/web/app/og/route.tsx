import { ImageResponse } from "next/og";

import { publicImage } from "../../lib/seo";
import { getPublicSettings } from "../../lib/settings";

/**
 * The brand logo as a data URI, or undefined.
 *
 * Fetched here rather than handed to the renderer as a URL: the renderer would
 * do that fetch itself while drawing, and a slow or unreachable CDN would throw
 * mid-render and return a 500 — leaving shared links with no image at all,
 * which is worse than the card without a logo. Resolving first means any
 * failure just falls back to the mark.
 */
async function brandLogo(assetID: string): Promise<string | undefined> {
  const url = await publicImage(assetID);
  if (!url) return undefined;
  try {
    // `no-store`, not `force-cache`: routing a few hundred kilobytes of binary
    // through the data cache made this time out on every render. The card is
    // fetched by link scrapers rather than by readers, so the repeat cost is
    // small, and the budget is generous because a cold connect can spend most
    // of undici's own ten-second connect budget before a byte moves.
    const response = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!response.ok) return undefined;
    const type = response.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) return undefined;
    const body = Buffer.from(await response.arrayBuffer());
    // Past roughly a megabyte the base64 copy costs more than the logo is
    // worth on a card this size.
    if (body.byteLength > 1_500_000) return undefined;
    return `data:${type};base64,${body.toString("base64")}`;
  } catch {
    return undefined;
  }
}

/**
 * The site's social share card, drawn rather than photographed.
 *
 * Links shared to WhatsApp, X or Facebook previously had no image at all
 * because `social_image_asset_id` was never set. A generated card fixes that
 * without inventing photography of a real person, and it stays correct when the
 * brand name or tagline is edited in the admin — there is no asset to re-cut.
 *
 * Upload a real photograph in Settings → Brand to override this.
 */
const size = { width: 1200, height: 630 };

/**
 * Served as an explicit route rather than the `opengraph-image` file
 * convention: that convention shadows the metadata of the page in its own
 * segment, so the home page silently got a request-origin URL and no Twitter
 * card while every other page got the canonical one. An ordinary route is
 * referenced the same way from everywhere.
 */
export async function GET() {
  const settings = await getPublicSettings();
  const name = settings?.brand?.name || "Joe Kuntani";
  const tagline = settings?.brand?.tagline || "Comedy and guitar, live.";
  const logo = await brandLogo(settings?.brand?.logo_asset_id ?? "");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          // Solid, not a gradient — the brand deliberately avoids them.
          backgroundColor: "#0a0b0f",
          color: "#f4f2ea",
          padding: "72px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "22px" }}>
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logo}
              alt=""
              width={96}
              height={96}
              style={{ borderRadius: "20px", objectFit: "cover" }}
            />
          ) : (
            <div
              style={{
                width: "18px",
                height: "18px",
                borderRadius: "999px",
                backgroundColor: "#f5d400",
              }}
            />
          )}
          <div
            style={{
              fontSize: "24px",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#f5d400",
              fontWeight: 700,
            }}
          >
            Official site
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div
            style={{
              fontSize: "104px",
              fontWeight: 800,
              letterSpacing: "-0.05em",
              lineHeight: 1,
            }}
          >
            {name}
          </div>
          <div
            style={{
              fontSize: "38px",
              color: "rgba(244, 242, 234, 0.72)",
              lineHeight: 1.3,
              maxWidth: "900px",
            }}
          >
            {tagline}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            fontSize: "26px",
            color: "rgba(244, 242, 234, 0.55)",
          }}
        >
          <div style={{ display: "flex" }}>joekuntani.com</div>
          <div style={{ display: "flex", gap: "10px" }}>
            <div
              style={{
                width: "56px",
                height: "6px",
                backgroundColor: "#f5d400",
              }}
            />
            <div
              style={{
                width: "56px",
                height: "6px",
                backgroundColor: "#00c8f0",
              }}
            />
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      // The settings lookup is `no-store`, so the route is dynamic and
      // `revalidate` cannot apply — the cache has to be stated in the response.
      // Without it every scrape re-renders the card and re-fetches the logo.
      headers: {
        "Cache-Control":
          "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      },
    },
  );
}

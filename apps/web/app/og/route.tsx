import { ImageResponse } from "next/og";

import { getPublicSettings } from "../../lib/settings";

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
        <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
          <div
            style={{
              width: "18px",
              height: "18px",
              borderRadius: "999px",
              backgroundColor: "#f5d400",
            }}
          />
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
    size,
  );
}

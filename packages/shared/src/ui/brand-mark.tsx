/** Provided brand lockup — use the artist-supplied JPEG, not a generated SVG. */
export const BRAND_LOGO_SRC = "/brand/logo.jpeg";

type BrandMarkProps = {
  brandName?: string;
  className?: string;
  priority?: boolean;
  size?: "sm" | "md";
};

export function BrandMark({
  brandName = "Joe Kuntani",
  className,
  size = "md",
}: BrandMarkProps) {
  const pixels = size === "sm" ? 36 : 48;
  return (
    <span className={["brand-mark", className].filter(Boolean).join(" ")}>
      {/* Artist-supplied JPEG lockup; next/image not required for small chrome marks. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt=""
        aria-hidden="true"
        className="brand-mark__image"
        height={pixels}
        src={BRAND_LOGO_SRC}
        width={pixels}
      />
      <span className="brand-mark__text">{brandName}</span>
    </span>
  );
}

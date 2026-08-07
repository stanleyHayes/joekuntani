export type MerchVariant = {
  id: string;
  label: string;
  sku: string;
  price: string;
  currency: string;
  stock: number;
  active: boolean;
};

export type MerchProduct = {
  id: string;
  slug: string;
  name: string;
  summary: string;
  description: string;
  category: string;
  image_asset_ids: string[];
  variants: MerchVariant[];
};

export type Catalogue = {
  products: MerchProduct[];
  currency: string;
  /** False until a payment provider is configured; the shop says so up front. */
  enabled: boolean;
};

const emptyCatalogue: Catalogue = {
  products: [],
  currency: "GHS",
  enabled: false,
};

function validProduct(value: unknown): value is MerchProduct {
  if (!value || typeof value !== "object") return false;
  const product = value as Partial<MerchProduct>;
  return (
    typeof product.id === "string" &&
    typeof product.slug === "string" &&
    typeof product.name === "string" &&
    Array.isArray(product.variants)
  );
}

export async function getCatalogue(): Promise<Catalogue> {
  const base = process.env.API_BASE_URL;
  if (!base) return emptyCatalogue;
  try {
    const response = await fetch(`${base}/api/public/merch`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) return emptyCatalogue;
    const body = (await response.json()) as Partial<Catalogue>;
    return {
      products: Array.isArray(body.products)
        ? body.products.filter(validProduct)
        : [],
      currency: body.currency || "GHS",
      enabled: body.enabled === true,
    };
  } catch {
    return emptyCatalogue;
  }
}

/** Lowest active, in-stock price — what a listing card should lead with. */
export function fromPrice(product: MerchProduct): MerchVariant | null {
  const available = product.variants
    .filter((variant) => variant.active && variant.stock > 0)
    .sort((a, b) => Number(a.price) - Number(b.price));
  return available[0] ?? null;
}

export function totalStock(product: MerchProduct): number {
  return product.variants
    .filter((variant) => variant.active)
    .reduce((sum, variant) => sum + variant.stock, 0);
}

export type ProductDetail = {
  product: MerchProduct | null;
  currency: string;
  enabled: boolean;
};

export async function getProduct(slug: string): Promise<ProductDetail> {
  const base = process.env.API_BASE_URL;
  if (!base || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
    return { product: null, currency: "GHS", enabled: false };
  try {
    const response = await fetch(
      `${base}/api/public/merch/products/${encodeURIComponent(slug)}`,
      { cache: "no-store", signal: AbortSignal.timeout(2000) },
    );
    if (!response.ok) return { product: null, currency: "GHS", enabled: false };
    const body = (await response.json()) as {
      product?: unknown;
      currency?: string;
      enabled?: boolean;
    };
    return {
      product: validProduct(body.product) ? body.product : null,
      currency: body.currency || "GHS",
      enabled: body.enabled === true,
    };
  } catch {
    return { product: null, currency: "GHS", enabled: false };
  }
}

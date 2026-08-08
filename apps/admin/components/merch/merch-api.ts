/**
 * Shared merchandise types and transport.
 *
 * The product editor moved out of a dialog and onto its own page, so the list
 * and the editor are now separate route trees that still speak to the same
 * endpoints. This module is what they share.
 */

export type Variant = {
  id: string;
  product_id: string;
  sku: string;
  label: string;
  price: string;
  currency: string;
  stock: number;
  active: boolean;
  sort_order: number;
};

export type Product = {
  id: string;
  slug: string;
  name: string;
  summary: string;
  description: string;
  category: string;
  image_asset_ids: string[];
  active: boolean;
  sort_order: number;
  variants: Variant[];
};

export type Order = {
  id: string;
  reference: string;
  currency: string;
  total: string;
  status: string;
  created_at: string;
  buyer: { name: string; email: string; phone: string };
  delivery: { address: string; city: string; country_code: string };
  lines: { product_name: string; variant_label: string; quantity: number }[];
};

export const blankProduct: Product = {
  id: "",
  slug: "",
  name: "",
  summary: "",
  description: "",
  category: "",
  image_asset_ids: [],
  active: false,
  sort_order: 0,
  variants: [],
};

export function csrfCookie() {
  const prefix = "jk_admin_csrf=";
  return (
    document.cookie
      .split(";")
      .map((value) => value.trim())
      .find((value) => value.startsWith(prefix))
      ?.slice(prefix.length) ?? ""
  );
}

export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(path, {
    method: init.method ?? "GET",
    cache: "no-store",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init.method && init.method !== "GET"
        ? { "X-CSRF-Token": csrfCookie() }
        : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!response.ok) throw new Error(String(response.status));
  return response.status === 204 ? ({} as T) : ((await response.json()) as T);
}

/** Where the editor for a product lives. `new` is a product that has no id yet. */
export function productEditorHref(id: string) {
  return `/merch/products/${id ? encodeURIComponent(id) : "new"}`;
}

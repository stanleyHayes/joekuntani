import type { Metadata } from "next";
import { ProductEditor } from "../../../../../components/admin/merch/product-editor";

export const metadata: Metadata = {
  title: "Product",
  robots: { index: false, follow: false },
};

export default async function AdminMerchProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProductEditor productID={id} />;
}

import type { Metadata } from "next";
import { CRMTools } from "../../../../components/admin/crm/crm-tools";

export const metadata: Metadata = {
  title: "CRM tools",
  robots: { index: false, follow: false },
};

export default async function AdminCRMToolsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = await searchParams;
  return (
    <CRMTools
      query={first(filters.q)}
      stage={first(filters.stage)}
      owner={first(filters.owner_id)}
    />
  );
}

/** The pipeline list never repeats a filter, so a repeated one loses its tail. */
function first(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

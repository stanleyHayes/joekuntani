import type { Metadata } from "next";
import { PermissionsWorkspace } from "../../../components/admin/permissions/permissions-workspace";

export const metadata: Metadata = {
  title: "Permissions",
  robots: { index: false, follow: false },
};

export default function AdminPermissionsPage() {
  return <PermissionsWorkspace />;
}

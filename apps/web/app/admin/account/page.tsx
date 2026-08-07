import type { Metadata } from "next";
import { ProfileWorkspace } from "../../../components/admin/account/account-workspace";

export const metadata: Metadata = {
  title: "Profile",
  robots: { index: false, follow: false },
};

export default function AdminAccountPage() {
  return <ProfileWorkspace />;
}

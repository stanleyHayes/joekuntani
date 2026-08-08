import type { Metadata } from "next";
import { TeamWorkspace } from "../../components/team/team-workspace";

export const metadata: Metadata = {
  title: "Users & roles",
  robots: { index: false, follow: false },
};

export default function AdminTeamPage() {
  return <TeamWorkspace />;
}

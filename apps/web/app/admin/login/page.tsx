import type { Metadata } from "next";
import { LoginForm } from "@/components/admin/auth/login-form";

export const metadata: Metadata = {
  title: "Staff sign in",
  robots: { index: false, follow: false },
};
export default function LoginPage() {
  return <LoginForm />;
}

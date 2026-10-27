import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/server-api";
import { AdminLogin } from "@/components/admin/AdminLogin";

export const metadata = { title: "Admin login", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  // Already signed in as the admin: go straight to the dashboard.
  if ((await getCurrentUser())?.isAdmin) redirect("/admin");
  return <AdminLogin />;
}

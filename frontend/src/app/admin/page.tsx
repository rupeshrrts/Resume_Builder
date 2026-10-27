import { redirect } from "next/navigation";
import { BackendError, backend, getCurrentUser } from "@/lib/server-api";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import type { AdminStats } from "@resume/shared/types/api";

export const metadata = { title: "Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { range } = await searchParams;
  // ?range=7 | 30 | all (the server falls back to 30 days for anything else).
  const query = range === "7" || range === "all" ? `?range=${range}` : "";
  let stats: AdminStats | null;
  try {
    stats = await backend<AdminStats>(`/api/admin/stats${query}`);
  } catch (e) {
    // Signed in but not an admin: the admin login page explains what to do.
    if (e instanceof BackendError && e.status === 404) redirect("/admin/login");
    throw e;
  }
  if (!stats) redirect("/admin/login");
  const me = await getCurrentUser();
  return <AdminDashboard stats={stats} name={me?.fullName ?? ""} />;
}

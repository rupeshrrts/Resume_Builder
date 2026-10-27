import { requirePage } from "@/lib/server-api";
import { Dashboard } from "@/components/Dashboard";
import type { DashboardPayload } from "@resume/shared/types/api";

// Signed-in (or utility) page: kept out of search results.
export const metadata = { title: "Dashboard", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const d = await requirePage<DashboardPayload>("/api/dashboard");
  return <Dashboard email={d.user.email} fullName={d.user.fullName} resumes={d.resumes} jobs={d.jobs} scores={d.scores} />;
}

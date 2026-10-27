import { requirePage } from "@/lib/server-api";
import { Board } from "@/components/pipeline/Board";
import type { DashboardPayload } from "@resume/shared/types/api";

// Signed-in (or utility) page: kept out of search results.
export const metadata = { title: "Applications", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ApplicationsPage() {
  const d = await requirePage<DashboardPayload>("/api/dashboard");
  return <Board jobs={d.jobs} resumes={d.resumes} />;
}

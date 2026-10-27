import { requirePage } from "@/lib/server-api";
import { InterviewPrep } from "@/components/interview/InterviewPrep";
import type { AiStatus, DashboardPayload } from "@resume/shared/types/api";

// Signed-in (or utility) page: kept out of search results.
export const metadata = { title: "Interview prep", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function InterviewPage() {
  const [d, ai] = await Promise.all([requirePage<DashboardPayload>("/api/dashboard"), requirePage<AiStatus>("/api/ai/status")]);
  return <InterviewPrep resumes={d.resumes} jobs={d.jobs} aiAvailable={ai.available} />;
}

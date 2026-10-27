import { requirePage } from "@/lib/server-api";
import { ImportFlow } from "@/components/ImportFlow";
import type { AiStatus } from "@resume/shared/types/api";

// Signed-in (or utility) page: kept out of search results.
export const metadata = { title: "Upload your resume", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const ai = await requirePage<AiStatus>("/api/ai/status");
  return <ImportFlow aiAvailable={ai.available} />;
}

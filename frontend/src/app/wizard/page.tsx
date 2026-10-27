import { requirePage } from "@/lib/server-api";
import { Wizard } from "@/components/wizard/Wizard";
import type { AiStatus, SessionUser } from "@resume/shared/types/api";

// Signed-in (or utility) page: kept out of search results.
export const metadata = { title: "Create your resume step by step", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function WizardPage() {
  const [ai, me] = await Promise.all([requirePage<AiStatus>("/api/ai/status"), requirePage<{ user: SessionUser }>("/api/auth/me")]);
  return <Wizard aiAvailable={ai.available} account={me.user} />;
}

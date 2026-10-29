import Link from "next/link";
import { Sparkles } from "lucide-react";
import { requirePage } from "@/lib/server-api";
import { UPLOAD_AND_AI_ANALYSIS } from "@/lib/features";
import { ImportFlow } from "@/components/ImportFlow";
import { Badge } from "@/components/ui";
import type { AiStatus } from "@resume/shared/types/api";

// Signed-in (or utility) page: kept out of search results.
export const metadata = { title: "Upload your resume", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const ai = await requirePage<AiStatus>("/api/ai/status");
  if (!UPLOAD_AND_AI_ANALYSIS) return <ComingSoon />;
  return <ImportFlow aiAvailable={ai.available} />;
}

function ComingSoon() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-violet-500 text-white shadow-md">
        <Sparkles className="h-7 w-7" aria-hidden />
      </span>
      <p className="mt-5"><Badge tone="violet">Coming soon</Badge></p>
      <h1 className="mt-3 text-3xl font-extrabold">Upload &amp; analyse your resume with AI</h1>
      <p className="mt-3 text-slate-600">
        Soon you&apos;ll be able to upload your PDF or Word resume and get an AI analysis: your ATS score, what&apos;s weak, and how to fix it. We&apos;re still working on it.
      </p>
      <p className="mt-2 text-slate-600">Meanwhile, build your resume step by step. It&apos;s checked for ATS as you type.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link href="/wizard" className="btn-primary"><Sparkles className="h-4 w-4" aria-hidden /> Create step by step</Link>
        <Link href="/dashboard" className="btn-secondary">Back to dashboard</Link>
      </div>
    </div>
  );
}

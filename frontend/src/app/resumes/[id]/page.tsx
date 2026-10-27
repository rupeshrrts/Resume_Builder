import { notFound } from "next/navigation";
import { BackendError, requirePage } from "@/lib/server-api";
import { Editor } from "@/components/editor/Editor";
import type { EditorPayload } from "@resume/shared/types/api";

export const dynamic = "force-dynamic";
// Signed-in (or utility) page: kept out of search results.
export const metadata = { title: "Edit resume", robots: { index: false, follow: false } };

export default async function ResumePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let d: EditorPayload;
  try {
    d = await requirePage<EditorPayload>(`/api/resumes/${encodeURIComponent(id)}/editor`);
  } catch (e) {
    if (e instanceof BackendError && e.status === 404) notFound();
    throw e;
  }
  const r = d.resume;
  return (
    <Editor
      key={r.id}
      resume={{ id: r.id, name: r.name, kind: r.kind, jobId: r.jobId, revision: r.revision, data: r.data, settings: r.settings, parentId: r.parentId }}
      parentName={d.parentName}
      jobs={d.jobs}
      ai={d.ai}
    />
  );
}

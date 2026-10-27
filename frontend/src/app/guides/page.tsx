import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { GUIDES } from "@/content/guides";

export const metadata = {
  title: "Resume Guides: ATS Format, Freshers, Software Engineers",
  description: "Free, practical guides to writing an ATS-friendly resume: format rules, fresher resumes, software engineer resumes and how to check your ATS score.",
  alternates: { canonical: "/guides" },
};

export default function GuidesPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="flex items-center gap-2 text-3xl font-extrabold"><BookOpen className="h-7 w-7 text-brand-600" aria-hidden /> Resume guides</h1>
      <p className="mt-2 text-slate-600">Short, practical answers to the questions people ask most about resumes and ATS.</p>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2">
        {GUIDES.map((g) => (
          <li key={g.slug}>
            <Link href={`/guides/${g.slug}`} className="card card-hover block h-full p-5">
              <span className="block text-lg font-bold text-slate-900">{g.h1}</span>
              <span className="mt-2 block text-sm text-slate-600">{g.description}</span>
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-700">Read guide <ArrowRight className="h-4 w-4" aria-hidden /></span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

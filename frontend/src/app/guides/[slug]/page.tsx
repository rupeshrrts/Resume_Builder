import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, BookOpen, CheckCircle2 } from "lucide-react";
import { GUIDES, guideBySlug } from "@/content/guides";
import { SITE_NAME, SITE_URL } from "@/lib/site";

export const dynamicParams = false;

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const g = guideBySlug((await params).slug);
  if (!g) return {};
  return {
    title: { absolute: `${g.title} | ${SITE_NAME}` },
    description: g.description,
    alternates: { canonical: `/guides/${g.slug}` },
    openGraph: { type: "article", title: g.title, description: g.description, url: `/guides/${g.slug}` },
  };
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const g = guideBySlug((await params).slug);
  if (!g) notFound();
  const url = `${SITE_URL}/guides/${g.slug}`;
  const structured = [
    { "@context": "https://schema.org", "@type": "Article", headline: g.h1, description: g.description, dateModified: g.updated, mainEntityOfPage: url, author: { "@type": "Organization", name: SITE_NAME }, publisher: { "@type": "Organization", name: SITE_NAME } },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
        { "@type": "ListItem", position: 2, name: "Guides", item: `${SITE_URL}/guides` },
        { "@type": "ListItem", position: 3, name: g.h1, item: url },
      ],
    },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: g.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
  ];
  const others = GUIDES.filter((x) => x.slug !== g.slug);
  return (
    <article className="mx-auto max-w-3xl px-4 py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structured).replace(/</g, "\\u003c") }} />
      <nav aria-label="Breadcrumb" className="text-xs text-slate-500">
        <Link href="/" className="hover:text-brand-700">Home</Link> / <Link href="/guides" className="hover:text-brand-700">Guides</Link>
      </nav>
      <h1 className="mt-3 text-3xl font-extrabold leading-tight sm:text-4xl">{g.h1}</h1>
      <p className="mt-2 text-xs text-slate-500">Updated {new Date(`${g.updated}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}</p>
      <p className="mt-5 text-lg leading-relaxed text-slate-700">{g.intro}</p>

      <div className="mt-8 space-y-8">
        {g.sections.map((s) => (
          <section key={s.heading}>
            <h2 className="text-xl font-bold">{s.heading}</h2>
            {s.paragraphs?.map((p) => <p key={p} className="mt-2 leading-relaxed text-slate-700">{p}</p>)}
            {s.bullets ? (
              <ul className="mt-3 space-y-1.5">
                {s.bullets.map((b) => (
                  <li key={b} className="flex gap-2 text-slate-700"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />{b}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </div>

      <aside className="mt-10 rounded-2xl bg-gradient-to-br from-brand-600 to-violet-600 p-6 text-white shadow-[var(--shadow-lift)]">
        <p className="text-lg font-bold">Build your ATS-friendly resume free</p>
        <p className="mt-1 text-sm text-brand-100">Step-by-step builder, an ATS score that explains every point, and the exact PDF you preview.</p>
        <Link href="/register" className="btn mt-4 bg-white text-brand-700 hover:bg-brand-50">Start now <ArrowRight className="h-4 w-4" aria-hidden /></Link>
      </aside>

      <section className="mt-10" aria-labelledby="faq-h">
        <h2 id="faq-h" className="text-xl font-bold">Frequently asked questions</h2>
        <div className="mt-3 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
          {g.faq.map((f) => (
            <details key={f.q} className="group p-4">
              <summary className="cursor-pointer list-none font-semibold text-slate-900">{f.q}</summary>
              <p className="mt-2 text-slate-700">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="mt-10" aria-labelledby="more-h">
        <h2 id="more-h" className="flex items-center gap-2 text-lg font-bold"><BookOpen className="h-5 w-5 text-brand-600" aria-hidden /> More guides</h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-3">
          {others.map((o) => (
            <li key={o.slug}>
              <Link href={`/guides/${o.slug}`} className="card card-hover block h-full p-4 text-sm font-semibold text-slate-800">{o.h1}</Link>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}

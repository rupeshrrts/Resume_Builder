import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, BadgeCheck, Bold, Eye, Layers, LayoutTemplate, ScanSearch, ShieldCheck, Sparkles, Target, WandSparkles } from "lucide-react";
import { TEMPLATES } from "@resume/shared/render/templates";
import { backend, getCurrentUser } from "@/lib/server-api";
import type { PublicReview } from "@resume/shared/types/api";
import { Stars } from "@/components/ReviewCard";
import { BulletLab } from "@/components/landing/BulletLab";
import { DemoVideo } from "@/components/landing/DemoVideo";
import { MatchDemo } from "@/components/landing/MatchDemo";
import { TemplateShowcase } from "@/components/landing/TemplateShowcase";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { LogoMark } from "@/components/Logo";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL } from "@/lib/site";
import { GUIDES } from "@/content/guides";

const FEATURES = [
  { icon: Eye, title: "What you see is what you download", body: "The preview is the real PDF: same fonts, sizes and page breaks. Decide where a page ends, or fit everything on one page." },
  { icon: Bold, title: "Highlight what matters", body: "Bold key words or a whole point with one click. Clean templates with your choice of headings, colours and spacing." },
  { icon: ScanSearch, title: "ATS check with every score explained", body: "Finds what trips up applicant tracking systems, scores relevance, evidence and readability, and lists the fixes that matter most." },
  { icon: Target, title: "Match any job", body: "Paste a job description to see which required skills your resume shows evidence for, and which are missing." },
  { icon: WandSparkles, title: "Truthful AI rewriting", body: "Three writing styles, side-by-side changes, and questions for missing facts. New numbers or skills need your confirmation." },
  { icon: Layers, title: "One master, many versions", body: "Tailor a copy for each application without touching your master resume. Full version history with undo." },
];

const FAQ = [
  ["Will this guarantee I get shortlisted?", "No. Nobody can promise that honestly. Employers use different applicant tracking systems and people make the decisions. This tool helps you present real qualifications clearly and avoid common parsing problems."],
  ["Does the AI make things up?", "It's instructed to use only your material, and every suggestion is checked automatically. New figures, tools or names are flagged and can't be accepted until you confirm them. Missing metrics are asked for, not invented."],
  ["What happens to my uploaded resume?", "The file is read in memory to extract its text and is never stored. Only the sections you choose to save are kept, and you can download or delete all your data at any time."],
  ["Is it suited to Indian job applications?", "Yes. It understands Indian degrees, boards and CGPA, validates Indian phone numbers, and leaves out personal details like date of birth and marital status by default. You can switch to US, Europe or other markets."],
];

export const metadata: Metadata = {
  title: { absolute: SITE_TITLE },
  alternates: { canonical: "/" },
};

/** Structured data so search engines know this is a free web app, and can show the FAQ. */
const STRUCTURED_DATA = [
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Any (web browser)",
    inLanguage: "en-IN",
    offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
    featureList: FEATURES.map((f) => f.title),
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  },
];

export default async function Home() {
  if (await getCurrentUser()) redirect("/dashboard");
  // Reviews are a bonus: if the API is slow (e.g. waking up), show the page without them.
  const reviews = (await backend<{ reviews: PublicReview[] }>("/api/reviews/public", { timeoutMs: 2500 }).catch(() => null))?.reviews ?? [];
  return (
    <div className="overflow-x-clip">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA).replace(/</g, "\\u003c") }} />
      {/* Hero */}
      <section className="relative">
        {/* Colour wash and grid behind the hero */}
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
          <div className="bg-grid absolute inset-0" />
          <div className="absolute -left-32 top-10 h-96 w-96 rounded-full bg-brand-300/40 blur-3xl" />
          <div className="absolute right-0 top-0 h-[28rem] w-[28rem] rounded-full bg-fuchsia-300/30 blur-3xl" />
          <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-amber-200/40 blur-3xl" />
        </div>
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-12 lg:grid-cols-[0.95fr_1.1fr] lg:pt-20">
          <div className="animate-fade-up">
            <span className="eyebrow"><Sparkles className="h-3.5 w-3.5" aria-hidden /> Professional, ATS-friendly resumes</span>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.06] text-slate-900 sm:text-5xl lg:text-[3.5rem]">
              Build a resume that <span className="gradient-text animate-shimmer">gets read</span>, in minutes.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600">
              Fill in your details, bold the words that matter, check your ATS score, and download the exact PDF you previewed. Every score explained, nothing invented.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/register" className="btn-primary px-6 py-3 text-base">
                Build my resume free <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <a href="#try" className="btn-secondary px-6 py-3 text-base">
                <WandSparkles className="h-4 w-4 text-brand-600" aria-hidden /> Try it now
              </a>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
              {["Free to use", "No sign-up needed to try", "PDF & Word"].map((t) => (
                <li key={t} className="flex items-center gap-1.5"><BadgeCheck className="h-4 w-4 text-emerald-600" aria-hidden />{t}</li>
              ))}
            </ul>
          </div>
          <div className="animate-fade-up [animation-delay:120ms]">
            <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-700">
              <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" /></span>
              Watch: 20-second demo
            </p>
            <DemoVideo />
          </div>
        </div>
      </section>

      {/* Stats strip */}
      <section className="border-y border-slate-200/70 bg-white/70 backdrop-blur">
        <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-9 text-center md:grid-cols-4">
          {[
            [String(Object.keys(TEMPLATES).length), "ATS-safe templates"],
            ["6", "explained scores"],
            ["1:1", "preview matches the PDF"],
            ["0", "invented achievements"],
          ].map(([n, l]) => (
            <div key={l}>
              <dt className="sr-only">{l}</dt>
              <dd className="gradient-text font-display text-3xl font-extrabold sm:text-4xl">{n}</dd>
              <dd className="mt-1 text-sm text-slate-600">{l}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Try it yourself */}
      <section id="try" className="mx-auto grid max-w-6xl scroll-mt-20 items-center gap-10 px-4 py-20 lg:grid-cols-[1fr_1.05fr]">
        <div>
          <span className="eyebrow"><WandSparkles className="h-3.5 w-3.5" aria-hidden /> Try it yourself</span>
          <h2 className="mt-3 text-3xl font-extrabold sm:text-4xl">Turn a rough line into a strong bullet</h2>
          <p className="mt-3 text-slate-600">Type what you did in plain words. You get a clear, action-first bullet point using only your facts, and tips for what would make it stronger.</p>
          <p className="mt-4 flex items-center gap-1.5 text-sm font-medium text-emerald-700"><ShieldCheck className="h-4 w-4" aria-hidden /> Runs in your browser. Nothing you type here is sent anywhere.</p>
        </div>
        <div className="relative">
          <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-tr from-brand-200/60 via-violet-200/40 to-fuchsia-100/40 blur-2xl" aria-hidden />
          <BulletLab />
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold sm:text-4xl">Everything you need to apply with confidence</h2>
          <p className="mt-3 text-slate-600">Built around one idea: communicate what you&apos;ve actually done, as clearly as possible.</p>
        </div>
        <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <li key={title} className="card card-hover group p-6">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 via-violet-500 to-fuchsia-500 text-white shadow-md transition group-hover:scale-110 group-hover:rotate-3">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <h3 className="mt-4 text-lg font-bold">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{body}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-4 pb-20">
        <div className="mb-8 max-w-2xl">
          <h2 className="text-3xl font-extrabold">How it works</h2>
          <p className="mt-2 text-slate-600">Four steps from your current resume to a verified, tailored file.</p>
        </div>
        <HowItWorks />
      </section>

      {/* Match demo */}
      <section className="bg-gradient-to-b from-transparent via-brand-50/70 to-transparent py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mb-8 max-w-2xl">
            <span className="eyebrow"><Target className="h-3.5 w-3.5" aria-hidden /> Interactive</span>
            <h2 className="mt-3 text-3xl font-extrabold">See a job match, live</h2>
            <p className="mt-2 text-slate-600">Pick a sample job or paste your own. The score updates as you type, using the same documented rules as the app.</p>
          </div>
          <MatchDemo />
        </div>
      </section>

      {/* Templates */}
      <section id="templates" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20">
        <div className="mb-8 max-w-2xl">
          <span className="eyebrow"><LayoutTemplate className="h-3.5 w-3.5" aria-hidden /> Templates</span>
          <h2 className="mt-3 text-3xl font-extrabold">Clean designs that machines and people can read</h2>
          <p className="mt-2 text-slate-600">Switch templates, colours and type. This is a real render of the same layout engine that produces your PDF.</p>
        </div>
        <TemplateShowcase />
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-4 pb-20">
        <h2 className="mb-6 text-center text-3xl font-extrabold">Questions</h2>
        <div className="space-y-3">
          {FAQ.map(([q, a]) => (
            <details key={q} className="card group p-5 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                {q}
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition group-open:rotate-45" aria-hidden>+</span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Reviews the owner picked in the admin dashboard; hidden until there are some. */}
      {reviews.length ? (
        <section className="mx-auto max-w-6xl px-4 pb-16" aria-labelledby="reviews-h">
          <h2 id="reviews-h" className="text-2xl font-extrabold">What users say</h2>
          <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {reviews.map((r, i) => (
              <li key={i} className="card flex h-full flex-col p-5">
                <Stars value={r.rating} size="h-4 w-4" />
                <p className="mt-3 flex-1 text-slate-700">&ldquo;{r.comment}&rdquo;</p>
                <p className="mt-3 text-sm font-semibold text-slate-900">{r.name}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Guides (also how search engines find them) */}
      <section className="mx-auto max-w-6xl px-4 pb-16" aria-labelledby="guides-h">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 id="guides-h" className="text-2xl font-extrabold">Resume guides</h2>
          <Link href="/guides" className="text-sm font-semibold text-brand-700 hover:underline">All guides</Link>
        </div>
        <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {GUIDES.map((g) => (
            <li key={g.slug}>
              <Link href={`/guides/${g.slug}`} className="card card-hover block h-full p-5">
                <span className="block font-bold text-slate-900">{g.h1}</span>
                <span className="mt-2 block text-sm text-slate-600">{g.description}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-4 pb-20">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 via-brand-600 to-violet-600 px-6 py-14 text-center text-white shadow-[var(--shadow-lift)]">
          <div className="pointer-events-none absolute -left-10 -top-10 h-48 w-48 rounded-full bg-white/10 blur-2xl" aria-hidden />
          <div className="pointer-events-none absolute -bottom-16 right-0 h-64 w-64 rounded-full bg-fuchsia-400/20 blur-3xl" aria-hidden />
          <h2 className="relative text-3xl font-extrabold sm:text-4xl">Your next application deserves a clear resume.</h2>
          <p className="relative mx-auto mt-3 max-w-xl text-brand-100">Start from your existing file or a blank page. It takes a few minutes.</p>
          <Link href="/register" className="btn relative mt-7 bg-white px-6 py-3 text-base text-brand-700 shadow-lg hover:bg-brand-50">
            Get started free <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </section>

      <footer className="border-t border-slate-200/70 bg-white/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-slate-500 sm:flex-row">
          <span className="flex items-center gap-2"><LogoMark size={20} /> Free ATS Resume Builder</span>
          <nav aria-label="Guides" className="flex flex-wrap justify-center gap-x-4 gap-y-1">
            {GUIDES.map((g) => <Link key={g.slug} href={`/guides/${g.slug}`} className="hover:text-brand-700">{g.title.split(":")[0]}</Link>)}
          </nav>
          <span>Scores are guidance, not a prediction of any employer&apos;s decision.</span>
        </div>
      </footer>
    </div>
  );
}

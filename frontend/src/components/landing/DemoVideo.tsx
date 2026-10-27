"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CheckCircle2, Download, FileText, Pause, Play, Sparkles } from "lucide-react";

/**
 * A 20-second "screen recording" of the app, drawn with HTML so it stays sharp at any size and
 * needs no video file. Plays only while on screen; stays still when the visitor prefers reduced motion.
 */

const SCENE_MS = 5000;
const SCENES = [
  { title: "Add your details", caption: "Type once; the resume fills itself in." },
  { title: "Write & bold key points", caption: "Strong bullets, with the words that matter in bold." },
  { title: "Check the ATS score", caption: "Every score explained, with the fixes that matter most." },
  { title: "Download the PDF", caption: "The exact file you saw, ready to send." },
] as const;
const TOTAL = SCENE_MS * SCENES.length;

const NAME = "Rupesh Kumar";
const ROLE = "Full Stack Developer | Java Spring Boot | Gen AI";
const BULLET_A = "Built a ";
const BULLET_BOLD = "RAG pipeline for log analysis";
const BULLET_B = " that cut debugging time by 40%.";
const CHECKS = ["Single-column, text-based layout", "Standard section headings", "Skills found in your experience", "No tables, images or text boxes"];

/** The part of `text` typed by time `t`, typing from `start` over `dur` ms. */
const typed = (text: string, t: number, start: number, dur: number) => text.slice(0, Math.max(0, Math.min(text.length, Math.round(((t - start) / dur) * text.length))));
const between = (t: number, a: number, b: number) => Math.max(0, Math.min(1, (t - a) / (b - a)));

export function DemoVideo() {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [visible, setVisible] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const last = useRef<number | null>(null);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setPlaying(false);
      setT(SCENE_MS * 2 + 4000);
    }
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!playing || !visible) {
      last.current = null;
      return;
    }
    let raf = 0;
    const tick = (now: number) => {
      if (last.current !== null) setT((x) => (x + now - last.current!) % TOTAL);
      last.current = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, visible]);

  const scene = Math.min(SCENES.length - 1, Math.floor(t / SCENE_MS));
  const s1 = 0;
  const s2 = SCENE_MS;
  const s3 = SCENE_MS * 2;
  const s4 = SCENE_MS * 3;

  // What the résumé on the right shows, built up across scenes.
  const name = t >= s2 ? NAME : typed(NAME, t, s1 + 300, 1400);
  const role = t >= s2 ? ROLE : typed(ROLE, t, s1 + 1900, 2200);
  const bulletLen = BULLET_A.length + BULLET_BOLD.length + BULLET_B.length;
  const bulletTyped = t >= s3 ? bulletLen : Math.round(bulletLen * between(t, s2 + 300, s2 + 3000));
  const boldOn = t >= s2 + 3700;
  const score = Math.round(94 * between(t, s3 + 300, s3 + 2600));
  const checksShown = t >= s4 ? CHECKS.length : Math.floor(between(t, s3 + 800, s3 + 4200) * CHECKS.length + 0.001);
  const clicked = t >= s4 + 2300;
  const toast = t >= s4 + 2600;

  // The cursor glides to whatever the current scene is pointing at.
  const cursor =
    scene === 0 ? (t < s1 + 1900 ? { x: 30, y: 33 } : { x: 30, y: 52 }) : scene === 1 ? (boldOn ? { x: 17, y: 77 } : { x: 34, y: 63 }) : scene === 2 ? { x: 24, y: 45 } : clicked ? { x: 88, y: 7 } : { x: 70, y: 40 };

  const bulletText = (() => {
    let left = bulletTyped;
    const take = (s: string) => {
      const out = s.slice(0, Math.max(0, left));
      left -= s.length;
      return out;
    };
    return { a: take(BULLET_A), bold: take(BULLET_BOLD), b: take(BULLET_B) };
  })();

  return (
    <div ref={box} className="relative">
      <div className="pointer-events-none absolute -inset-8 -z-10 rounded-[2.5rem] bg-gradient-to-tr from-brand-400/40 via-fuchsia-300/30 to-amber-200/40 blur-3xl" aria-hidden />
      <figure
        className="overflow-hidden rounded-2xl border border-white/60 bg-slate-900 shadow-[0_30px_80px_-20px_rgb(49_46_129/0.55)] ring-1 ring-slate-900/10"
        aria-label="Animated demo of building a resume: adding details, writing a bullet, checking the ATS score and downloading the PDF"
      >
        {/* Window bar */}
        <div className="flex items-center gap-2 bg-slate-800/90 px-4 py-2.5">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840]" />
          <span className="ml-3 hidden flex-1 truncate rounded-md bg-slate-700/70 px-3 py-1 text-center text-[11px] text-slate-300 sm:block">resumebuilder.app/editor</span>
        </div>

        {/* Screen */}
        <div className="relative aspect-[16/11] select-none bg-gradient-to-br from-slate-50 to-brand-50 text-slate-800 sm:aspect-[16/10]" aria-hidden>
          <div className="absolute inset-0 grid grid-cols-[1fr_1.05fr] gap-3 p-3 sm:gap-4 sm:p-5">
            {/* Left: the app panel for the current scene */}
            <div className="flex flex-col gap-2 overflow-hidden rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200 sm:p-4">
              <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-brand-700 sm:text-xs">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-[10px] text-white">{scene + 1}</span>
                {SCENES[scene].title}
              </p>
              {scene === 0 ? (
                <div className="mt-1 space-y-2.5">
                  <Field label="Full name" value={typed(NAME, t, s1 + 300, 1400)} active={t < s1 + 1900} />
                  <Field label="Headline" value={typed(ROLE, t, s1 + 1900, 2200)} active={t >= s1 + 1900} />
                  <Field label="Email" value="rupesh@example.com" />
                </div>
              ) : null}
              {scene === 1 ? (
                <div className="mt-1 space-y-2">
                  <p className="text-[9px] font-semibold text-slate-500 sm:text-[11px]">Bullet point</p>
                  <div className="min-h-[3.6em] rounded-lg border border-brand-400 bg-white p-2 text-[10px] leading-snug ring-4 ring-brand-100 sm:text-xs">
                    {bulletText.a}
                    <span className={boldOn ? "font-bold" : t >= s2 + 3100 ? "rounded bg-brand-200/80" : ""}>{bulletText.bold}</span>
                    {bulletText.b}
                    {t < s3 && bulletTyped < bulletLen ? <span className="ml-px inline-block h-3 w-px animate-pulse bg-slate-800 align-middle" /> : null}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`flex h-6 min-w-6 items-center justify-center rounded border text-[11px] font-bold transition ${boldOn || t >= s2 + 3500 ? "border-brand-500 bg-brand-600 text-white" : "border-slate-200 bg-white text-slate-700"}`}>B</span>
                    <span className="text-[9px] text-slate-500 sm:text-[11px]">select words · press B</span>
                  </div>
                </div>
              ) : null}
              {scene === 2 ? (
                <div className="mt-1 flex items-center gap-3">
                  <Ring value={score} />
                  <ul className="space-y-1">
                    {CHECKS.map((c, i) => (
                      <li key={c} className={`flex items-center gap-1 text-[9px] transition-opacity duration-300 sm:text-[11px] ${i < checksShown ? "opacity-100" : "opacity-0"}`}>
                        <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-600" /> {c}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {scene === 3 ? (
                <div className="mt-1 space-y-2 text-[10px] sm:text-xs">
                  <p className="text-slate-600">Your resume is ready.</p>
                  <div className="flex gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 font-semibold text-white transition ${clicked ? "scale-95 bg-brand-800" : "bg-brand-600"}`}>
                      <Download className="h-3 w-3" /> PDF
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 font-semibold">Word</span>
                  </div>
                  <div className={`flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2 py-1.5 font-semibold text-emerald-800 ring-1 ring-emerald-200 transition-all duration-300 ${toast ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}>
                    <FileText className="h-3.5 w-3.5" /> Rupesh_Kumar_Resume.pdf <Check className="h-3.5 w-3.5" />
                  </div>
                </div>
              ) : null}
            </div>

            {/* Right: the résumé page building up live */}
            <div className="overflow-hidden rounded-lg bg-white p-3 text-[7px] leading-[1.35] shadow-lg ring-1 ring-slate-200 sm:p-4 sm:text-[9px]">
              <p className="text-center text-[11px] font-extrabold uppercase tracking-wide text-slate-900 sm:text-[15px]">{name || <span className="text-slate-300">YOUR NAME</span>}</p>
              <p className="mt-0.5 min-h-[1.35em] text-center font-bold text-slate-800">{role}</p>
              <p className="text-center text-slate-500">
                Siwan, Bihar | <span className="text-[#0563c1] underline">LinkedIn</span> | <span className="text-[#0563c1] underline">GitHub</span>
              </p>
              <Section title="Summary" shown={t >= s1 + 4200}>
                Full Stack Developer with 2+ years building enterprise web apps and Generative AI features.
              </Section>
              <Section title="Technical skills" shown={t >= s1 + 4500}>
                <b>Languages:</b> Java, Python, TypeScript, SQL
              </Section>
              <Section title="Experience" shown={t >= s2}>
                <p className="flex justify-between">
                  <span><b>Software Engineer</b> — Godrej Koerber</span>
                  <i className="text-slate-500">2025 – Present</i>
                </p>
                <p className="flex gap-1">
                  <span>•</span>
                  <span>
                    {bulletText.a}
                    <span className={boldOn ? "font-bold" : ""}>{bulletText.bold}</span>
                    {bulletText.b}
                  </span>
                </p>
              </Section>
              <Section title="Projects" shown={t >= s3 + 2600}>
                <p className="flex justify-between">
                  <span><b className="text-[#0563c1] underline">AgentShieldAI</b> — AI browser security</span>
                  <i className="text-slate-500">Oct 2026</i>
                </p>
              </Section>
            </div>
          </div>

          {/* Cursor */}
          <svg
            className="absolute h-5 w-5 drop-shadow transition-all duration-700 ease-in-out"
            style={{ left: `${cursor.x}%`, top: `${cursor.y}%` }}
            viewBox="0 0 24 24"
          >
            <path d="M4 2l16 9-7 2-3 7z" fill="#111827" stroke="white" strokeWidth="1.5" />
          </svg>
          {clicked && t < s4 + 2900 ? <span className="absolute h-8 w-8 -translate-x-1.5 -translate-y-1.5 animate-ping rounded-full bg-brand-400/60" style={{ left: "88%", top: "7%" }} /> : null}
        </div>

        {/* Player controls */}
        <figcaption className="flex items-center gap-3 bg-slate-900 px-3 py-2.5 text-white sm:px-4">
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/20"
            aria-label={playing ? "Pause demo" : "Play demo"}
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-px" />}
          </button>
          <div className="flex flex-1 gap-1.5">
            {SCENES.map((sc, i) => (
              <button
                key={sc.title}
                type="button"
                onClick={() => {
                  setT(i * SCENE_MS);
                  setPlaying(true);
                }}
                className="group flex-1 text-left"
                aria-label={`Jump to: ${sc.title}`}
              >
                <span className="block h-1 overflow-hidden rounded-full bg-white/15">
                  <span className="block h-full rounded-full bg-gradient-to-r from-brand-400 to-fuchsia-400" style={{ width: `${Math.round(between(t, i * SCENE_MS, (i + 1) * SCENE_MS) * 100)}%` }} />
                </span>
                <span className={`mt-1 hidden truncate text-[10px] font-medium transition sm:block ${i === scene ? "text-white" : "text-white/45 group-hover:text-white/70"}`}>{sc.title}</span>
              </button>
            ))}
          </div>
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-white/60">0:{String(Math.floor(t / 1000)).padStart(2, "0")} / 0:20</span>
        </figcaption>
      </figure>
      <p className="mt-3 flex items-center justify-center gap-1.5 text-sm text-slate-600">
        <Sparkles className="h-4 w-4 text-brand-600" aria-hidden /> {SCENES[scene].caption}
      </p>
    </div>
  );
}

function Field({ label, value, active = false }: { label: string; value: string; active?: boolean }) {
  return (
    <div>
      <p className="text-[9px] font-semibold text-slate-500 sm:text-[11px]">{label}</p>
      <div className={`truncate rounded-md border bg-white px-2 py-1 text-[10px] sm:text-xs ${active ? "border-brand-400 ring-4 ring-brand-100" : "border-slate-200"}`}>
        {value || " "}
        {active ? <span className="ml-px inline-block h-3 w-px animate-pulse bg-slate-800 align-middle" /> : null}
      </div>
    </div>
  );
}

function Section({ title, shown, children }: { title: string; shown: boolean; children: React.ReactNode }) {
  return (
    <div className={`mt-1.5 transition-all duration-500 sm:mt-2 ${shown ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"}`}>
      <p className="border-b border-[#1f3864] pb-px text-[8px] font-bold uppercase tracking-wide text-slate-900 sm:text-[10px]">{title}</p>
      <div className="mt-0.5 space-y-0.5">{children}</div>
    </div>
  );
}

function Ring({ value }: { value: number }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-14 w-14 shrink-0 sm:h-16 sm:w-16">
      <svg viewBox="0 0 56 56" className="h-full w-full -rotate-90">
        <circle cx="28" cy="28" r={r} fill="none" stroke="#e2e8f0" strokeWidth="6" />
        <circle cx="28" cy="28" r={r} fill="none" stroke="url(#ring)" strokeWidth="6" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} />
        <defs>
          <linearGradient id="ring" x1="0" x2="1">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#6366f1" />
          </linearGradient>
        </defs>
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-sm font-extrabold leading-none sm:text-base">{value}</span>
        <span className="text-[8px] text-slate-500">ATS</span>
      </span>
    </div>
  );
}

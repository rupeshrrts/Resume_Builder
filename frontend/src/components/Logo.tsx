/**
 * The "AI sparkle" mark: a folded resume page with two sparkles on a white tile, framed in purple.
 * Same drawing as brand/logo-white-on-purple.svg and app/icon.svg.
 */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <defs>
        <linearGradient id="logo-frame" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#4338ca" />
          <stop offset=".55" stopColor="#4f46e5" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="9" fill="url(#logo-frame)" />
      <g transform="translate(4 4)">
        <rect width="32" height="32" rx="7.5" fill="#fff" />
        <path d="M10.6 7h5.9l3.5 3.5v11.9a1.6 1.6 0 0 1-1.6 1.6h-7.8A1.6 1.6 0 0 1 9 22.4V8.6A1.6 1.6 0 0 1 10.6 7z" fill="#4f46e5" />
        <path d="M16.5 7v2.3a1.2 1.2 0 0 0 1.2 1.2H20z" fill="#a5b4fc" />
        <rect x="11.3" y="12.3" width="5" height="1.6" rx=".8" fill="#fff" />
        <rect x="11.3" y="15.4" width="6.4" height="1.3" rx=".65" fill="#c7d2fe" />
        <rect x="11.3" y="18.2" width="4.6" height="1.3" rx=".65" fill="#c7d2fe" />
        <path d="M24 6c.4 2.6 1 3.2 3.6 3.6-2.6.4-3.2 1-3.6 3.6-.4-2.6-1-3.2-3.6-3.6C23 9.2 23.6 8.6 24 6z" fill="#f59e0b" />
        <path d="M25.8 20.6c.2 1.4.6 1.8 2 2-1.4.2-1.8.6-2 2-.2-1.4-.6-1.8-2-2 1.4-.2 1.8-.6 2-2z" fill="#f59e0b" />
      </g>
    </svg>
  );
}

/** `compact`: on small phones show only the mark, leaving room for the signed-in icon bar. `onDark`: light text for a dark background. */
export function Logo({ compact = false, onDark = false }: { compact?: boolean; onDark?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <span className={`flex rounded-[9px] ${onDark ? "shadow-[0_4px_12px_-3px_rgb(15_23_42/0.4)] ring-1 ring-white/30" : ""}`}><LogoMark size={32} /></span>
      <span className={`whitespace-nowrap font-display text-[15px] font-bold tracking-tight ${onDark ? "text-white" : "text-slate-900"} ${compact ? "max-sm:sr-only" : ""}`}>
        Free<span className={onDark ? "text-violet-200" : "text-violet-700"}>ATS</span> Resume
      </span>
    </span>
  );
}

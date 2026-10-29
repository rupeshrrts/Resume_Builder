/** The "AI sparkle" mark: a folded resume page with two sparkles on a violet tile. Same drawing as brand/logo.svg. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <defs>
        <linearGradient id="logo-tile" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#6d28d9" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="7.5" fill="url(#logo-tile)" />
      <path d="M10.6 7h5.9l3.5 3.5v11.9a1.6 1.6 0 0 1-1.6 1.6h-7.8A1.6 1.6 0 0 1 9 22.4V8.6A1.6 1.6 0 0 1 10.6 7z" fill="#fff" />
      <path d="M16.5 7v2.3a1.2 1.2 0 0 0 1.2 1.2H20z" fill="#ddd6fe" />
      <rect x="11.3" y="12.3" width="5" height="1.6" rx=".8" fill="#7c3aed" />
      <rect x="11.3" y="15.4" width="6.4" height="1.3" rx=".65" fill="#ddd6fe" />
      <rect x="11.3" y="18.2" width="4.6" height="1.3" rx=".65" fill="#ddd6fe" />
      <path d="M24 6c.4 2.6 1 3.2 3.6 3.6-2.6.4-3.2 1-3.6 3.6-.4-2.6-1-3.2-3.6-3.6C23 9.2 23.6 8.6 24 6z" fill="#fde68a" />
      <path d="M25.8 20.6c.2 1.4.6 1.8 2 2-1.4.2-1.8.6-2 2-.2-1.4-.6-1.8-2-2 1.4-.2 1.8-.6 2-2z" fill="#fde68a" />
    </svg>
  );
}

/** `compact`: on small phones show only the mark, leaving room for the signed-in icon bar. */
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <LogoMark />
      <span className={`whitespace-nowrap font-display text-[15px] font-bold tracking-tight text-slate-900 ${compact ? "max-sm:sr-only" : ""}`}>
        Free<span className="text-violet-700">ATS</span> Resume
      </span>
    </span>
  );
}

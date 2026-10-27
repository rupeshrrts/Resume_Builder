export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <defs>
        <linearGradient id="lg-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset="1" stopColor="#a855f7" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#lg-mark)" />
      <rect x="9" y="8" width="14" height="2.6" rx="1.3" fill="#fff" />
      <rect x="9" y="13.2" width="10" height="2" rx="1" fill="#fff" opacity=".75" />
      <rect x="9" y="17.4" width="12" height="2" rx="1" fill="#fff" opacity=".75" />
      <path d="M9 23.2l2.6 2.4 4.6-5" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <LogoMark />
      <span className="font-display text-[15px] font-bold tracking-tight text-slate-900">
        Resume<span className="text-brand-600"> Builder</span>
      </span>
    </span>
  );
}

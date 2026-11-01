import { ImageResponse } from "next/og";
import { SITE_NAME } from "@/lib/site";

// The picture shown when the site's link is shared on WhatsApp, LinkedIn, X and similar.
export const alt = `${SITE_NAME}: make an ATS-friendly resume online`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: "linear-gradient(135deg, #eef2ff 0%, #ffffff 45%, #fae8ff 100%)",
          fontFamily: "sans-serif",
          color: "#0f172a",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          {/* Same drawing as LogoMark in components/Logo.tsx. */}
          <svg width="76" height="76" viewBox="0 0 40 40">
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
          <div style={{ fontSize: 34, fontWeight: 700 }}>{SITE_NAME}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ fontSize: 68, fontWeight: 800, lineHeight: 1.08, letterSpacing: -1.5, display: "flex", flexWrap: "wrap" }}>
            Build an ATS-friendly resume&nbsp;<span style={{ color: "#4f46e5" }}>in minutes.</span>
          </div>
          <div style={{ fontSize: 30, color: "#475569", lineHeight: 1.35 }}>
            Step-by-step builder · ATS score with every point explained · Exact PDF download
          </div>
        </div>

        <div style={{ display: "flex", gap: 14 }}>
          {["100% free", "No fake content", "Made for freshers & pros"].map((t) => (
            <div key={t} style={{ fontSize: 24, fontWeight: 600, color: "#3730a3", background: "#e0e7ff", borderRadius: 999, padding: "10px 22px" }}>
              {t}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}

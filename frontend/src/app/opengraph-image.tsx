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
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 18,
              background: "linear-gradient(135deg, #6366f1, #a855f7)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              padding: "0 16px",
              gap: 6,
            }}
          >
            <div style={{ height: 6, width: 30, borderRadius: 3, background: "#fff" }} />
            <div style={{ height: 5, width: 22, borderRadius: 3, background: "rgba(255,255,255,0.75)" }} />
            <div style={{ height: 5, width: 26, borderRadius: 3, background: "rgba(255,255,255,0.75)" }} />
          </div>
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

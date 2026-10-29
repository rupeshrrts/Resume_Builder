import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { EB_Garamond, IBM_Plex_Sans, Inter, Merriweather, Plus_Jakarta_Sans, Source_Sans_3, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { getCurrentUser } from "@/lib/server-api";
import { NavLinks } from "@/components/NavLinks";
import { PageViewTracker } from "@/components/PageViewTracker";
import { Logo } from "@/components/Logo";
import { SITE_DESCRIPTION, SITE_KEYWORDS, SITE_NAME, SITE_TITLE, SITE_URL } from "@/lib/site";

const body = Inter({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const heading = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-heading", weight: ["600", "700", "800"], display: "swap" });
// Resume typefaces for the live preview (the PDF embeds the same families). Not preloaded: only the editor uses them.
// next/font needs literal options here, so each call is written out in full.
const rpSourceSans = Source_Sans_3({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, variable: "--font-rp-source-sans", weight: ["400", "600", "700"], style: ["normal", "italic"] });
const rpPlex = IBM_Plex_Sans({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, variable: "--font-rp-plex", weight: ["400", "600", "700"], style: ["normal", "italic"] });
const rpMerriweather = Merriweather({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, variable: "--font-rp-merriweather", weight: ["400", "700"], style: ["normal", "italic"] });
const rpSourceSerif = Source_Serif_4({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, variable: "--font-rp-source-serif", weight: ["400", "600", "700"], style: ["normal", "italic"] });
const rpGaramond = EB_Garamond({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, variable: "--font-rp-garamond", weight: ["400", "600", "700"], style: ["normal", "italic"] });
const resumeFonts = [rpSourceSans, rpPlex, rpMerriweather, rpSourceSerif, rpGaramond].map((f) => f.variable).join(" ");

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: `%s | ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  keywords: SITE_KEYWORDS,
  applicationName: SITE_NAME,
  openGraph: { type: "website", siteName: SITE_NAME, title: SITE_TITLE, description: SITE_DESCRIPTION, url: "/", locale: "en_IN" },
  twitter: { card: "summary_large_image", title: SITE_TITLE, description: SITE_DESCRIPTION },
  robots: { index: true, follow: true },
  formatDetection: { telephone: false, email: false, address: false },
  // Google Search Console's "HTML tag" check: set GOOGLE_SITE_VERIFICATION on Vercel to the code it gives you.
  ...(process.env.GOOGLE_SITE_VERIFICATION ? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION } } : {}),
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#4f46e5" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <html lang="en-IN" data-scroll-behavior="smooth" className={`${body.variable} ${heading.variable} ${resumeFonts}`}>
      <body className="min-h-screen font-sans antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:shadow">
          Skip to content
        </a>
        <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/75 backdrop-blur-xl">
          <div className="mx-auto flex h-14 max-w-[1500px] items-center justify-between gap-2 px-4">
            <Link href={user ? "/dashboard" : "/"} aria-label={`${SITE_NAME} home`}>
              <Logo compact={!!user} />
            </Link>
            <NavLinks signedIn={!!user} isAdmin={!!user?.isAdmin} />
          </div>
        </header>
        <main id="main">{children}</main>
        <PageViewTracker />
      </body>
    </html>
  );
}

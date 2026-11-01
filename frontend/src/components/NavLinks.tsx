"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Briefcase, ChartColumn, CloudUpload, LayoutDashboard, LogOut, MessagesSquare, UserRound } from "lucide-react";
import { api } from "@/lib/api-client";
import { UPLOAD_AND_AI_ANALYSIS } from "@/lib/features";

const LINKS: { href: string; label: string; icon: typeof LayoutDashboard; soon?: boolean }[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/applications", label: "Applications", icon: Briefcase },
  { href: "/interview", label: "Interview prep", icon: MessagesSquare },
  UPLOAD_AND_AI_ANALYSIS ? { href: "/import", label: "Import", icon: CloudUpload } : { href: "/import", label: "AI analysis", icon: CloudUpload, soon: true },
  { href: "/account", label: "Account", icon: UserRound },
];

/** The header is a purple gradient, so its plain links use light text. */
const darkLink = "h-9 items-center rounded-full px-3 text-sm font-medium text-white/85 transition hover:bg-white/15 hover:text-white";

export function NavLinks({ signedIn, isAdmin = false }: { signedIn: boolean; isAdmin?: boolean }) {
  const path = usePathname();
  if (!signedIn)
    return (
      <nav className="flex items-center gap-1" aria-label="Main">
        <Link href="/#features" className={`${darkLink} hidden sm:inline-flex`}>Features</Link>
        <Link href="/#templates" className={`${darkLink} hidden sm:inline-flex`}>Templates</Link>
        <Link href="/guides" className={`${darkLink} hidden sm:inline-flex`}>Guides</Link>
        <Link href="/login" className={`${darkLink} inline-flex`}>Sign in</Link>
        <Link href="/register" className="ml-1 inline-flex h-9 items-center rounded-full bg-white px-4 text-sm font-semibold text-brand-700 shadow-[0_4px_14px_-4px_rgb(15_23_42/0.35)] transition hover:-translate-y-px hover:bg-brand-50">Get started</Link>
      </nav>
    );
  return (
    <nav className="flex items-center gap-2" aria-label="Main">
      <div className="flex items-center gap-0.5 rounded-full border border-white/20 bg-white/10 p-1 shadow-[inset_0_1px_0_rgb(255_255_255/0.1)] backdrop-blur">
        {(isAdmin ? [...LINKS, { href: "/admin", label: "Admin", icon: ChartColumn }] : LINKS).map(({ href, label, icon: Icon, soon }) => {
          const active = path === href || (href === "/dashboard" && path.startsWith("/resumes"));
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`inline-flex h-9 items-center gap-1.5 rounded-full px-2.5 text-sm font-medium transition duration-200 sm:px-3.5 ${
                active
                  ? "bg-white font-semibold text-brand-700 shadow-[0_4px_14px_-4px_rgb(15_23_42/0.35)]"
                  : "text-white/85 hover:bg-white/15 hover:text-white"
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">{label}</span>
              <span className="sr-only sm:hidden">{label}</span>
              {soon ? <span className={`hidden rounded-full px-1.5 py-px text-[10px] font-semibold sm:inline ${active ? "bg-violet-100 text-violet-700" : "bg-white/20 text-white"}`}>Soon</span> : null}
            </Link>
          );
        })}
      </div>
      <button
        type="button"
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white/85 transition hover:border-white hover:bg-white hover:text-red-600"
        title="Sign out"
        onClick={async () => {
          await api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
          // Don't leave an unfinished guided-builder draft for the next person on this computer.
          try {
            localStorage.removeItem("rb-wizard-draft-v1");
          } catch {
            /* storage blocked */
          }
          window.location.href = "/";
        }}
      >
        <LogOut className="h-4 w-4" aria-hidden />
        <span className="sr-only">Sign out</span>
      </button>
    </nav>
  );
}

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

export function NavLinks({ signedIn, isAdmin = false }: { signedIn: boolean; isAdmin?: boolean }) {
  const path = usePathname();
  if (!signedIn)
    return (
      <nav className="flex items-center gap-1" aria-label="Main">
        <Link href="/#features" className="btn-ghost hidden sm:inline-flex">Features</Link>
        <Link href="/#templates" className="btn-ghost hidden sm:inline-flex">Templates</Link>
        <Link href="/guides" className="btn-ghost hidden sm:inline-flex">Guides</Link>
        <Link href="/login" className="btn-ghost">Sign in</Link>
        <Link href="/register" className="btn-primary">Get started</Link>
      </nav>
    );
  return (
    <nav className="flex items-center gap-0.5" aria-label="Main">
      {(isAdmin ? [...LINKS, { href: "/admin", label: "Admin", icon: ChartColumn }] : LINKS).map(({ href, label, icon: Icon, soon }) => {
        const active = path === href || (href === "/dashboard" && path.startsWith("/resumes"));
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`btn px-2.5 font-medium sm:px-3 ${active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}
          >
            <Icon className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">{label}</span>
            <span className="sr-only sm:hidden">{label}</span>
            {soon ? <span className="hidden rounded-full bg-violet-100 px-1.5 py-px text-[10px] font-semibold text-violet-700 sm:inline">Soon</span> : null}
          </Link>
        );
      })}
      <button
        type="button"
        className="btn-ghost px-2.5"
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

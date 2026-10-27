import { backend, requirePage } from "@/lib/server-api";
import { AccountPanel } from "@/components/AccountPanel";
import type { SessionUser } from "@resume/shared/types/api";

// Signed-in (or utility) page: kept out of search results.
export const metadata = { title: "Account", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const { user, canActivateAdmin } = await requirePage<{ user: SessionUser; canActivateAdmin: boolean }>("/api/auth/me");
  const features = await backend<{ email: boolean }>("/api/auth/features").catch(() => null);
  return <AccountPanel email={user.email} emailVerified={user.emailVerified} isAdmin={user.isAdmin} canActivateAdmin={canActivateAdmin} emailOn={!!features?.email} />;
}

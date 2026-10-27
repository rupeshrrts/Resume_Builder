import { ResetPassword } from "@/components/EmailLinkPages";

// The token is in the address, so the page mustn't leak it via search engines or the Referer header.
export const metadata = { title: "Choose a new password", robots: { index: false, follow: false }, referrer: "no-referrer" as const };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <ResetPassword token={typeof token === "string" ? token : ""} />;
}

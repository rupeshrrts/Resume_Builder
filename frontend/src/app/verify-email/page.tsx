import { VerifyEmail } from "@/components/EmailLinkPages";

export const metadata = { title: "Confirm your email", robots: { index: false, follow: false }, referrer: "no-referrer" as const };

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <VerifyEmail token={typeof token === "string" ? token : ""} />;
}

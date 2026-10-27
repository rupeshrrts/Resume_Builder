import { ForgotPassword } from "@/components/EmailLinkPages";

export const metadata = { title: "Forgot password", robots: { index: false, follow: true } };

// ?owner=1 (from the admin login page) opens the site-owner reset straight away.
export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ owner?: string }> }) {
  const { owner } = await searchParams;
  return <ForgotPassword owner={owner === "1"} />;
}

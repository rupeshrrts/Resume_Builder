import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { getCurrentUser } from "@/lib/server-api";

// Signed-in (or utility) page: kept out of search results.
export const metadata = { title: "Sign in", robots: { index: false, follow: false } };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  return <AuthForm mode="login" />;
}

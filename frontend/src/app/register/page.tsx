import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { getCurrentUser } from "@/lib/server-api";

export const metadata = {
  title: "Create your free account",
  description: "Sign up free and build an ATS-friendly resume in minutes: guided steps, clean templates, ATS score and PDF download.",
  alternates: { canonical: "/register" },
};

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  return <AuthForm mode="register" />;
}

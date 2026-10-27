import type { Metadata } from "next";
import { SharedResume } from "@/components/SharedResume";

export const metadata: Metadata = {
  title: "Shared resume",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function SharedResumePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SharedResume token={token} />;
}

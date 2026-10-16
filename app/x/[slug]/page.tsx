import type { Metadata } from "next";
import { Orbitron } from "next/font/google";
import { notFound } from "next/navigation";
import { slugMatches } from "@/lib/peek";
import { SignalBackdrop } from "./signal-chrome";
import { PeekViewer } from "./viewer";

// Squared-off display face for the headline and the big readout. Scoped to this
// route, so no other page pays for the download.
const orbitron = Orbitron({
  subsets: ["latin"],
  weight: ["600", "800"],
  variable: "--font-orbitron",
  display: "swap",
});

// Live data, and the slug is checked against the env at request time — never
// prerender or cache this.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Round Monitor",
  robots: { index: false, follow: false, nocache: true },
};

export default async function PeekPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // Unconfigured deployment or wrong slug → a plain 404. Nothing on this page
  // hints that the path pattern means anything.
  if (!slugMatches(slug)) notFound();

  return (
    <main
      className={`${orbitron.variable} relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#071018] px-4 py-8 text-white`}
    >
      <SignalBackdrop />
      <PeekViewer slug={slug} />
    </main>
  );
}

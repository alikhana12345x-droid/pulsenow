import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { AuthLink } from "@/components/auth/auth-link";

export const metadata: Metadata = {
  title: { template: "%s — PulseNow", default: "Legal — PulseNow" },
};

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#090714] font-[Inter,system-ui,sans-serif] text-[#f4f1ff]">

      {/* Sticky header */}
      <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-[#0d0b1e]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-3">
          <Link href="/">
            <Image
              src="/brand/logo.svg"
              alt="PulseNow"
              width={130}
              height={50}
              className="h-12 lg:h-15 w-auto object-contain"
            />
          </Link>

          <nav className="flex items-center gap-4 md:gap-6">
            {[
              ["Terms", "/legal/terms"],
              ["Privacy", "/legal/privacy"],
              ["Responsible Gambling", "/legal/responsible"],
            ].map(([label, href]) => (
              <Link
                key={href}
                href={href}
                className="text-[11px] text-white/38 transition-colors hover:text-white/75"
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      {/* Page content */}
      <main className="mx-auto max-w-3xl px-5 py-10 pb-24">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/[0.05] py-7 text-center">
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5">
          <Link href="/" className="text-[11px] text-white/28 transition-colors hover:text-white/60">← Home</Link>
          <AuthLink view="login" className="text-[11px] text-white/28 transition-colors hover:text-white/60">Login</AuthLink>
          <AuthLink view="signup" className="text-[11px] text-white/28 transition-colors hover:text-white/60">Sign Up</AuthLink>
          <span className="text-[11px] text-white/15">© 2025 PulseNow</span>
        </div>
      </footer>
    </div>
  );
}

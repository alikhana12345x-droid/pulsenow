import { HeroCanvas } from "@/components/landing/hero-canvas";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

type AuthPageShellProps = {
  children: ReactNode;
  eyebrow?: string;
  title: string;
  description: string;
  stats?: Array<[string, string]>;
  feed?: string[];
  actionHref?: string;
  actionLabel?: string;
  aligment?: any;
};

export function AuthPageShell({
  children,
  eyebrow = "Live Casino Floor",
  title,
  description,
  aligment,
  stats = [
    ["Live", "Tables"],
    ["Hot", "Rounds"],
    ["Fast", "Payouts"],
  ],
  feed = ["Table open", "Hot round", "Cashout ready"],
  actionHref = "/auth/login",
  actionLabel = "Login",
}: AuthPageShellProps) {
  return (
    <main className={`relative min-h-svh w-full overflow-hidden bg-bp-bg font-bp-ui text-bp-text`}>
      <div className="fixed inset-0 z-0">
        <HeroCanvas />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-bp-bg/45 via-bp-bg/15 to-bp-bg" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-bp-bg via-bp-bg/55 to-bp-bg/20" />
      </div>

      <header className="relative z-10 flex items-center justify-between px-5 py-4 md:px-10 md:py-5">
        <Link href="/" aria-label="PulseNow home">
          <Image
            src="/brand/logo.svg"
            alt="PulseNow"
            width={150}
            height={40}
            className="h-12 w-auto object-contain lg:h-15"
            priority
          />
        </Link>

        <Link
          href={actionHref}
          className="rounded-xl border border-bp-accent/25 bg-bp-accent/10 px-4 py-2 text-[13px] font-black text-bp-accent shadow-[0_0_22px_rgba(242,154,11,0.12)] transition-colors hover:bg-bp-accent/15"
        >
          {actionLabel}
        </Link>
      </header>

      <div className={
        `relative z-10 grid min-h-[calc(100svh-200px)] items-center gap-10 px-5 pb-10 md:grid-cols-[minmax(0,1fr)_420px] md:px-10 lg:px-16`
      }>
        <section className={`hidden max-w-2xl md:block ${aligment ? "-mt-28" : ""}`}>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-bp-accent/25 bg-bp-accent/10 px-4 py-1.5 backdrop-blur-sm">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-bp-accent" />
            <span className="text-[10px] font-bold uppercase tracking-[0.32em] text-bp-accent">
              {eyebrow}
            </span>
          </div>

          <h1 className="max-w-[620px] text-[clamp(3.25rem,7vw,6.8rem)] font-black leading-[0.92] tracking-tight">
            {title}
          </h1>
          <p className="mt-5 max-w-[430px] text-base font-medium leading-7 text-white/50">
            {description}
          </p>

          {/* <div className="mt-9 grid max-w-[560px] grid-cols-3 gap-3">
            {stats.map(([value, label]) => (
              <div
                key={label}
                className="group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.035] px-4 py-3 backdrop-blur-sm transition-colors hover:border-bp-accent/30"
              >
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-bp-accent/60 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                <p className="font-mono text-lg font-black text-bp-accent">
                  {value}
                </p>
                <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/28">
                  {label}
                </p>
              </div>
            ))}
          </div> */}

          <div className="mt-5 flex max-w-[560px] items-center gap-2 overflow-hidden rounded-2xl border border-white/[0.06] bg-black/20 px-4 py-3 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-white/38 backdrop-blur-sm">
            <span className="text-bp-win">Live</span>
            <span className="h-1 w-1 rounded-full bg-white/20" />
            {feed.map((item, index) => (
              <span
                key={item}
                className={index === 1 ? "text-bp-accent" : index === 2 ? "text-sky-300" : undefined}
              >
                {item}
              </span>
            ))}
          </div>
        </section>

        <div className="mx-auto w-full max-w-[420px]">
          {children}
          <p className="mt-5 text-center text-[10px] leading-relaxed text-white/22">
            18+ only. Play responsibly. Gambling can be addictive.
          </p>
        </div>
      </div>
    </main>
  );
}

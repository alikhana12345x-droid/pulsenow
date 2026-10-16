"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ChevronRight, Headphones, LayoutGrid, Menu, Search, Trophy, User, Users, X,
  type LucideIcon,
} from "lucide-react";
import { useFinanceDrawer } from "@/components/protected/finance-drawer-provider";
import { useAuthModal } from "@/components/auth/auth-modal-provider";
import type { GameSlug, RegistryGame } from "@/lib/games-catalogue";

const ACCOUNT_LINKS: { label: string; icon: LucideIcon; href: string }[] = [
  { label: "Bet Records", icon: Trophy, href: "/protected/profile?panel=records" },
  { label: "Invite & Earn", icon: Users, href: "/protected/invite" },
  { label: "Support", icon: Headphones, href: "/protected/support" },
  { label: "Profile", icon: User, href: "/protected/profile" },
];

export function LobbyHeader({
  email,
  isLoggedIn = true,
  games,
  onSelectGame,
  onHome,
}: {
  email?: string;
  isLoggedIn?: boolean;
  games: RegistryGame[];
  onSelectGame: (slug: GameSlug) => void;
  onHome: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [rendered, setRendered] = useState(false);
  const [search, setSearch] = useState("");
  const router = useRouter();
  const { openFinance, balance, currency } = useFinanceDrawer();
  const { openAuth } = useAuthModal();

  const openDrawer = () => {
    setRendered(true);
    requestAnimationFrame(() => requestAnimationFrame(() => setOpen(true)));
  };
  const closeDrawer = () => {
    setOpen(false);
    setTimeout(() => setRendered(false), 100);
  };

  // Protected destination → navigate when logged in, else open login modal.
  const goProtected = (href: string) => {
    if (isLoggedIn) router.push(href);
    else openAuth("login", { next: href });
  };

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const displayBalance =
    balance !== null
      ? balance.toLocaleString("en-PK", {
        minimumFractionDigits: balance >= 1_000 ? 0 : 2,
        maximumFractionDigits: balance >= 1_000 ? 0 : 2,
      })
      : "—";

  return (
    <>
      {/* ── Sticky header bar ──────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-30 border-b border-white/[0.06] bg-bp-bg/95 backdrop-blur-md"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="flex h-14 items-center gap-3 px-4">
          <button
            onClick={openDrawer}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <button onClick={onHome} className="flex flex-1 items-center gap-2" aria-label="Home">
            <Image
              src="/brand/logo.svg"
              alt="PulseNow"
              width={150}
              height={32}
              className="h-12 lg:h-15 w-auto object-contain"
              priority
            />
          </button>

          {isLoggedIn ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 rounded-xl border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5">
                <span className="font-bp-mono text-[9px] text-white/35">{currency}</span>
                {balance === null ? (
                  <span className="h-3 w-12 animate-pulse rounded bg-white/[0.08]" />
                ) : (
                  <span className="font-bp-mono text-[11px] font-bold tabular-nums text-bp-text">{displayBalance}</span>
                )}
              </div>
              <button
                onClick={() => openFinance("deposit")}
                className="rounded-xl bg-gradient-to-b from-bp-accent to-[#c97e08] px-3.5 py-1.5 font-bp-ui text-[12px] font-black text-[#1b1305] shadow-[0_2px_10px_rgba(242,154,11,0.35)] transition-opacity hover:opacity-90 active:scale-95"
              >
                Deposit
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => openAuth("login")}
                className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 font-bp-ui text-[12px] font-semibold text-white/70 transition-colors hover:border-white/20 hover:text-white"
              >
                Login
              </button>
              <button
                onClick={() => openAuth("signup")}
                className="rounded-xl bg-gradient-to-b from-bp-accent to-[#c97e08] px-3.5 py-1.5 font-bp-ui text-[12px] font-black text-[#1b1305] shadow-[0_2px_10px_rgba(242,154,11,0.35)] transition-opacity hover:opacity-90 active:scale-95"
              >
                Register
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ── Drawer + backdrop ──────────────────────────────────────────────── */}
      {rendered && (
        <div className="fixed inset-y-0 left-1/2 z-40 w-full max-w-[600px] -translate-x-1/2">
          <div
            onClick={closeDrawer}
            className={`absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-300 ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
          />

          <aside
            className={`absolute inset-y-0 left-0 z-10 flex w-[280px] flex-col overflow-hidden bg-bp-mid transition-transform duration-100 ease-in-out ${open ? "translate-x-0" : "-translate-x-full"}`}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-4 py-3.5">
              <Image
                src="/brand/logo.svg"
                alt="PulseNow"
                width={110}
                height={28}
                className="h-12 lg:h-15 w-auto object-contain"
              />
              <button
                onClick={closeDrawer}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-white/50 transition-colors hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="shrink-0 border-b border-white/[0.05] px-4 py-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
                <input
                  type="text"
                  placeholder="Search games…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-2xl border border-white/[0.06] bg-black/30 py-2.5 pl-9 pr-3 text-sm text-white/70 outline-none placeholder:text-white/25 focus:border-bp-accent/40"
                />
              </div>
            </div>

            <nav className="flex-1 overflow-y-auto px-3 py-3">
              <p className="mb-1.5 px-1 text-[9px] font-bold uppercase tracking-[2.5px] text-white/25">
                Games
              </p>
              {(() => {
                const q = search.trim().toLowerCase();
                // Only live games are listed — they're the only ones openGame will open.
                const liveGames = games.filter((g) => g.status === "live");
                const items: { label: string; emoji: string | null; slug: GameSlug | null }[] = [
                  { label: "All Games", emoji: null, slug: null },
                  ...liveGames.map((g) => ({ label: g.title, emoji: g.emoji, slug: g.slug })),
                ];
                const filtered = q ? items.filter((g) => g.label.toLowerCase().includes(q)) : items;
                return filtered.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-white/30">No games found</p>
                ) : filtered.map(({ label, emoji, slug }) => (
                  <button
                    key={label}
                    onClick={() => { closeDrawer(); if (slug) onSelectGame(slug); else onHome(); }}
                    className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-semibold text-white/65 transition-colors hover:bg-white/[0.04] hover:text-bp-text"
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.06] text-base">
                      {emoji ? <span>{emoji}</span> : <LayoutGrid className="h-3.5 w-3.5 text-white" />}
                    </div>
                    {label}
                  </button>
                ));
              })()}

              <div className="my-3 border-t border-white/[0.06]" />

              <p className="mb-1.5 px-1 text-[9px] font-bold uppercase tracking-[2.5px] text-white/25">
                Account
              </p>
              {ACCOUNT_LINKS.map(({ label, icon: Icon, href }) => (
                <button
                  key={label}
                  onClick={() => { closeDrawer(); goProtected(href); }}
                  className="flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-left text-sm font-semibold text-white/65 transition-colors hover:bg-white/[0.04] hover:text-bp-text"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.04]">
                      <Icon className="h-3.5 w-3.5 text-white/50" />
                    </div>
                    {label}
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-white/20" />
                </button>
              ))}
            </nav>

            <div className="shrink-0 border-t border-white/[0.06] px-4 py-3">
              {isLoggedIn ? (
                <>
                  {email && (
                    <p className="mb-2 truncate text-center text-[11px] text-white/25">{email}</p>
                  )}
                  <div className="flex items-center justify-between rounded-2xl border border-white/[0.06] bg-black/30 px-3 py-2.5">
                    <div>
                      <p className="text-[9px] uppercase tracking-[2px] text-white/35">Balance</p>
                      {balance === null ? (
                        <div className="mt-1 h-4 w-24 animate-pulse rounded bg-white/[0.08]" />
                      ) : (
                        <p className="font-bp-mono text-sm font-bold text-bp-text">
                          {currency}{" "}
                          {balance.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => { openFinance("deposit"); closeDrawer(); }}
                      className="rounded-xl bg-gradient-to-b from-bp-accent to-[#c97e08] px-3.5 py-1.5 font-bp-ui text-[12px] font-black text-[#1b1305] shadow-[0_2px_8px_rgba(242,154,11,0.35)]"
                    >
                      Deposit
                    </button>
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => { openAuth("login"); closeDrawer(); }}
                    className="rounded-xl border border-white/[0.08] bg-white/[0.04] py-2.5 font-bp-ui text-[13px] font-semibold text-white/70 transition-colors hover:border-white/20 hover:text-white"
                  >
                    Login
                  </button>
                  <button
                    onClick={() => { openAuth("signup"); closeDrawer(); }}
                    className="rounded-xl bg-gradient-to-b from-bp-accent to-[#c97e08] py-2.5 font-bp-ui text-[13px] font-black text-[#1b1305] shadow-[0_2px_8px_rgba(242,154,11,0.35)]"
                  >
                    Register
                  </button>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Wallet, ArrowDownToLine, ArrowUpFromLine, ShieldCheck, Lock } from "lucide-react";
import { playClick } from "@/lib/sound";
import { WITHDRAW_MIN_TOTAL_DEPOSIT, fmtPkr } from "@/lib/finance-limits";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { DepositSheet } from "@/components/deposit-sheet";
import { WithdrawSheet } from "@/components/withdraw-sheet";
import { BottomNav } from "../bottom-nav";
import { useWithdrawalWatcher } from "./use-withdrawal-watcher";

type FinanceView = "menu" | "deposit" | "withdraw";

interface WalletSummary {
  balance: number;
  currency: string;
  isLocked: boolean;
  totalDeposited: number;
}

interface FinanceDrawerContextValue {
  openFinance: (view?: FinanceView) => void;
  balance: number | null;
  currency: string;
  refresh: () => void;
  isLoggedIn: boolean;
}

const FinanceDrawerContext = createContext<FinanceDrawerContextValue | null>(null);

async function fetchWalletSummary(signal?: AbortSignal) {
  const response = await fetch("/api/wallet/summary", {
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    throw new Error("Unable to load wallet details");
  }

  return (await response.json()) as WalletSummary;
}

export function ProtectedFinanceProvider({
  children,
  isLoggedIn = true,
}: {
  children: React.ReactNode;
  isLoggedIn?: boolean;
}) {
  const [activeView, setActiveView] = useState<FinanceView | null>(null);
  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadSummary = async () => {
    // Never hit /api/wallet/summary for logged-out visitors (the public lobby)
    // — it would 401 and schedule an endless retry. Guards every caller
    // (mount, refresh, openFinance) in one place.
    if (!isLoggedIn) return;
    abortRef.current?.abort();
    if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }

    const controller = new AbortController();
    abortRef.current = controller;
    setLoadingSummary(true);
    setSummaryError(null);

    try {
      const data = await fetchWalletSummary(controller.signal);
      setSummary(data);
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
      setSummaryError(error instanceof Error ? error.message : "Unable to load wallet");
      // Auto-retry once after 4 s — covers transient DB hiccups
      retryTimerRef.current = setTimeout(() => void loadSummary(), 4000);
    } finally {
      if (!controller.signal.aborted) setLoadingSummary(false);
    }
  };

  useEffect(() => {
    // No ref guard — let React Strict Mode abort+remount naturally.
    // The AbortController prevents duplicate in-flight requests.
    // Skip entirely for logged-out visitors (the public lobby) — there's no
    // wallet to load and /api/wallet/summary would 401.
    if (isLoggedIn) void loadSummary();
    return () => {
      abortRef.current?.abort();
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [isLoggedIn]);

  // Toasts a payout once it has actually been sent, wherever the player is by then.
  useWithdrawalWatcher(isLoggedIn, () => void loadSummary());

  // Money can move while the player is looking elsewhere — an admin approving a
  // deposit, a payout refunded — so re-read the wallet when they come back.
  useEffect(() => {
    if (!isLoggedIn) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void loadSummary();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn]);

  const openFinance = (view: FinanceView = "menu") => {
    setActiveView(view);
    if (view !== "deposit") {
      void loadSummary();
    }
  };

  const closeFinance = () => {
    setActiveView(null);
    void loadSummary();
  };

  // Withdrawals unlock only after lifetime deposits reach the threshold.
  // While the summary is still loading we treat the player as eligible so the
  // tile doesn't flash a "locked" state that then disappears.
  const totalDeposited = summary?.totalDeposited ?? 0;
  const canWithdraw = !summary || totalDeposited >= WITHDRAW_MIN_TOTAL_DEPOSIT;
  const remainingToUnlock = Math.max(0, WITHDRAW_MIN_TOTAL_DEPOSIT - totalDeposited);

  return (
    <FinanceDrawerContext.Provider value={{ openFinance, balance: summary?.balance ?? null, currency: summary?.currency ?? "PKR", refresh: loadSummary, isLoggedIn }}>
      <div className="!pb-[70px] relative w-full max-w-[600px] flex flex-col m-auto">
        {children}
      </div>

      <BottomSheet
        open={activeView === "menu"}
        onClose={closeFinance}
        title="Wallet"
      >
        <div className="space-y-3 p-4 pb-[5rem]">
          {/* Balance card */}
          <div className="overflow-hidden rounded-[18px] border border-bp-accent/20 bg-[radial-gradient(circle_at_top_right,rgba(242,154,11,0.18),transparent_50%)] p-5"
            style={{ background: "radial-gradient(circle at top right, rgba(242,154,11,0.15), transparent 55%), #0d0b1e" }}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-bp-accent/80">
                  Wallet Balance
                </p>
                {summary ? (
                  <p className="mt-2 font-mono text-3xl font-black tracking-tight text-bp-text">
                    {summary.currency}{" "}
                    <span className="text-bp-accent">{summary.balance.toLocaleString("en-PK")}</span>
                  </p>
                ) : (
                  <div className="mt-2 h-9 w-40 animate-pulse rounded-full bg-white/10" />
                )}
                <p className="mt-2 text-xs text-white/35">
                  Deposit or withdraw without leaving your page.
                </p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-[14px] border border-bp-accent/25 bg-bp-accent/10">
                <Wallet className="h-5 w-5 text-bp-accent" />
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => { playClick(); setActiveView("deposit"); }}
              className="rounded-[14px] border border-bp-accent/30 bg-bp-accent/8 p-4 text-left transition-all hover:border-bp-accent/55 hover:bg-bp-accent/12"
              style={{ background: "rgba(242,154,11,0.07)" }}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-bp-accent/25 bg-bp-accent/12 text-bp-accent"
                style={{ background: "rgba(242,154,11,0.12)" }}>
                <ArrowDownToLine className="h-4 w-4" />
              </div>
              <p className="mt-3 text-sm font-bold text-bp-text">Deposit</p>
              <p className="mt-0.5 text-[11px] text-white/40">
                Fund via online payment or crypto.
              </p>
            </button>

            <button
              type="button"
              onClick={() => { playClick(); setActiveView("withdraw"); }}
              disabled={loadingSummary || !canWithdraw}
              title={
                canWithdraw
                  ? undefined
                  : `Deposit PKR ${fmtPkr(WITHDRAW_MIN_TOTAL_DEPOSIT)} in total to unlock withdrawals`
              }
              className="rounded-[14px] border border-white/[0.07] p-4 text-left transition-all hover:border-white/[0.14] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-white/[0.07]"
              style={{ background: "rgba(255,255,255,0.03)" }}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-white/[0.08] text-white/50"
                style={{ background: "rgba(255,255,255,0.05)" }}>
                {canWithdraw ? <ArrowUpFromLine className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
              </div>
              <p className="mt-3 text-sm font-bold text-bp-text">Withdraw</p>
              <p className="mt-0.5 text-[11px] text-white/40">
                {canWithdraw
                  ? "Payout to JazzCash, Easypaisa, or crypto."
                  : `Locked — deposit PKR ${fmtPkr(remainingToUnlock)} more.`}
              </p>
            </button>
          </div>

          {/* Withdrawal eligibility progress — only while still locked */}
          {summary && !canWithdraw && (
            <div className="rounded-[14px] border border-bp-accent/20 p-4"
              style={{ background: "rgba(242,154,11,0.06)" }}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-bold text-bp-accent">Withdrawals locked</p>
                <p className="font-mono text-[11px] font-bold text-bp-accent/80">
                  {fmtPkr(totalDeposited)} / {fmtPkr(WITHDRAW_MIN_TOTAL_DEPOSIT)}
                </p>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                <div
                  className="h-full rounded-full bg-bp-accent transition-all"
                  style={{ width: `${Math.min(100, (totalDeposited / WITHDRAW_MIN_TOTAL_DEPOSIT) * 100)}%` }}
                />
              </div>
              <p className="mt-2 text-[11px] text-white/40">
                You need PKR {fmtPkr(WITHDRAW_MIN_TOTAL_DEPOSIT)} in total deposits to withdraw.
                Deposit PKR {fmtPkr(remainingToUnlock)} more to unlock.
              </p>
            </div>
          )}

          {/* Status/info row */}
          <div className="rounded-[14px] border border-white/[0.06] p-4" style={{ background: "rgba(255,255,255,0.02)" }}>
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-bp-win/20 bg-bp-win/10">
                <ShieldCheck className="h-4 w-4 text-bp-win" />
              </div>
              <div>
                <p className="text-xs font-bold text-bp-text">Secure wallet flow</p>
                <p className="mt-1 text-[11px] text-white/35">
                  Payment actions stay on screen — no page reloads.
                </p>
                {summary?.isLocked && (
                  <p className="mt-1.5 text-[11px] font-semibold text-bp-accent">
                    A withdrawal is already pending review.
                  </p>
                )}
                {summaryError && (
                  <p className="mt-1.5 text-[11px] text-bp-lose">{summaryError}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </BottomSheet>

      <DepositSheet
        open={activeView === "deposit"}
        onClose={closeFinance}
      />

      <BottomSheet
        open={activeView === "withdraw" && loadingSummary && !summary}
        onClose={closeFinance}
        title="Withdraw"
      >
        <div className="space-y-4 p-4 pb-[5rem]">
          <div className="rounded-2xl border border-border/70 bg-card/70 p-5">
            <div className="h-5 w-28 animate-pulse rounded-full bg-foreground/10" />
            <div className="mt-4 h-9 w-40 animate-pulse rounded-full bg-foreground/10" />
            <div className="mt-3 h-4 w-52 animate-pulse rounded-full bg-foreground/10" />
          </div>
        </div>
      </BottomSheet>

      <WithdrawSheet
        open={activeView === "withdraw" && !loadingSummary && !!summary}
        onClose={closeFinance}
        balance={summary?.balance ?? 0}
        totalDeposited={totalDeposited}
        onDeposit={() => setActiveView("deposit")}
      />

      <BottomNav isLoggedIn={isLoggedIn} />
    </FinanceDrawerContext.Provider>
  );
}

export function useFinanceDrawer() {
  const context = useContext(FinanceDrawerContext);

  if (!context) {
    throw new Error("useFinanceDrawer must be used within ProtectedFinanceProvider");
  }

  return context;
}

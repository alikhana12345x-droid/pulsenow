"use client";

import { useEffect, useRef, useState } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { PaymentMethodLogo } from "@/components/payment-method-logo";
import { useToast } from "@/components/ui/toast-provider";
import { useRouter } from "next/navigation";
import { Check, Lock, ShieldCheck, Wallet } from "lucide-react";
import { playClick } from "@/lib/sound";
import {
  trackWithdrawal,
  withdrawalSentToast,
  withdrawalSubmittedToast,
} from "@/lib/withdrawal-tracker";
import {
  MIN_WITHDRAWAL,
  MAX_WITHDRAWAL,
  WITHDRAW_MIN_TOTAL_DEPOSIT,
  fmtPkr,
} from "@/lib/finance-limits";

const SANDBOX = process.env.NEXT_PUBLIC_SANDBOX_MODE === "true";

const METHOD_META: Record<string, { label: string; placeholder: string }> = {
  jazzcash:    { label: "JazzCash",  placeholder: "03001234567" },
  easypaisa:   { label: "Easypaisa", placeholder: "03001234567" },
  crypto_usdt: { label: "USDT",      placeholder: "Wallet address" },
  crypto_eth:  { label: "ETH",       placeholder: "0x..." },
};
const inputCls = "w-full bg-white/[0.03] border border-white/[0.07] rounded-[12px] px-4 py-3 text-sm text-bp-text placeholder:text-white/25 focus:outline-none focus:border-bp-accent/50 transition-colors";

type Step = "form" | "submitting";

/**
 * While the request is in flight the sheet walks through what the server is
 * doing — checking, reserving the amount, handing it on. Each stage is shown
 * for at least a beat so a fast response doesn't flash the screen.
 */
const STAGE_AT_MS = [0, 700, 1500];
const MIN_SUBMIT_MS = 1800;
const CONFIRM_BEAT_MS = 450;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface WithdrawSheetProps {
  open: boolean;
  onClose: () => void;
  balance: number;
  /** Lifetime deposits — withdrawals stay locked below WITHDRAW_MIN_TOTAL_DEPOSIT. */
  totalDeposited?: number;
  /** Optional: switch the drawer over to the deposit flow from the locked screen. */
  onDeposit?: () => void;
}

export function WithdrawSheet({ open, onClose, balance, totalDeposited = 0, onDeposit }: WithdrawSheetProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [mode, setMode]               = useState<"manual" | "auto" | null>(null);
  const [availableMethods, setAvailableMethods] = useState<{ gateway: string; logo: string | null }[]>([]);
  const [method, setMethod]           = useState("jazzcash");
  const [amount, setAmount]           = useState("");
  const [destination, setDestination] = useState("");
  const [accountName, setAccountName] = useState("");
  const [error, setError]             = useState<string | null>(null);
  const [step, setStep]               = useState<Step>("form");
  const [submitStage, setSubmitStage] = useState(0);
  // Bumped on every reset, so a request still in flight when the sheet is
  // closed can tell it no longer owns the screen.
  const attemptRef = useRef(0);

  // Whatever the server says can actually be paid out right now: the admin's
  // enabled accounts in manual mode, the gateway's supported wallets in auto.
  const visibleMethods = availableMethods.map((a) => ({
    id: a.gateway,
    label: METHOD_META[a.gateway]?.label ?? a.gateway,
    placeholder: METHOD_META[a.gateway]?.placeholder ?? "Account / address",
    logo: a.logo,
  }));

  const selectedMethod =
    visibleMethods.find((m) => m.id === method) ??
    visibleMethods[0] ?? { id: "", label: "your account", placeholder: "Account / address", logo: null };

  const eligible = totalDeposited >= WITHDRAW_MIN_TOTAL_DEPOSIT;
  const remainingToUnlock = Math.max(0, WITHDRAW_MIN_TOTAL_DEPOSIT - totalDeposited);

  // Load payment mode + available withdrawal methods whenever the sheet opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/withdrawals/methods", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setMode(data.mode === "auto" ? "auto" : "manual");
        setAvailableMethods(Array.isArray(data.methods) ? data.methods : []);
      } catch { /* ignore transient errors */ }
    })();
    return () => { cancelled = true; };
  }, [open]);

  // Keep the selected method valid once the available list resolves.
  useEffect(() => {
    if (mode === null) return;
    const ids = visibleMethods.map((m) => m.id);
    if (ids.length && !ids.includes(method)) setMethod(ids[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, availableMethods]);

  const announceSent = (sent: { amount: number; methodLabel: string }) => {
    const t = withdrawalSentToast(sent);
    toast(t.message, "success", { description: t.description, duration: 7000 });
  };

  const reset = () => {
    attemptRef.current += 1;
    setMethod("jazzcash");
    setAmount("");
    setDestination("");
    setAccountName("");
    setError(null);
    setStep("form");
    setSubmitStage(0);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async () => {
    if (!eligible) {
      setError(`Withdrawals unlock after PKR ${fmtPkr(WITHDRAW_MIN_TOTAL_DEPOSIT)} in total deposits.`);
      return;
    }
    const amt = Number(amount);
    if (!amt || amt < MIN_WITHDRAWAL) { setError(`Minimum withdrawal is PKR ${fmtPkr(MIN_WITHDRAWAL)}.`); return; }
    if (amt > MAX_WITHDRAWAL)         { setError(`Maximum withdrawal is PKR ${fmtPkr(MAX_WITHDRAWAL)}.`); return; }
    if (amt > balance)       { setError("Amount exceeds your available balance."); return; }
    if (!destination.trim()) { setError(`Enter your ${selectedMethod.label} account or address.`); return; }
    // The gateway rejects a payout without a payee name, so it is required
    // wherever the payout is dispatched automatically.
    if (mode === "auto" && !accountName.trim()) { setError("Enter the account holder's name."); return; }

    const attempt = ++attemptRef.current;
    const live = () => attemptRef.current === attempt;
    const sent = { amount: amt, methodLabel: selectedMethod.label };

    setError(null);
    setSubmitStage(0);
    setStep("submitting");
    const stageTimers = STAGE_AT_MS.slice(1).map((at, i) =>
      setTimeout(() => { if (live()) setSubmitStage(i + 1); }, at)
    );
    const minShown = wait(MIN_SUBMIT_MS);

    // Back to the form with the reason, unless the sheet was closed meanwhile.
    const fail = (message: string) => {
      if (!live()) return;
      setStep("form");
      setError(message);
    };

    // Tick every stage off before moving on, so the hand-off reads as finished.
    const finishStages = async () => {
      if (!live()) return false;
      setSubmitStage(STAGE_AT_MS.length);
      await wait(CONFIRM_BEAT_MS);
      return live();
    };

    try {
      const res  = await fetch("/api/withdrawals/initiate", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          method,
          amount: amt,
          destination: destination.trim(),
          accountName: accountName.trim(),
        }),
      });
      const data = await res.json();
      await minShown;

      if (!res.ok) {
        fail(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      // Sandbox or instantly completed — the money is already out.
      if (data.sandbox || data.status === "completed") {
        router.refresh();
        if (await finishStages()) handleClose();
        announceSent(sent);
        return;
      }

      // Submitted and waiting to be paid out. There's nothing more for the
      // player to do here, so the sheet closes; the finance provider's watcher
      // posts the "sent" toast once it has actually been paid.
      trackWithdrawal({ id: data.withdrawalId, ...sent });
      if (await finishStages()) handleClose();
      const t = withdrawalSubmittedToast(sent);
      toast(t.message, "success", { description: t.description, duration: 6000 });

    } catch {
      await minShown;
      fail("Unable to reach payment service. Please check your connection and try again.");
    } finally {
      stageTimers.forEach(clearTimeout);
    }
  };

  const submitStages = [
    "Checking your details",
    `Reserving PKR ${fmtPkr(Number(amount) || 0)} from your balance`,
    mode === "auto" ? `Sending to ${selectedMethod.label}` : "Submitting your request",
  ];

  return (
    <BottomSheet open={open} onClose={handleClose} title="Withdraw">
      <div className="p-4 pb-[5rem] space-y-4">

        {SANDBOX && mode === "auto" && step === "form" && eligible && (
          <div className="rounded-[10px] border border-bp-accent/25 bg-bp-accent/10 py-2 text-center text-[11px] font-semibold text-bp-accent">
            SANDBOX — withdrawals complete instantly
          </div>
        )}

        {/* ── LOCKED (deposit threshold not met) ────────── */}
        {step === "form" && !eligible && totalDeposited <= 0 && (
          <div className="space-y-4">
            <div className="py-4 text-center space-y-3">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[16px] border border-bp-accent/25 bg-bp-accent/10">
                <Wallet className="h-7 w-7 text-bp-accent" />
              </div>
              <p className="text-base font-black text-bp-text">Make your first deposit</p>
              <p className="text-sm text-white/45">
                Deposit an amount to start withdrawing your winnings.
              </p>
            </div>

            {onDeposit && (
              <button
                onClick={() => { playClick(); onDeposit(); }}
                className="w-full h-12 rounded-[12px] bg-bp-accent text-[#1b1305] text-sm font-black uppercase tracking-wider shadow-[0_4px_18px_rgba(242,154,11,0.35)] hover:opacity-90 transition-opacity"
              >
                Deposit now
              </button>
            )}
          </div>
        )}

        {step === "form" && !eligible && totalDeposited > 0 && (
          <div className="space-y-4">
            <div className="py-2 text-center space-y-3">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[16px] border border-bp-accent/25 bg-bp-accent/10">
                <Lock className="h-7 w-7 text-bp-accent" />
              </div>
              <p className="text-base font-black text-bp-text">Withdrawals locked</p>
              <p className="text-sm text-white/45">
                You need <span className="font-bold text-bp-text">PKR {fmtPkr(WITHDRAW_MIN_TOTAL_DEPOSIT)}</span> in
                total deposits before you can withdraw.
              </p>
            </div>

            <div className="rounded-[14px] border border-white/[0.07] p-4"
              style={{ background: "rgba(255,255,255,0.02)" }}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Deposited so far</p>
                <p className="font-mono text-[11px] font-bold text-bp-accent">
                  {fmtPkr(totalDeposited)} / {fmtPkr(WITHDRAW_MIN_TOTAL_DEPOSIT)}
                </p>
              </div>
              <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                <div
                  className="h-full rounded-full bg-bp-accent transition-all"
                  style={{ width: `${Math.min(100, (totalDeposited / WITHDRAW_MIN_TOTAL_DEPOSIT) * 100)}%` }}
                />
              </div>
              <p className="mt-2.5 text-[11px] text-white/40">
                Deposit PKR {fmtPkr(remainingToUnlock)} more to unlock withdrawals.
              </p>
            </div>

            <div className="rounded-[14px] border border-white/[0.07] p-4"
              style={{ background: "rgba(255,255,255,0.02)" }}>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Available balance</p>
              <p className="mt-1 font-mono text-2xl font-black text-bp-accent">
                PKR {balance.toLocaleString()}
              </p>
            </div>

            {onDeposit && (
              <button
                onClick={() => { playClick(); onDeposit(); }}
                className="w-full h-12 rounded-[12px] bg-bp-accent text-[#1b1305] text-sm font-black uppercase tracking-wider shadow-[0_4px_18px_rgba(242,154,11,0.35)] hover:opacity-90 transition-opacity"
              >
                Deposit now
              </button>
            )}
          </div>
        )}

        {/* ── FORM ──────────────────────────────────────── */}
        {step === "form" && eligible && (
          <>
            {/* Balance */}
            <div
              className="rounded-[14px] border border-white/[0.07] p-4"
              style={{ background: "rgba(255,255,255,0.02)" }}
            >
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Available balance</p>
              <p className="mt-1 font-mono text-2xl font-black text-bp-accent">
                PKR {balance.toLocaleString()}
              </p>
            </div>

            {/* Method */}
            <div className="space-y-2.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Withdrawal method</p>
              {mode === null ? (
                <div className="grid grid-cols-2 gap-2">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className="h-12 animate-pulse rounded-[12px] border border-white/[0.06] bg-white/[0.03]" />
                  ))}
                </div>
              ) : visibleMethods.length === 0 ? (
                <div className="rounded-[12px] border border-white/[0.07] py-6 text-center text-sm text-white/50"
                  style={{ background: "rgba(255,255,255,0.02)" }}>
                  No withdrawal methods are available right now.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {visibleMethods.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => { playClick(); setMethod(m.id); setDestination(""); }}
                      className={`flex items-center justify-center gap-2 rounded-[12px] border py-3 text-sm font-bold transition-all
                        ${method === m.id
                          ? "border-bp-accent text-bp-accent shadow-[0_0_12px_rgba(242,154,11,0.15)]"
                          : "border-white/[0.07] text-white/55 hover:border-white/[0.14] hover:text-bp-text"
                        }`}
                      style={{ background: method === m.id ? "rgba(242,154,11,0.08)" : "rgba(255,255,255,0.02)" }}
                    >
                      <PaymentMethodLogo gateway={m.id} label={m.label} src={m.logo} size={24} />
                      {m.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Amount */}
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Amount (PKR)</p>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-white/35">PKR</span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={`${fmtPkr(MIN_WITHDRAWAL)} – ${fmtPkr(MAX_WITHDRAWAL)}`}
                  className={`${inputCls} pl-14`}
                />
              </div>
              {Number(amount) > 0 && Number(amount) <= balance && (
                <p className="text-[11px] text-white/30">
                  Balance after: PKR {(balance - Number(amount)).toLocaleString()}
                </p>
              )}
            </div>

            {/* Destination */}
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">
                {selectedMethod.label} account / address
              </p>
              <input
                type="text"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder={selectedMethod.placeholder}
                className={`${inputCls} font-mono`}
              />
            </div>

            {/* Account holder — the payout is rejected if this doesn't match */}
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">
                Account holder name
                {mode !== "auto" && <span className="ml-1 text-white/25">(optional)</span>}
              </p>
              <input
                type="text"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="Name registered on the account"
                className={inputCls}
              />
              <p className="text-[11px] text-white/30">
                Must match the name on your {selectedMethod.label} account.
              </p>
            </div>

            {error && (
              <div
                className="rounded-[10px] border border-bp-lose/20 px-3 py-2.5 text-xs font-semibold text-bp-lose"
                style={{ background: "rgba(255,93,115,0.07)" }}
              >
                {error}
              </div>
            )}

            <button
              disabled={!eligible || visibleMethods.length === 0}
              onClick={() => { playClick(); handleSubmit(); }}
              className="w-full h-12 rounded-[12px] bg-bp-accent text-[#1b1305] text-sm font-black uppercase tracking-wider shadow-[0_4px_18px_rgba(242,154,11,0.35)] hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              Request withdrawal
            </button>
          </>
        )}

        {/* ── SUBMITTING (request in flight) ────────────── */}
        {step === "submitting" && (
          <div className="py-4 space-y-5" aria-live="polite">
            <div className="flex flex-col items-center text-center">
              <div className="relative h-[88px] w-[88px]">
                {/* A spinning arc around the method's own logo. */}
                <svg
                  viewBox="0 0 88 88"
                  className="absolute inset-0 h-full w-full animate-spin [animation-duration:1.4s]"
                  aria-hidden
                >
                  <circle cx="44" cy="44" r="40" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
                  <circle
                    cx="44" cy="44" r="40" fill="none" stroke="#f29a0b" strokeWidth="4"
                    strokeLinecap="round" strokeDasharray="70 182"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <PaymentMethodLogo
                    gateway={selectedMethod.id}
                    label={selectedMethod.label}
                    src={selectedMethod.logo}
                    size={44}
                  />
                </div>
              </div>

              <p className="mt-4 text-base font-black text-bp-text">
                {submitStage >= submitStages.length ? "Request received" : "Processing your withdrawal"}
              </p>
              <p className="mt-1 font-mono text-2xl font-black text-bp-accent">
                PKR {fmtPkr(Number(amount) || 0)}
              </p>
              <p className="mt-1 max-w-full truncate text-xs text-white/40">
                to {selectedMethod.label} · <span className="font-mono">{destination}</span>
              </p>
            </div>

            <ol
              className="space-y-3 rounded-[14px] border border-white/[0.07] p-4"
              style={{ background: "rgba(255,255,255,0.02)" }}
            >
              {submitStages.map((label, i) => (
                <SubmitStage
                  key={i}
                  label={label}
                  state={i < submitStage ? "done" : i === submitStage ? "active" : "todo"}
                />
              ))}
            </ol>

            <p className="flex items-center justify-center gap-1.5 text-[11px] text-white/35">
              <ShieldCheck className="h-3.5 w-3.5 text-bp-win/70" />
              Secured — this only takes a moment
            </p>
          </div>
        )}

      </div>
    </BottomSheet>
  );
}

function SubmitStage({ label, state }: { label: string; state: "done" | "active" | "todo" }) {
  return (
    <li className="flex items-center gap-3">
      {state === "done" ? (
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bp-win/15 text-bp-win animate-in zoom-in-50 duration-200">
          <Check className="h-3.5 w-3.5" strokeWidth={3} />
        </span>
      ) : state === "active" ? (
        <span className="h-6 w-6 shrink-0 animate-spin rounded-full border-2 border-bp-accent/20 border-t-bp-accent" />
      ) : (
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/[0.1]">
          <span className="h-1.5 w-1.5 rounded-full bg-white/15" />
        </span>
      )}
      <span
        className={`text-sm transition-colors ${
          state === "active" ? "font-semibold text-bp-text" : state === "done" ? "text-white/60" : "text-white/30"
        }`}
      >
        {label}
      </span>
    </li>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { PaymentMethodLogo } from "@/components/payment-method-logo";
import { useRouter } from "next/navigation";
import { CheckCircle, XCircle, Copy, Check, Upload, Clock } from "lucide-react";
import { playClick } from "@/lib/sound";
import { compressImage } from "@/lib/image";
import { MIN_DEPOSIT, MAX_DEPOSIT, fmtPkr } from "@/lib/finance-limits";

const SANDBOX = process.env.NEXT_PUBLIC_SANDBOX_MODE === "true";

const GATEWAY_META: Record<string, { label: string; tab: "online" | "crypto" }> = {
  jazzcash: { label: "JazzCash", tab: "online" },
  easypaisa: { label: "Easypaisa", tab: "online" },
  crypto_usdt: { label: "USDT", tab: "crypto" },
  crypto_eth: { label: "ETH", tab: "crypto" },
};

const PRESETS = [ 2000,3000, 5000, 10000, 20000];

type Step = "method" | "amount" | "checkout" | "redirect" | "waiting" | "done" | "failed";

interface DepositMethod {
  id: string;
  gateway: string;
  label: string;
  account_title: string | null;
  account_number: string | null;
  wallet_address: string | null;
  network: string | null;
  logo: string | null;
  instructions: string | null;
}

/** Auto mode: a live gateway, and whether it needs a wallet number from us. */
interface AutoGateway {
  gateway: string;
  requiresAccount: boolean;
}

interface DepositSheetProps {
  open: boolean;
  onClose: () => void;
  includePaddingBottom?: boolean;
}

const inputCls = "w-full bg-white/[0.03] border border-white/[0.07] rounded-[12px] px-4 py-3 text-sm text-bp-text placeholder:text-white/25 focus:outline-none focus:border-bp-accent/50 transition-colors";

export function DepositSheet({ includePaddingBottom = true, open, onClose }: DepositSheetProps) {
  const router = useRouter();
  const [mode, setMode] = useState<"manual" | "auto" | null>(null);
  const [methods, setMethods] = useState<DepositMethod[]>([]);
  const [gateways, setGateways] = useState<AutoGateway[]>([]);
  const [tab, setTab] = useState<"online" | "crypto">("online");
  const [gateway, setGateway] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null); // manual: selected account
  const [amount, setAmount] = useState<number | "">("");
  const [custom, setCustom] = useState("");
  const [phone, setPhone] = useState("");
  const [step, setStep] = useState<Step>("method");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cryptoInfo, setCryptoInfo] = useState<{ address: string; network: string } | null>(null);
  // Auto flow: SolidPay hands back a hosted checkout URL to send the player to.
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);
  // Manual flow
  const [proof, setProof] = useState("");
  const [proofLoading, setProofLoading] = useState(false);
  const [senderRef, setSenderRef] = useState("");
  const [copied, setCopied] = useState(false);
  const proofInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const finalAmount = amount || Number(custom);
  const isCrypto = gateway?.startsWith("crypto");
  const isFiat = !isCrypto;

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  useEffect(() => () => stopPolling(), []);

  // Load the payment mode + available manual accounts whenever the sheet opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/deposits/methods", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const nextMode = data.mode === "auto" ? "auto" : "manual";
        const nextAccounts: DepositMethod[] = Array.isArray(data.accounts) ? data.accounts : [];
        const nextGateways: AutoGateway[] = Array.isArray(data.gateways) ? data.gateways : [];

        setMode(nextMode);
        setMethods(nextAccounts);
        setGateways(nextGateways);

        // Land on a tab that actually has methods behind it.
        const tabs = new Set<string>(
          (nextMode === "manual"
            ? nextAccounts.map((a) => a.gateway)
            : nextGateways.map((g) => g.gateway)
          ).map((g) => GATEWAY_META[g]?.tab ?? "online")
        );
        if (tabs.size && !tabs.has(tab)) setTab(tabs.has("online") ? "online" : "crypto");
      } catch { /* ignore transient errors */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const startPolling = (id: string) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/deposits/status/${id}`);
        const data = await res.json();
        if (data.status === "confirmed") { stopPolling(); setStep("done"); router.refresh(); }
        if (data.status === "failed" || data.status === "cancelled") { stopPolling(); setStep("failed"); }
      } catch { /* ignore transient errors */ }
    }, 3000);
  };

  const reset = () => {
    stopPolling();
    setTab("online"); setGateway(null); setAmount(""); setCustom(""); setPhone("");
    setStep("method"); setError(null); setCryptoInfo(null); setRedirectUrl(null);
    setProof(""); setProofLoading(false); setSenderRef(""); setCopied(false);
    setAccountId(null);
  };

  const handleClose = () => { reset(); onClose(); };

  // Manual: every active deposit account is its own selectable option (two
  // JazzCash numbers show as two cards). Auto: the fixed gateway list.
  const methodOptions =
    mode === "manual"
      ? methods.map((m) => ({
        key: m.id,
        gateway: m.gateway,
        label: GATEWAY_META[m.gateway]?.label ?? m.label,
        subtitle: m.account_title || m.account_number || m.wallet_address || null,
        tab: GATEWAY_META[m.gateway]?.tab ?? "online",
        logo: m.logo,
      }))
      : gateways.map(({ gateway: id }) => ({
        key: id,
        gateway: id,
        label: GATEWAY_META[id]?.label ?? id,
        subtitle: null as string | null,
        tab: GATEWAY_META[id]?.tab ?? "online",
        logo: null as string | null,
      }));

  const availableTabs = Array.from(new Set(methodOptions.map((m) => m.tab)));
  const visibleMethods = methodOptions.filter((m) => m.tab === tab);
  const selectedKey = mode === "manual" ? accountId : gateway;
  const selectedAccount = mode === "manual" ? (methods.find((m) => m.id === accountId) ?? null) : null;
  const gatewayLabel = gateway ? (GATEWAY_META[gateway]?.label ?? gateway) : "";
  // Only the direct-push channels need the wallet number from us — the hosted
  // cashier asks for it on its own page, so asking here as well is friction.
  const needsPhone =
    mode === "auto" &&
    !!gateway &&
    (gateways.find((g) => g.gateway === gateway)?.requiresAccount ?? false);

  const validateAmount = () => {
    if (!finalAmount) { setError("Enter an amount"); return false; }
    if (finalAmount < MIN_DEPOSIT) { setError(`Minimum deposit is PKR ${fmtPkr(MIN_DEPOSIT)}`); return false; }
    if (finalAmount > MAX_DEPOSIT) { setError(`Maximum deposit is PKR ${fmtPkr(MAX_DEPOSIT)}`); return false; }
    return true;
  };

  // Amount step "next" — manual goes to checkout, auto submits to the gateway.
  const handleAmountNext = () => {
    setError(null);
    if (!validateAmount()) return;
    if (mode === "manual") { setStep("checkout"); return; }
    if (needsPhone && !phone) { setError("Enter your mobile number"); return; }
    handleAutoSubmit();
  };

  const handleProofPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProofLoading(true); setError(null);
    try {
      setProof(await compressImage(file, { maxDim: 1280, quality: 0.6 }));
    } catch {
      setError("Could not process the screenshot. Try another image.");
    } finally {
      setProofLoading(false);
      e.target.value = "";
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };

  const handleManualSubmit = async () => {
    if (!gateway || !validateAmount()) return;
    if (!proof) { setError("Please attach your payment screenshot."); return; }

    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/deposits/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gateway, accountId, amount: finalAmount, proof, senderRef }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");

      setStep("waiting");
      startPolling(data.depositId);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleAutoSubmit = async () => {
    if (!gateway || !finalAmount) return;
    if (needsPhone && !phone) { setError("Enter your mobile number"); return; }

    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/deposits/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gateway, phone, amount: finalAmount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");

      if (data.sandbox || data.status === "confirmed") {
        setStep("done"); router.refresh(); return;
      }
      if (data.cryptoAddress) {
        setCryptoInfo({ address: data.cryptoAddress, network: data.network });
      }
      // Hosted checkout: keep polling here while the player pays in the tab
      // that opens, so this sheet flips to "done" the moment it confirms.
      if (data.redirectUrl) {
        setRedirectUrl(data.redirectUrl);
        setStep("redirect");
        startPolling(data.depositId);
        return;
      }
      setStep("waiting");
      startPolling(data.depositId);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={handleClose} title="Deposit">
      <div className={`p-4 space-y-4 ${includePaddingBottom ? "pb-[5rem]" : ""}`}>

        {SANDBOX && mode === "auto" && (
          <div className="rounded-[10px] border border-bp-accent/25 bg-bp-accent/10 py-2 text-center text-[11px] font-semibold text-bp-accent">
            SANDBOX — deposits confirm instantly, no real payment
          </div>
        )}

        {/* ── METHOD ─────────────────────────────────── */}
        {step === "method" && (
          <>
            {mode === null ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2.5">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-[66px] animate-pulse rounded-[12px] border border-white/[0.06] bg-white/[0.03]"
                    />
                  ))}
                </div>
                <div className="h-12 animate-pulse rounded-[12px] bg-white/[0.04]" />
              </div>
            ) : methodOptions.length === 0 ? (
              <div className="rounded-[12px] border border-white/[0.07] py-8 text-center text-sm text-white/50"
                style={{ background: "rgba(255,255,255,0.02)" }}>
                No deposit methods are available right now.<br />Please try again later or contact support.
              </div>
            ) : (
              <>
                {availableTabs.length > 1 && (
                  <div className="flex border-b border-white/[0.07]">
                    {(["online", "crypto"] as const)
                      .filter((t) => availableTabs.includes(t))
                      .map((t) => (
                        <button
                          key={t}
                          onClick={() => { setTab(t); setGateway(null); }}
                          className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 -mb-px transition-colors
                            ${tab === t ? "border-bp-accent text-bp-accent" : "border-transparent text-white/35 hover:text-white/60"}`}
                        >
                          {t === "online" ? "Online" : "Crypto"}
                        </button>
                      ))}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2.5">
                  {visibleMethods.map((m) => (
                    <button
                      key={m.key}
                      onClick={() => { playClick(); setGateway(m.gateway); setAccountId(mode === "manual" ? m.key : null); }}
                      className={`flex flex-col items-center justify-center gap-1 rounded-[12px] border px-2 py-3.5 text-sm font-bold transition-all
                        ${selectedKey === m.key
                          ? "border-bp-accent bg-bp-accent/10 text-bp-accent shadow-[0_0_16px_rgba(242,154,11,0.15)]"
                          : "border-white/[0.07] text-white/55 hover:border-white/[0.14] hover:text-bp-text"
                        }`}
                      style={{ background: selectedKey === m.key ? "rgba(242,154,11,0.08)" : "rgba(255,255,255,0.02)" }}
                    >
                      <span className="flex items-center gap-2.5">
                        <PaymentMethodLogo gateway={m.gateway} label={m.label} src={m.logo} size={36} />
                        {m.label}
                      </span>
                      {/* {m.subtitle && (
                        <span className="max-w-full truncate text-[10px] font-normal text-white/40">{m.subtitle}</span>
                      )} */}
                    </button>
                  ))}
                </div>

                {selectedKey && (
                  <button
                    onClick={() => { playClick(); setError(null); setStep("amount"); }}
                    className="w-full h-12 rounded-[12px] bg-bp-accent text-[#1b1305] text-sm font-black uppercase tracking-wider shadow-[0_4px_18px_rgba(242,154,11,0.35)] hover:opacity-90 transition-opacity"
                  >
                    Continue with {gatewayLabel}
                  </button>
                )}
              </>
            )}
          </>
        )}

        {/* ── AMOUNT (+ PHONE for auto fiat) ─────────── */}
        {step === "amount" && (
          <>
            <button
              onClick={() => { playClick(); setError(null); setStep("method"); }}
              className="text-xs font-semibold text-white/40 hover:text-white/70 transition-colors"
            >
              ← Back
            </button>

            <div>
              <p className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Select amount</p>
              <div className="grid grid-cols-5 gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p}
                    onClick={() => { playClick(); setAmount(p); setCustom(""); }}
                    className={`rounded-[10px] border py-3 text-center transition-all
                      ${amount === p
                        ? "border-bp-accent shadow-[0_0_12px_rgba(242,154,11,0.2)]"
                        : "border-white/[0.07] hover:border-white/[0.14]"
                      }`}
                    style={{ background: amount === p ? "rgba(242,154,11,0.08)" : "rgba(255,255,255,0.02)" }}
                  >
                    <div className={`text-sm font-black ${amount === p ? "text-bp-accent" : "text-bp-text"}`}>
                      {p >= 1000 ? `${p / 1000}k` : p}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-white/35">PKR</span>
              <input
                type="number"
                value={custom}
                placeholder={`Custom amount (${fmtPkr(MIN_DEPOSIT)}–${fmtPkr(MAX_DEPOSIT)})`}
                onChange={(e) => { setCustom(e.target.value); setAmount(""); }}
                className={`${inputCls} pl-14`}
              />
            </div>

            {needsPhone && (
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">
                  Your {gatewayLabel} number
                </p>
                <input
                  type="tel"
                  inputMode="numeric"
                  value={phone}
                  placeholder="03001234567"
                  onChange={(e) => setPhone(e.target.value)}
                  className={inputCls}
                />
                <p className="text-[11px] text-white/30">
                  You&apos;ll receive a payment approval request on this number.
                </p>
              </div>
            )}

            {error && (
              <p className="rounded-[10px] border border-bp-lose/20 bg-bp-lose/8 px-3 py-2 text-xs font-semibold text-bp-lose"
                style={{ background: "rgba(255,93,115,0.07)" }}>
                {error}
              </p>
            )}

            <button
              disabled={!finalAmount || loading}
              onClick={() => { playClick(); handleAmountNext(); }}
              className="w-full h-12 rounded-[12px] bg-bp-accent text-[#1b1305] text-sm font-black uppercase tracking-wider shadow-[0_4px_18px_rgba(242,154,11,0.35)] hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              {loading ? "Processing…" : mode === "manual" ? "Continue" : `Deposit PKR ${finalAmount || "—"}`}
            </button>
          </>
        )}

        {/* ── CHECKOUT (manual) ──────────────────────── */}
        {step === "checkout" && (
          <>
            <button
              onClick={() => { playClick(); setError(null); setStep("amount"); }}
              className="text-xs font-semibold text-white/40 hover:text-white/70 transition-colors"
            >
              ← Back
            </button>

            <div className="flex items-center gap-3">
              <PaymentMethodLogo
                gateway={gateway ?? ""}
                label={gatewayLabel}
                src={selectedAccount?.logo}
                size={40}
              />
              <div>
                <p className="text-sm font-black text-bp-text">Pay via {gatewayLabel}</p>
                <p className="text-[11px] text-white/40">Send exactly PKR {Number(finalAmount).toLocaleString()} to the account below.</p>
              </div>
            </div>

            {/* Account details */}
            <div className="rounded-[12px] border border-white/[0.07] p-4 space-y-2.5"
              style={{ background: "rgba(255,255,255,0.02)" }}>
              {selectedAccount?.account_title && <InfoRow label="Account name" value={selectedAccount.account_title} />}
              {isFiat && selectedAccount?.account_number && (
                <CopyRow label="Account number" value={selectedAccount.account_number} copied={copied} onCopy={() => copyToClipboard(selectedAccount.account_number!)} />
              )}
              {isCrypto && selectedAccount?.network && <InfoRow label="Network" value={selectedAccount.network} />}
              {isCrypto && selectedAccount?.wallet_address && (
                <CopyRow label="Wallet address" value={selectedAccount.wallet_address} mono copied={copied} onCopy={() => copyToClipboard(selectedAccount.wallet_address!)} />
              )}
              <InfoRow label="Amount" value={`PKR ${Number(finalAmount).toLocaleString()}`} />
            </div>

            {selectedAccount?.instructions && (
              <p className="rounded-[10px] border border-bp-accent/20 bg-bp-accent/8 px-3 py-2.5 text-[11px] leading-relaxed text-bp-accent/90"
                style={{ background: "rgba(242,154,11,0.06)" }}>
                {selectedAccount.instructions}
              </p>
            )}

            {/* Screenshot upload */}
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Payment screenshot</p>
              <input ref={proofInputRef} type="file" accept="image/*" className="hidden" onChange={handleProofPick} />
              {proof ? (
                <div className="relative overflow-hidden rounded-[12px] border border-white/[0.08]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={proof} alt="payment proof" className="max-h-52 w-full object-contain bg-black/30" />
                  <button
                    onClick={() => { playClick(); proofInputRef.current?.click(); }}
                    className="absolute bottom-2 right-2 rounded-[8px] bg-black/70 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-black/85 transition-colors"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { playClick(); proofInputRef.current?.click(); }}
                  disabled={proofLoading}
                  className="flex w-full flex-col items-center justify-center gap-2 rounded-[12px] border border-dashed border-white/[0.14] py-7 text-white/45 transition-colors hover:border-bp-accent/40 hover:text-bp-text disabled:opacity-50"
                  style={{ background: "rgba(255,255,255,0.02)" }}
                >
                  <Upload className="h-5 w-5" />
                  <span className="text-xs font-semibold">{proofLoading ? "Processing…" : "Tap to upload your payment proof"}</span>
                </button>
              )}
            </div>

            {/* Optional sender reference */}
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">
                Your sending number / TID <span className="text-white/25">(optional)</span>
              </p>
              <input
                type="text"
                value={senderRef}
                placeholder="Helps us match your payment faster"
                onChange={(e) => setSenderRef(e.target.value)}
                className={inputCls}
              />
            </div>

            {error && (
              <p className="rounded-[10px] border border-bp-lose/20 bg-bp-lose/8 px-3 py-2 text-xs font-semibold text-bp-lose"
                style={{ background: "rgba(255,93,115,0.07)" }}>
                {error}
              </p>
            )}

            <button
              disabled={!proof || loading}
              onClick={() => { playClick(); handleManualSubmit(); }}
              className="w-full h-12 rounded-[12px] bg-bp-accent text-[#1b1305] text-sm font-black uppercase tracking-wider shadow-[0_4px_18px_rgba(242,154,11,0.35)] hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              {loading ? "Submitting…" : "I've paid — submit for approval"}
            </button>
          </>
        )}

        {/* ── REDIRECT (auto — hosted checkout) ──────── */}
        {step === "redirect" && (
          <div className="py-4 space-y-4 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[16px] border border-bp-accent/25 bg-bp-accent/10">
              <span className="text-2xl">🔒</span>
            </div>
            <p className="text-base font-black text-bp-text">Finish your payment</p>
            <p className="text-sm text-white/45">
              Pay <span className="font-bold text-bp-text">PKR {Number(finalAmount).toLocaleString()}</span> on
              the secure {gatewayLabel} page.<br />
              Keep this window open — your balance updates automatically.
            </p>

            <button
              onClick={() => {
                playClick();
                if (redirectUrl) window.open(redirectUrl, "_blank", "noopener,noreferrer");
              }}
              className="w-full h-12 rounded-[12px] bg-bp-accent text-[#1b1305] text-sm font-black uppercase tracking-wider shadow-[0_4px_18px_rgba(242,154,11,0.35)] hover:opacity-90 transition-opacity"
            >
              Open payment page
            </button>

            <div className="flex items-center justify-center gap-2 text-[11px] text-white/40">
              <span className="h-2 w-2 rounded-full bg-bp-accent animate-pulse" />
              Waiting for confirmation…
            </div>
          </div>
        )}

        {/* ── WAITING ──────────────────────────────── */}
        {step === "waiting" && (
          <div className="py-6 space-y-4 text-center">
            {mode === "manual" ? (
              <>
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[16px] border border-bp-accent/25 bg-bp-accent/10">
                  <Clock className="h-7 w-7 text-bp-accent" />
                </div>
                <p className="text-base font-black text-bp-text">Deposit submitted</p>
                <p className="text-sm text-white/45">
                  We&apos;ve received your request for <span className="font-bold text-bp-text">PKR {Number(finalAmount).toLocaleString()}</span>.<br />
                  Your wallet will be credited once an admin verifies your payment.
                </p>
                <div className="flex items-center justify-center gap-2 text-[11px] text-white/40">
                  <span className="h-2 w-2 rounded-full bg-bp-accent animate-pulse" />
                  Waiting for approval…
                </div>
              </>
            ) : cryptoInfo ? (
              <>
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[16px] border border-bp-win/25 bg-bp-win/10">
                  <span className="text-2xl">🔗</span>
                </div>
                <p className="text-base font-black text-bp-text">Send crypto now</p>
                <div className="rounded-[12px] border border-white/[0.07] p-4 text-left space-y-2.5"
                  style={{ background: "rgba(255,255,255,0.02)" }}>
                  <InfoRow label="Network" value={cryptoInfo.network} />
                  <InfoRow label="Address" value={cryptoInfo.address} mono />
                  <InfoRow label="Amount" value={`PKR ${Number(finalAmount).toLocaleString()}`} />
                </div>
                <p className="text-[11px] text-white/35">Monitoring the blockchain — your wallet credits automatically after confirmation.</p>
              </>
            ) : (
              <>
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[16px] border border-bp-accent/25 bg-bp-accent/10">
                  <span className="text-2xl animate-pulse">📱</span>
                </div>
                <p className="text-base font-black text-bp-text">Approve on your phone</p>
                <p className="text-sm text-white/45">
                  We sent a request to <span className="font-bold text-bp-text">{phone}</span>.<br />
                  Open your {gatewayLabel} app and approve it.
                </p>
                <div className="flex items-center justify-center gap-2 text-[11px] text-white/40">
                  <span className="h-2 w-2 rounded-full bg-bp-accent animate-pulse" />
                  Waiting for approval…
                </div>
              </>
            )}
            <button onClick={() => { playClick(); handleClose(); }} className="text-xs text-white/35 hover:text-white/60 underline underline-offset-2 transition-colors">
              {mode === "manual" ? "Close — we'll credit you once verified" : "Cancel"}
            </button>
          </div>
        )}

        {/* ── DONE ──────────────────────────────────── */}
        {step === "done" && (
          <div className="py-6 space-y-3 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-bp-win/30 bg-bp-win/10">
              <CheckCircle className="h-7 w-7 text-bp-win" />
            </div>
            <p className="text-base font-black text-bp-text">Deposit confirmed!</p>
            <p className="text-sm text-white/45">
              PKR {Number(finalAmount).toLocaleString()} has been added to your wallet.
            </p>
            <button
              onClick={() => { playClick(); handleClose(); }}
              className="w-full h-12 rounded-[12px] bg-bp-accent text-[#1b1305] text-sm font-black uppercase tracking-wider shadow-[0_4px_18px_rgba(242,154,11,0.35)] hover:opacity-90 transition-opacity"
            >
              Done
            </button>
          </div>
        )}

        {/* ── FAILED ────────────────────────────────── */}
        {step === "failed" && (
          <div className="py-6 space-y-3 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-bp-lose/30 bg-bp-lose/10">
              <XCircle className="h-7 w-7 text-bp-lose" />
            </div>
            <p className="text-base font-black text-bp-text">Deposit not approved</p>
            <p className="text-sm text-white/45">
              {mode === "manual"
                ? "Your deposit request was declined. Please contact support if you believe this is an error."
                : "The payment was declined or timed out."}
            </p>
            <button
              onClick={() => { playClick(); reset(); }}
              className="w-full h-12 rounded-[12px] border border-white/[0.08] text-sm font-bold text-bp-text hover:border-white/[0.16] transition-colors"
              style={{ background: "rgba(255,255,255,0.04)" }}
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between items-center gap-2">
      <span className="text-[11px] text-white/40 shrink-0">{label}</span>
      <span className={`text-sm font-semibold truncate text-bp-text ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}

function CopyRow({ label, value, mono, copied, onCopy }: { label: string; value: string; mono?: boolean; copied: boolean; onCopy: () => void }) {
  return (
    <div className="flex justify-between items-center gap-2">
      <span className="text-[11px] text-white/40 shrink-0">{label}</span>
      <button onClick={onCopy} className="flex min-w-0 items-center gap-1.5 text-bp-text transition-colors hover:text-bp-accent">
        <span className={`truncate text-sm font-semibold ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
        {copied ? <Check className="h-3.5 w-3.5 shrink-0 text-bp-win" /> : <Copy className="h-3.5 w-3.5 shrink-0 opacity-60" />}
      </button>
    </div>
  );
}

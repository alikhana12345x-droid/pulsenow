"use client";

import { useState } from "react";
import type { Dispatch, SetStateAction, ReactNode } from "react";
import type { BetCardState, BetId, RoundPhase } from "./types";

const PRESETS = [100, 200, 500, 1000];
const MIN_AMOUNT = 10;
const MAX_AMOUNT = 20000;
const MIN_AUTO_CASHOUT = 1.5;
const MAX_AUTO_CASHOUT = 100;

export function createBetCardState(amount: number, autoCashout: boolean, autoCashoutTarget: number): BetCardState {
  return {
    amount,
    autoBet: false,
    autoCashout,
    autoCashoutTarget,
    stopOnWinStreak: false,
    stopOnLossStreak: false,
    winStreakLimit: 3,
    lossStreakLimit: 3,
    showAuto: false,
    status: "idle",
    cashedAt: null,
    winStreak: 0,
    lossStreak: 0,
  };
}

function clampAmount(value: number) {
  if (!Number.isFinite(value)) return MIN_AMOUNT;
  return Math.min(MAX_AMOUNT, Math.max(MIN_AMOUNT, Math.round(value * 100) / 100));
}

function clampAutoCashout(value: number) {
  if (!Number.isFinite(value)) return MIN_AUTO_CASHOUT;
  return Math.min(MAX_AUTO_CASHOUT, Math.max(MIN_AUTO_CASHOUT, Math.round(value * 100) / 100));
}

/**
 * Number field that is actually typeable on a phone.
 *
 * These used to be controlled straight off the committed value and clamped on
 * every keystroke, which made them nearly unusable on touch: clearing the field
 * snapped it back to the minimum (so it never went empty), and a half-typed
 * value like "1." or the leading "5" of "500" was rewritten under the caret
 * before the next digit could land.
 *
 * So while the field has focus it holds a raw string DRAFT — nothing is clamped
 * and empty is allowed. Each keystroke that parses still reports up, so a bet
 * placed without blurring first uses what is on screen. Clamping happens on
 * blur/Enter, and an empty field reverts to the last good value.
 */
function NumberField({
  value,
  disabled,
  onInput,
  onCommit,
  className,
  ariaLabel,
}: {
  value: number;
  disabled?: boolean;
  /** Live, unclamped — keeps the parent in sync mid-typing. */
  onInput: (value: number) => void;
  /** Clamped commit on blur / Enter. */
  onCommit: (value: number) => void;
  className?: string;
  ariaLabel: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <input
      // Deliberately text + inputMode: type="number" brings spinners, locale
      // decimal quirks and silent value rejection that fight the draft.
      type="text"
      inputMode="decimal"
      enterKeyHint="done"
      autoComplete="off"
      aria-label={ariaLabel}
      value={draft ?? String(value)}
      disabled={disabled}
      onFocus={(e) => {
        const el = e.currentTarget;
        setDraft(String(value));
        // Select-all so the first digit replaces the old value. The rAF pass is
        // for touch browsers that re-place the caret after the focus handler.
        el.select();
        requestAnimationFrame(() => el.select());
      }}
      onChange={(e) => {
        const raw = e.target.value.replace(",", ".").trim();
        if (raw !== "" && !/^\d*\.?\d*$/.test(raw)) return; // ignore junk keystrokes
        setDraft(raw);
        const parsed = Number(raw);
        if (raw !== "" && Number.isFinite(parsed)) onInput(parsed);
      }}
      onBlur={() => {
        const parsed = Number(draft);
        onCommit(draft === "" || draft == null || !Number.isFinite(parsed) ? value : parsed);
        setDraft(null);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      className={className}
    />
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-[22px] w-[40px] shrink-0 cursor-pointer rounded-full transition-colors duration-200 ${checked ? "bg-[#26c943]" : "bg-white/[0.16]"
        }`}
    >
      <span
        className={`absolute top-[3px] h-4 w-4 rounded-full bg-white shadow transition-all duration-200 ${checked ? "left-[21px]" : "left-[3px]"
          }`}
      />
    </button>
  );
}

function ActionButton({
  variant,
  disabled,
  onClick,
  children,
}: {
  variant: "bet" | "cancel" | "placed" | "cashout" | "cashed" | "lost";
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const cls: Record<typeof variant, string> = {
    bet: "bg-[#28a909] border-white hover:bg-[#22b83c] active:bg-[#1ea535] text-white shadow-[0_4px_20px_rgba(38,201,67,0.32)]",
    cancel: "bg-gradient-to-b from-rose-500 to-rose-700 text-white shadow-[0_4px_16px_rgba(244,63,94,0.28)] hover:opacity-95",
    placed: "bg-white/[0.05] text-white/38 cursor-default border border-white",
    cashout: "bg-gradient-to-b from-[#f5a623] to-[#e8711a] text-[#1a0800] border-white shadow-[0_6px_24px_rgba(245,166,35,0.36)] hover:opacity-95",
    cashed: "bg-[#26c943]/[0.10] border border-[#26c943]/20 text-[#26c943] cursor-default",
    lost: "bg-rose-500/[0.07] border border-rose-500/[0.18] text-rose-400 cursor-default",
  };

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex h-full border-2 w-full flex-col items-center justify-center gap-0.5 rounded-xl md:px-4 px-1 py-1 text-center transition-all active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 ${cls[variant]}`}
    >
      {children}
    </button>
  );
}

export function BetCard({
  id,
  state,
  setState,
  phase,
  multiplier,
  disabled,
  onPlace,
  onCancel,
  onCashout,
  onCollapse,
  onExpand,
  collapseButtonClass = "",
}: {
  id: BetId;
  state: BetCardState;
  setState: Dispatch<SetStateAction<BetCardState>>;
  phase: RoundPhase;
  multiplier: number;
  disabled?: boolean;
  onPlace: (amount: number) => void;
  onCancel: () => void;
  onCashout: (multiplier: number) => void;
  onCollapse?: () => void;
  onExpand?: () => void;
  collapseButtonClass?: string;
}) {
  const isBetting = phase === "betting";
  const canBetNextRound = phase === "flight" || phase === "crash" || phase === "post";
  const inputDisabled = state.status !== "idle";

  const patch = (partial: Partial<BetCardState>) => setState((prev) => ({ ...prev, ...partial }));
  const setAmount = (amount: number) => patch({ amount: clampAmount(amount) });

  const idColor = id === "A"
    ? "border-sky-400/25 bg-sky-400/[0.08] text-sky-400"
    : "border-violet-400/25 bg-violet-400/[0.08] text-violet-400";

  // ── Action button ──────────────────────────────────────────────────────────
  let action: ReactNode;
  if (state.status === "queued") {
    action = isBetting ? (
      <ActionButton variant="cancel" onClick={onCancel}>
        <span className="text-[10px] md:text-[15px] md:mb-1 font-semibold uppercase tracking-[0.14em] opacity-80">Cancel</span>
        <span>
          <span className="font-mono text-[15fpx] md:text-[22px] font-black leading-none">{state.amount.toFixed(2)}</span>
          <span className="ml-2 text-[9px] font-bold opacity-70">PKR</span>
        </span>
      </ActionButton>
    ) : (
      <ActionButton variant="placed" onClick={() => undefined}>
        <span className="text-[10px] md:text-[15px] md:mb-1 font-semibold uppercase tracking-[0.14em] opacity-55">Queued</span>
        <span>
          <span className="font-mono text-[15fpx] md:text-[22px]  font-black leading-none">{state.amount.toFixed(2)}</span>
          <span className="ml-2 text-[9px] font-bold opacity-45">PKR</span>
        </span>
      </ActionButton>
    );
  } else if (state.status === "inflight") {
    action = (
      <ActionButton variant="cashout" disabled={phase !== "flight"} onClick={() => onCashout(multiplier)}>
        <span className="text-[10px] md:text-[15px] md:mb-1 font-semibold uppercase tracking-[0.14em] opacity-80">Cash Out</span>
        <span>
          <span className="font-mono text-[15fpx] md:text-[22px] font-black leading-none">{(state.amount * multiplier).toFixed(2)}</span>
          <span className="text-[9px] ml-2 font-bold opacity-70">PKR</span>
        </span>
      </ActionButton>
    );
  } else if (state.status === "cashed") {
    action = (
      <ActionButton variant="cashed" onClick={() => undefined}>
        <span className="text-[10px] md:text-[15px] md:mb-1 font-semibold uppercase tracking-[0.14em] opacity-65">@ {state.cashedAt?.toFixed(2)}×</span>
        <span>
          <span className="font-mono text-[15fpx] md:text-[22px] font-black leading-none">+{(state.amount * ((state.cashedAt ?? 1) - 1)).toFixed(2)}</span>
          <span className="ml-2 text-[9px] font-bold opacity-65">PKR</span>
        </span>
      </ActionButton>
    );
  } else if (state.status === "lost") {
    action = (
      <ActionButton variant="lost" onClick={() => undefined}>
        <span className="text-[10px] md:text-[15px] md:mb-1 font-semibold uppercase tracking-[0.14em] opacity-60">Flew Away</span>
        <span>
          <span className="font-mono text-[15fpx] md:text-[22px] font-black leading-none">−{state.amount.toFixed(0)}</span>
          <span className="ml-2 text-[9px] font-bold opacity-50">PKR</span>
        </span>
      </ActionButton>
    );
  } else {
    action = (
      <ActionButton
        variant="bet"
        disabled={disabled || (!isBetting && !canBetNextRound)}
        onClick={() => onPlace(state.amount)}
      >
        <span className="text-[10px] md:text-[15px] md:mb-1 font-semibold uppercase tracking-[0.14em] opacity-90">
          {isBetting ? "Bet" : "Next Round"}
        </span>
        <span>
          <span className="font-mono text-[15fpx] md:text-[22px] font-black leading-none">{state.amount.toFixed(2)}</span>
          <span className=" ml-2 text-[10px] font-bold opacity-85">PKR</span>
        </span>
      </ActionButton>
    );
  }

  return (
    <section className="flex flex-col gap-0 md:gap-2 rounded-2xl border border-white/[0.07] bg-[#1a1629] py-1 md:py-3 ">

      {/* ── Row 1: Bet/Auto tabs + collapse/expand/id ── */}
      <div className="flex relative items-center justify-center px-2 lg:px-20">
        <div className="inline-flex rounded-full border border-white/[0.08] bg-black/55 p-[3px] mb-3">
          <button
            type="button"
            onClick={() => patch({ showAuto: false })}
            className={`rounded-full px-3.5 py-[5px] text-[12px] font-bold transition-colors ${!state.showAuto ? "bg-white/[0.13] text-white" : "text-white/35 hover:text-white/65"
              }`}
          >
            Bet
          </button>
          <button
            type="button"
            onClick={() => patch({ showAuto: true })}
            className={`rounded-full px-3.5 py-[5px] text-[12px] font-bold transition-colors ${state.showAuto ? "bg-white/[0.13] text-white" : "text-white/35 hover:text-white/65"
              }`}
          >
            Auto
          </button>
        </div>

        <div className="absolute right-2 top-0">
          {/* Collapse card B → merge into A */}
          {onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              title="Remove second bet card"
              className={`flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.09] bg-white/[0.06] text-white/45 transition-colors hover:bg-white/[0.12] hover:text-white ${collapseButtonClass}`}
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <rect x="1" y="1" width="11" height="11" rx="2.5" stroke="currentColor" strokeWidth="1.4" />
                <rect x="3.5" y="6" width="6" height="1.3" rx="0.65" fill="currentColor" />
              </svg>
            </button>
          )}

          {/* Expand: re-add card B when it's collapsed */}
          {onExpand && (
            <button
              type="button"
              onClick={onExpand}
              title="Add second bet card"
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.09] bg-white/[0.06] text-white/45 transition-colors hover:bg-white/[0.12] hover:text-white"
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <rect x="1" y="1" width="11" height="11" rx="2.5" stroke="currentColor" strokeWidth="1.4" />
                <rect x="5.85" y="3.5" width="1.3" height="6" rx="0.65" fill="currentColor" />
                <rect x="3.5" y="5.85" width="6" height="1.3" rx="0.65" fill="currentColor" />
              </svg>
            </button>
          )}

          {/* Default id badge — shown when neither collapse nor expand is active */}
          {!onCollapse && !onExpand && (
            <div className={`rounded-md border px-[7px] py-[3px] text-[10px] font-bold uppercase tracking-widest ${idColor}`}>
              {id}
            </div>
          )}
        </div>
      </div>

      {/* ── Row 2: [left: amount + 2×2 chips] [right: action button] ── */}
      <div className="flex gap-4 px-1 lg:px-20">

        {/* Left column */}
        <div className="flex flex-1 flex-col gap-[6px] w-[150px]">

          {/* Amount row: − | input | + */}
          <div className="flex items-center gap-[6px] bg-black/50 rounded-lg px-1 py-1">
            <button
              type="button"
              disabled={inputDisabled}
              onClick={() => setAmount(state.amount / 2)}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/[0.10] bg-white/[0.07] text-[17px] font-bold leading-none text-white/70 transition-colors hover:bg-white/[0.12] hover:text-white disabled:opacity-40"
            >
              −
            </button>
            <NumberField
              ariaLabel="Bet amount"
              value={state.amount}
              disabled={inputDisabled}
              onInput={(amount) => patch({ amount })}
              onCommit={setAmount}
              className="min-w-0 flex-1 rounded-lg bg-black/50 py-[3px] text-center font-mono text-[16px] font-bold text-white outline-none transition-colors focus:border-white/[0.18] disabled:opacity-50"
            />
            <button
              type="button"
              disabled={inputDisabled}
              onClick={() => setAmount(state.amount * 2)}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/[0.10] bg-white/[0.07] text-[17px] font-bold leading-none text-white/70 transition-colors hover:bg-white/[0.12] hover:text-white disabled:opacity-40"
            >
              +
            </button>
          </div>

          {/* 2×2 chip grid */}
          <div className="grid grid-cols-2 gap-[5px]">
            {PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                disabled={inputDisabled}
                onClick={() => setAmount(preset)}
                className={`rounded-lg border py-[3px] font-mono text-[11px] font-bold 
                  transition-colors disabled:opacity-40 ${state.amount === preset
                    ? "border-white/[0.20] bg-white/[0.10] text-white"
                    : "border-white/[0.07] bg-white/[0.04] text-white/50 hover:bg-white/[0.08] hover:text-white/80"
                  }`}
              >
                {preset >= 1000 ? `${preset / 1000}K` : preset}
              </button>
            ))}
          </div>
        </div>

        {/* Right column: action button spans full height of left */}
        <div className="flex w-full">
          {action}
        </div>
      </div>

      {/* ── Auto tab: inline toggles only ──
          The row wraps instead of overflowing: on a 320px phone it used to run
          the cash-out input and its × clear button off the card edge. */}
      {state.showAuto && (
        <div className="px-2 lg:px-20 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-white/[0.05] pt-2">
          {/* Auto bet */}
          <div className="flex items-center gap-[6px]">
            <span className="text-[9px] font-bold uppercase tracking-[0.13em] text-white/35">Auto bet</span>
            <Toggle checked={state.autoBet} onChange={(v) => patch({ autoBet: v })} />
          </div>
          {/* Auto Cash Out */}
          <div className="flex items-center gap-[6px]">
            <span className="text-[9px] font-bold uppercase tracking-[0.13em] text-white/35">Auto Cash Out</span>
            <Toggle checked={state.autoCashout} onChange={(v) => patch({ autoCashout: v })} />
            {state.autoCashout && (
              <>
                <NumberField
                  ariaLabel="Auto cash out multiplier"
                  value={state.autoCashoutTarget}
                  disabled={inputDisabled}
                  onInput={(autoCashoutTarget) => patch({ autoCashoutTarget })}
                  onCommit={(v) => patch({ autoCashoutTarget: clampAutoCashout(v) })}
                  className="h-[26px] w-[58px] rounded-md border border-white/[0.08] bg-black/50 px-1 text-center font-mono text-[13px] font-bold text-[#26c943] outline-none focus:border-[#26c943]/40 disabled:opacity-35"
                />
                <button
                  type="button"
                  aria-label="Turn off auto cash out"
                  onClick={() => patch({ autoCashout: false })}
                  className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-white/[0.10] text-[12px] font-bold text-white/50 transition-colors hover:bg-white/[0.20] hover:text-white"
                >
                  ×
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

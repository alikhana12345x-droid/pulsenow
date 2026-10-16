"use client";

// Resolves a promotion's cta_action string into an onClick handler.
// Must be used inside ProtectedFinanceProvider (lobby pages only).
//
// cta_action format:
//   "deposit"       → open finance drawer (deposit tab)
//   "withdraw"      → open finance drawer (withdraw tab)
//   "game:<id>"     → navigate to /protected/games/<id>
//   "url:<path>"    → navigate to <path> (internal or external)
//   null / ""       → no handler (don't render a CTA button)

import { useRouter } from "next/navigation";
import { useFinanceDrawer } from "@/components/protected/finance-drawer-provider";
import { playClick } from "@/lib/sound";

export function usePromoCta() {
  const { openFinance } = useFinanceDrawer();
  const router = useRouter();

  return function resolve(cta_action: string | null | undefined): (() => void) | undefined {
    if (!cta_action) return undefined;

    if (cta_action === "deposit") {
      return () => { playClick(); openFinance("deposit"); };
    }
    if (cta_action === "withdraw") {
      return () => { playClick(); openFinance("withdraw"); };
    }
    if (cta_action.startsWith("game:")) {
      const gameId = cta_action.slice(5);
      return () => { playClick(); router.push(`/protected/games/${gameId}`); };
    }
    if (cta_action.startsWith("url:")) {
      const href = cta_action.slice(4);
      return () => { playClick(); router.push(href); };
    }
    return undefined;
  };
}

// Derives a human-readable CTA button label.
// customLabel (from DB) always wins; falls back to action type.
export function ctaLabelFromAction(
  action: string | null | undefined,
  customLabel: string | null | undefined,
  short = false,
): string {
  if (customLabel) return customLabel;
  if (!action) return short ? "Claim →" : "Claim Now →";
  if (action === "deposit") return short ? "Deposit →" : "Deposit Now →";
  if (action === "withdraw") return "Withdraw →";
  if (action.startsWith("game:")) return short ? "Play →" : "Play Now →";
  if (action.startsWith("url:")) return "View →";
  return short ? "Claim →" : "Claim Now →";
}

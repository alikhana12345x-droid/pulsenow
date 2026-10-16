"use client";

import { useFinanceDrawer } from "@/components/protected/finance-drawer-provider";

export function HeaderWallet() {
  const { openFinance, balance, currency } = useFinanceDrawer();

  return (
    <div className="flex items-center gap-1.5">
      {/* Balance chip */}
      <button
        type="button"
        onClick={() => openFinance("menu")}
        className="flex items-center gap-1.5 rounded-[10px] border border-white/[0.08] px-2.5 py-1.5 transition-colors hover:border-bp-accent/30"
        style={{ background: "rgba(255,255,255,0.03)" }}
      >
        <span className="text-[9px] font-bold uppercase tracking-widest text-white/35">
          {currency}
        </span>
        {balance !== null ? (
          <span className="font-mono text-[12px] font-black text-bp-accent">
            {balance.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        ) : (
          <span className="inline-block h-3 w-14 animate-pulse rounded-full bg-white/10" />
        )}
      </button>

      {/* Deposit CTA */}
      <button
        type="button"
        onClick={() => openFinance("deposit")}
        className="h-[30px] rounded-[10px] bg-bp-accent px-3 text-[11px] font-black text-[#1b1305] shadow-[0_2px_10px_rgba(242,154,11,0.35)] transition-opacity hover:opacity-90"
      >
        Deposit
      </button>
    </div>
  );
}

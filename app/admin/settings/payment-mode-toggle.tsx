"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setPaymentMode, type PaymentMode } from "@/lib/actions/platform-settings";

const OPTIONS: { value: PaymentMode; label: string; hint: string }[] = [
  { value: "manual", label: "Manual", hint: "Players upload a payment screenshot; an admin approves each deposit and sends payouts by hand." },
  { value: "auto", label: "Auto (gateways)", hint: "Deposits and payouts run through the configured payment gateways automatically." },
];

export function PaymentModeToggle({ initialMode }: { initialMode: PaymentMode }) {
  const router = useRouter();
  const [mode, setMode] = useState<PaymentMode>(initialMode);
  const [saving, setSaving] = useState(false);
  const active = OPTIONS.find((o) => o.value === mode)!;

  const change = async (next: PaymentMode) => {
    if (next === mode || saving) return;
    const prev = mode;
    setMode(next);
    setSaving(true);
    try {
      await setPaymentMode(next);
      router.refresh();
    } catch (e: unknown) {
      setMode(prev);
      alert(e instanceof Error ? e.message : "Failed to update payment mode");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-[24px] border border-border/70 bg-card/80 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-xl space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/80">Payments</p>
          <h2 className="text-xl font-bold tracking-tight">Payment mode</h2>
          <p className="text-sm text-muted-foreground">{active.hint}</p>
        </div>

        <div className="inline-flex shrink-0 rounded-2xl border border-border bg-background/70 p-1">
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => change(o.value)}
              disabled={saving}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60 ${
                mode === o.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

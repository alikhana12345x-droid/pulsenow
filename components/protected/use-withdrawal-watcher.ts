"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast-provider";
import {
  trackedWithdrawals,
  untrackWithdrawal,
  withdrawalDeclinedToast,
  withdrawalSentToast,
} from "@/lib/withdrawal-tracker";

/** Slow on purpose: a manual payout can take hours, and the status route may query the gateway. */
const CHECK_EVERY_MS = 20_000;

/**
 * Watches the withdrawals this browser is waiting on and toasts the moment one
 * settles — sent once it has actually been paid out, or declined (with the
 * admin's reason) once it has been refunded. The withdraw sheet closes as soon
 * as a request is recorded, so this is the only place the player hears back.
 */
export function useWithdrawalWatcher(enabled: boolean, onSettled: () => void) {
  const router = useRouter();
  const { toast } = useToast();
  // The provider re-creates its refresh callback every render.
  const onSettledRef = useRef(onSettled);
  useEffect(() => {
    onSettledRef.current = onSettled;
  });

  useEffect(() => {
    if (!enabled) return;

    let stopped = false;
    let running = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const check = async () => {
      if (running) return;
      running = true;
      let changed = false;

      try {
        for (const w of trackedWithdrawals()) {
          try {
            const res = await fetch(`/api/withdrawals/status/${w.id}`, { cache: "no-store" });
            // Not this account's withdrawal (someone else signed in here) — stop asking.
            if (res.status === 404) {
              untrackWithdrawal(w.id);
              continue;
            }
            if (!res.ok) continue;

            const { status, rejection_reason } = (await res.json()) as {
              status?: string;
              rejection_reason?: string | null;
            };
            if (status === "completed") {
              if (untrackWithdrawal(w.id)) {
                const t = withdrawalSentToast(w);
                toast(t.message, "success", { description: t.description, duration: 7000 });
              }
              changed = true;
            } else if (status === "rejected" || status === "failed") {
              if (untrackWithdrawal(w.id)) {
                const t = withdrawalDeclinedToast(w, rejection_reason ?? null);
                toast(t.message, "error", { description: t.description, duration: 9000 });
              }
              changed = true;
            }
          } catch {
            /* offline or transient — try again next round */
          }
        }
      } finally {
        running = false;
      }

      if (changed && !stopped) {
        onSettledRef.current();
        router.refresh();
      }
    };

    const loop = () => {
      timer = setTimeout(async () => {
        if (document.visibilityState === "visible") await check();
        if (!stopped) loop();
      }, CHECK_EVERY_MS);
    };

    // Catch up straight away when the player comes back to the tab.
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };

    void check();
    loop();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, router, toast]);
}

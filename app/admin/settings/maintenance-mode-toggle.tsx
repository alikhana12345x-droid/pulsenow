"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setMaintenanceMode } from "@/lib/actions/platform-settings";

export function MaintenanceModeToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);

  const toggle = async () => {
    if (saving) return;
    const next = !enabled;
    if (next && !window.confirm("Enable maintenance mode? Everyone except superadmins will see a loading screen app-wide until you turn this off.")) {
      return;
    }
    setEnabled(next);
    setSaving(true);
    try {
      await setMaintenanceMode(next);
      router.refresh();
    } catch (e: unknown) {
      setEnabled(!next);
      alert(e instanceof Error ? e.message : "Failed to update maintenance mode");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      className={`rounded-[24px] border p-6 ${
        enabled ? "border-amber-500/40 bg-amber-500/5" : "border-border/70 bg-card/80"
      }`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-xl space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/80">Platform</p>
          <h2 className="text-xl font-bold tracking-tight">Maintenance mode</h2>
          <p className="text-sm text-muted-foreground">
            {enabled
              ? "The whole app — including the admin panel — shows a loading screen to everyone except superadmins."
              : "Pause the entire app for everyone except superadmins, who keep full access."}
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={toggle}
          disabled={saving}
          className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
            enabled ? "bg-amber-500" : "bg-muted"
          }`}
        >
          <span
            className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform ${
              enabled ? "translate-x-7" : "translate-x-1"
            }`}
          />
        </button>
      </div>
    </section>
  );
}

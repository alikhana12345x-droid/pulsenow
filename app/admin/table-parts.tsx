/**
 * Compact building blocks shared by the server-paged admin tables (Finance,
 * Audit), so they stay dense enough to fit the page without sideways scrolling.
 *
 * Kept out of the "use client" list-controls module on purpose: a server
 * component importing a string from a client module gets a client reference,
 * not the string.
 */

import { APP_TIME_ZONE } from "@/lib/time";

export const TH =
  "whitespace-nowrap px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground first:pl-4 last:pr-4";
export const TD = "px-3 py-2.5 first:pl-4 last:pr-4";
export const TR = "border-b border-border/40 transition-colors last:border-0 hover:bg-accent/30";
export const TABLE_CARD = "hidden overflow-hidden rounded-2xl border border-border/70 bg-card/80 xl:block";
export const CARD = "flex min-w-0 flex-col rounded-2xl border border-border/70 bg-card/80 p-3.5";
export const CARD_GRID = "grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:hidden";
export const CARD_LABEL = "text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground";

export function fmtDateTime(d: Date | string) {
  return new Date(d).toLocaleString("en-PK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: APP_TIME_ZONE,
  });
}

/** Date over time, so the column stays narrow. */
export function DateCell({ value }: { value: Date | string }) {
  const d = new Date(value);
  return (
    <div className="whitespace-nowrap text-xs leading-tight text-muted-foreground">
      <div>
        {d.toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric", timeZone: APP_TIME_ZONE })}
      </div>
      <div className="mt-0.5 text-[11px] text-muted-foreground/70">
        {d.toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit", timeZone: APP_TIME_ZONE })}
      </div>
    </div>
  );
}

export function PanelNote({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] leading-relaxed text-muted-foreground">{children}</p>;
}

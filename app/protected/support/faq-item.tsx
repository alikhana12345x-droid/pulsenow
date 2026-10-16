"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";

export function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.04] bg-white/[0.02]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left transition-colors hover:bg-white/[0.03]"
      >
        <p className="text-sm font-semibold text-bp-text">{q}</p>
        <ChevronRight
          className={`h-4 w-4 shrink-0 text-white/30 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
        />
      </button>

      {open && (
        <div className="border-t border-white/[0.04] px-3 pb-3 pt-2.5">
          <p className="text-[13px] leading-relaxed text-white/50">{a}</p>
        </div>
      )}
    </div>
  );
}

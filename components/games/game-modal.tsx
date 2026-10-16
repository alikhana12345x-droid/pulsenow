"use client";

import { X } from "lucide-react";
import React from "react";

interface GameModalProps {
  open: boolean;
  onClose: () => void;
  /** reminder = BetPulse brand colours · info = 999r-style dark table shell */
  variant: "reminder" | "info";
  title?: string;
  children: React.ReactNode;
}

/**
 * Renders as `absolute inset-0` so it must be placed inside a positioned
 * ancestor (the scaled <main> on mobile, or a relative <main> on desktop).
 * Both layouts in GamesWrapper satisfy this requirement.
 */
export function GameModal({ open, onClose, variant, title, children }: GameModalProps) {
  if (!open) return null;

  return (
    <div
      className="absolute inset-0 z-[100] flex items-center justify-center p-2.5"
      style={{ background: "rgba(0,0,0,0.80)", backdropFilter: "blur(3px)" }}
    >
      {variant === "reminder" ? (
        /* ── BetPulse brand reminder card ── */
        <div className="w-full max-w-[580px] rounded-3xl border border-white/[0.08] bg-[#0d0b1e] p-6 shadow-[0_24px_64px_rgba(0,0,0,0.75)]">
          {title && (
            <h3 className="mb-3 text-center text-[18px] font-black tracking-tight text-white">
              {title}
            </h3>
          )}
          {children}
        </div>
      ) : (
        /* ── BetPulse-themed info card ── */
        <div className="w-full max-w-[660px] overflow-hidden rounded-2xl border border-white/[0.08] bg-bp-mid shadow-[0_24px_64px_rgba(0,0,0,0.88)]">
          {title && (
            <div
              className="px-4 py-3.5"
              style={{ background: "linear-gradient(180deg, #f2a83e 0%, #c97e08 100%)" }}
            >
              <h3 className="text-center text-[15px] font-black tracking-wide text-[#1b1305]">{title}</h3>
            </div>
          )}

          <div className="overflow-y-auto" style={{ maxHeight: "80vh" }}>
            {children}
          </div>

          <div className="flex justify-center border-t border-white/[0.06] bg-bp-mid py-3">
            <button
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-bp-accent/30 text-bp-accent transition-colors hover:border-bp-accent hover:bg-bp-accent/10"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

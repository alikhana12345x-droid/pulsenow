"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 bg-black/80 z-40 transition-opacity duration-300",
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />
      <div
        className={cn(
          "fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[600px] z-50",
          "bg-bp-mid rounded-t-[20px] border-t border-l border-r border-white/[0.08]",
          "shadow-[0_-12px_48px_rgba(0,0,0,0.7),0_0_0_1px_rgba(242,154,11,0.04)]",
          "transition-transform duration-300 ease-out",
          open ? "translate-y-0" : "translate-y-full"
        )}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-9 h-1 rounded-full bg-white/10" />
        </div>
        {/* Header */}
        <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
          <h2 className="text-sm font-black tracking-wide text-bp-text uppercase">{title}</h2>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-7 h-7 rounded-[8px] bg-white/[0.04] border border-white/[0.06] text-white/40 hover:text-bp-text hover:border-white/[0.12] transition-colors"
          >
            <X size={13} />
          </button>
        </div>
        <div className="overflow-y-auto" style={{ maxHeight: "80vh" }}>
          {children}
        </div>
      </div>
    </>
  );
}

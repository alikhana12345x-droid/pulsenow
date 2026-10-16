"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

interface AuthDialogProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Identifies the current view; changing it while open re-focuses the first field. */
  contentKey?: string;
}

/**
 * Responsive auth modal shell — hand-rolled to match the existing `BottomSheet`
 * (no extra dependency). Centered dialog on desktop (`sm:` and up), slide-up
 * bottom sheet on mobile. Handles Escape, backdrop click, body scroll-lock,
 * focus-in / focus-restore, and enter/exit transitions.
 *
 * The form's own <Card> provides the visual chrome; this only positions it,
 * dims the background, and floats a close button above the card.
 */
export function AuthDialog({ open, onClose, children, contentKey }: AuthDialogProps) {
  const [render, setRender] = useState(open);
  const [show, setShow] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);

  // Keep the latest content while open so the exit animation can still show it
  // for a frame after the parent clears the active view.
  const cached = useRef<React.ReactNode>(children);
  if (open) cached.current = children;

  // Mount/unmount with a transition window so both enter and exit animate.
  useEffect(() => {
    if (open) {
      setRender(true);
      const id = requestAnimationFrame(() => setShow(true));
      return () => cancelAnimationFrame(id);
    }
    setShow(false);
    const t = setTimeout(() => setRender(false), 300);
    return () => clearTimeout(t);
  }, [open]);

  // Escape to close + body scroll-lock while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  // Focus the first field whenever the modal opens or switches view; restore
  // focus to the original trigger only when it closes.
  useEffect(() => {
    if (open) {
      if (!wasOpen.current) {
        lastFocused.current = document.activeElement as HTMLElement | null;
        wasOpen.current = true;
      }
      const id = requestAnimationFrame(() => {
        const panel = panelRef.current;
        const field =
          panel?.querySelector<HTMLElement>("input, textarea, select") ??
          panel?.querySelector<HTMLElement>("button");
        field?.focus();
      });
      return () => cancelAnimationFrame(id);
    }
    if (wasOpen.current) {
      wasOpen.current = false;
      lastFocused.current?.focus?.();
    }
  }, [open, contentKey]);

  if (!render) return null;

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true">
      <div
        className={cn(
          "fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity duration-300",
          show ? "opacity-100" : "opacity-0",
        )}
        onClick={onClose}
      />

      {/* Scroll container so tall forms (sign-up) never clip on short screens:
          centers when it fits, scrolls when it doesn't. */}
      <div className="fixed inset-0 overflow-y-auto">
        <div className="flex min-h-full items-end justify-center p-3 pt-16 sm:items-center sm:p-6">
          <div
            ref={panelRef}
            className={cn(
              "relative w-full max-w-[480px] transition-all duration-300 ease-out",
              show
                ? "translate-y-0 opacity-100 sm:scale-100"
                : "translate-y-full opacity-0 sm:translate-y-0 sm:scale-95",
            )}
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="absolute -top-12 right-0 grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/[0.06] text-white/55 backdrop-blur-md transition-colors hover:border-white/20 hover:text-white sm:-top-11"
            >
              <X className="h-4 w-4" />
            </button>

            {cached.current}
          </div>
        </div>
      </div>
    </div>
  );
}

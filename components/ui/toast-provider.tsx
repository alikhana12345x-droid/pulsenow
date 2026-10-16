"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { CheckCircle, XCircle, Info, X } from "lucide-react";

type ToastType = "success" | "error" | "info";

interface ToastOptions {
  /** A quieter second line under the message. */
  description?: string;
  /** How long it stays up, in ms. */
  duration?: number;
}

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  description?: string;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

const ICONS = {
  success: CheckCircle,
  error:   XCircle,
  info:    Info,
} as const;

const STYLES = {
  success: { border: "border-bp-win/30",    icon: "text-bp-win"    },
  error:   { border: "border-bp-lose/30",   icon: "text-bp-lose"   },
  info:    { border: "border-bp-accent/30", icon: "text-bp-accent" },
} as const;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, type: ToastType = "info", options: ToastOptions = {}) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev.slice(-2), { id, message, type, description: options.description }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, options.duration ?? 3500);
  }, []);

  const dismiss = (id: string) =>
    setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}

      {toasts.length > 0 && (
        <div className="fixed bottom-20 left-1/2 z-[60] flex w-full max-w-[560px] -translate-x-1/2 flex-col gap-2 px-4 pointer-events-none">
          {toasts.map((t) => {
            const Icon = ICONS[t.type];
            const s = STYLES[t.type];
            return (
              <div
                key={t.id}
                role="status"
                className={`pointer-events-auto flex items-center gap-3 rounded-2xl border ${s.border} px-4 py-3 shadow-xl backdrop-blur-md animate-in slide-in-from-bottom-2 duration-200`}
                style={{ background: "rgba(13,11,30,0.94)" }}
              >
                <Icon className={`h-4 w-4 shrink-0 ${s.icon}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-bp-text">{t.message}</p>
                  {t.description && (
                    <p className="mt-0.5 text-[11px] text-white/45">{t.description}</p>
                  )}
                </div>
                <button
                  onClick={() => dismiss(t.id)}
                  className="text-white/30 hover:text-white/60 transition-colors"
                  aria-label="Dismiss"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </ToastContext.Provider>
  );
}

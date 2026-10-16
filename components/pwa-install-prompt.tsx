"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { X } from "lucide-react";

const DISMISS_KEY = "pwa_install_dismissed_at";
const DISMISS_DURATION = 60 * 60 * 1000; // 1 hour
const INSTALL_SETTLE_MS = 1800;
const HIDDEN_PATHS = ["/auth", "/protected/onboarding"];

type DeferredPrompt = Event & {
  prompt: () => Promise<void> | void;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type InstallState = "idle" | "prompting" | "accepted" | "installed" | "unavailable";

declare global {
  interface Window {
    __pwaPrompt?: DeferredPrompt;
  }
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function wasDismissedRecently() {
  try {
    const ts = localStorage.getItem(DISMISS_KEY);
    return ts ? Date.now() - Number(ts) < DISMISS_DURATION : false;
  } catch {
    return false;
  }
}

function saveDismiss() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {}
}

function isHiddenPath(pathname: string) {
  return HIDDEN_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export function PWAInstallPrompt() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [installState, setInstallState] = useState<InstallState>("idle");
  const [progress, setProgress] = useState(0);
  const promptRef = useRef<DeferredPrompt | null>(null);

  // Hide whenever the user navigates to an auth or onboarding route.
  useEffect(() => {
    if (isHiddenPath(pathname)) setVisible(false);
  }, [pathname]);

  useEffect(() => {
    if (isStandalone() || wasDismissedRecently()) return;

    const show = (prompt: DeferredPrompt) => {
      if (isHiddenPath(window.location.pathname)) return;
      promptRef.current = prompt;
      setInstallState("idle");
      setProgress(0);
      setVisible(true);
    };

    if (window.__pwaPrompt) {
      show(window.__pwaPrompt);
    }

    const promptHandler = (event: Event) => {
      if (wasDismissedRecently()) return;
      event.preventDefault();
      const prompt = event as DeferredPrompt;
      window.__pwaPrompt = prompt;
      show(prompt);
    };

    const installedHandler = () => {
      promptRef.current = null;
      window.__pwaPrompt = undefined;
      setInstallState("installed");
      setProgress(100);
      window.setTimeout(() => setVisible(false), INSTALL_SETTLE_MS);
    };

    window.addEventListener("beforeinstallprompt", promptHandler);
    window.addEventListener("appinstalled", installedHandler);

    return () => {
      window.removeEventListener("beforeinstallprompt", promptHandler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  useEffect(() => {
    if (installState !== "prompting" && installState !== "accepted") return;

    const target = installState === "prompting" ? 72 : 94;
    const timer = window.setInterval(() => {
      setProgress((current) =>
        Math.min(target, current + (installState === "prompting" ? 8 : 3)),
      );
    }, 240);

    return () => window.clearInterval(timer);
  }, [installState]);

  const resetPrompt = () => {
    promptRef.current = null;
    window.__pwaPrompt = undefined;
  };

  const dismiss = () => {
    if (installState === "prompting" || installState === "accepted") return;
    saveDismiss();
    resetPrompt();
    setVisible(false);
  };

  const install = async () => {
    const prompt = promptRef.current ?? window.__pwaPrompt;

    if (!prompt || typeof prompt.prompt !== "function") {
      setInstallState("unavailable");
      return;
    }

    setInstallState("prompting");
    setProgress(18);

    try {
      // Chrome requires this to run directly from the button click.
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;

      resetPrompt();

      if (outcome === "accepted") {
        setInstallState("accepted");
        setProgress(86);
        window.setTimeout(() => {
          setProgress(100);
          setInstallState("installed");
          window.setTimeout(() => setVisible(false), INSTALL_SETTLE_MS);
        }, INSTALL_SETTLE_MS);
        return;
      }

      saveDismiss();
      setInstallState("idle");
      setProgress(0);
      setVisible(false);
    } catch {
      resetPrompt();
      setInstallState("unavailable");
      setProgress(0);
    }
  };

  if (!visible) return null;

  const isBusy = installState === "prompting" || installState === "accepted";
  const statusText =
    installState === "prompting"
      ? "Opening Chrome install prompt..."
      : installState === "accepted"
        ? "Installing PulseNow..."
        : installState === "installed"
          ? "Installed"
          : installState === "unavailable"
            ? "Chrome is not offering install right now. Use the address bar install icon or reload this page."
            : "Play faster in fullscreen - no browser bar, instant launch from your home screen.";

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center px-4 pb-6 sm:items-center sm:pb-0">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={dismiss} />

      <div className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-white/[0.08] bg-[#0e0c1a] shadow-[0_24px_80px_rgba(0,0,0,0.8)]">
        <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-bp-accent to-transparent opacity-70" />

        <button
          onClick={dismiss}
          disabled={isBusy}
          className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full bg-white/[0.06] text-white/40 transition-colors hover:text-white/70 disabled:cursor-wait disabled:opacity-45"
          aria-label="Close install prompt"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        <div className="px-6 pb-6 pt-5">
          <div className="mb-4 flex justify-center">
            <div className="flex h-[72px] w-[72px] items-center justify-center overflow-hidden rounded-[18px] border border-bp-accent/20 bg-bp-accent/10 shadow-[0_0_40px_rgba(242,154,11,0.18)]">
              <Image
                src="/brand/fav-icons/android-chrome-192x192.png"
                alt="PulseNow"
                width={56}
                height={56}
                className="h-14 w-14 object-contain"
              />
            </div>
          </div>

          <p className="mb-1 text-center text-[18px] font-black tracking-tight text-bp-text">
            Install PulseNow
          </p>
          <p className="mb-5 text-center text-[13px] leading-relaxed text-white/45">
            {statusText}
          </p>

          {installState !== "idle" && installState !== "unavailable" && (
            <div className="mb-4 overflow-hidden rounded-full border border-white/[0.08] bg-white/[0.04]">
              <div
                className="h-2 rounded-full bg-gradient-to-r from-bp-accent via-[#ffbf47] to-bp-win transition-[width] duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

          <div className="flex flex-col gap-2.5">
            <button
              onClick={install}
              disabled={isBusy || installState === "installed"}
              className="w-full rounded-2xl bg-gradient-to-b from-bp-accent to-[#c97e08] py-3 text-[14px] font-black uppercase tracking-wider text-[#1b1305] shadow-[0_2px_14px_rgba(242,154,11,0.4)] transition-all hover:opacity-95 active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
            >
              {isBusy ? "Installing..." : installState === "installed" ? "Installed" : "Install App"}
            </button>
            <button
              onClick={dismiss}
              disabled={isBusy}
              className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.03] py-3 text-[13px] font-semibold text-white/50 transition-colors hover:border-white/20 hover:text-white/70 disabled:cursor-wait disabled:opacity-45"
            >
              Not Now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { ToastProvider } from "@/components/ui/toast-provider";
import { PWAInstallPrompt } from "@/components/pwa-install-prompt";
import { ProtectedFinanceProvider } from "@/components/protected/finance-drawer-provider";
import { LobbyInner } from "./lobby-inner";

// Mirrors the providers the old /protected layout + lobby page supplied, but
// works for logged-out visitors too (the finance provider skips its wallet
// fetch when `isLoggedIn` is false).
export function LobbyExperience(props: React.ComponentProps<typeof LobbyInner>) {
  return (
    <ToastProvider>
      <ProtectedFinanceProvider isLoggedIn={props.isLoggedIn}>
        <LobbyInner {...props} />
      </ProtectedFinanceProvider>
      <PWAInstallPrompt />
    </ToastProvider>
  );
}

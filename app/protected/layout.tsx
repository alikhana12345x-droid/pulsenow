import { BottomNav } from "@/components/bottom-nav";
import { ProtectedFinanceProvider } from "@/components/protected/finance-drawer-provider";
import { PWAInstallPrompt } from "@/components/pwa-install-prompt";
import { ToastProvider } from "@/components/ui/toast-provider";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ToastProvider>
      <div className="min-h-screen flex bg-background">
        <div className="w-full" style={{ minHeight: "100dvh" }}>
          {children}
        </div>
        <PWAInstallPrompt />
      </div>
    </ToastProvider>
  );
}

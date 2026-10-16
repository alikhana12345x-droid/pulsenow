"use client";

import { useFinanceDrawer } from "@/components/protected/finance-drawer-provider";
import { useAuthModal } from "@/components/auth/auth-modal-provider";

type FinanceView = "menu" | "deposit" | "withdraw";

export function FinanceDrawerTrigger({
  action = "menu",
  className,
  children,
}: {
  action?: FinanceView;
  className?: string;
  children: React.ReactNode;
}) {
  const { openFinance, isLoggedIn } = useFinanceDrawer();
  const { openAuth } = useAuthModal();

  return (
    <button
      type="button"
      onClick={() => (isLoggedIn ? openFinance(action) : openAuth("login"))}
      className={className}
    >
      {children}
    </button>
  );
}

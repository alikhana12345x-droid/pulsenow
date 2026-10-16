"use client";

import { usePathname, useRouter } from "next/navigation";
import { Home, Gift, Wallet, LogIn, Headphones, User, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { T } from "./theme";
import { useFinanceDrawer } from "@/components/protected/finance-drawer-provider";
import { useAuthModal } from "@/components/auth/auth-modal-provider";

export function BottomNav({ isLoggedIn = true }: { isLoggedIn?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const { openFinance } = useFinanceDrawer();
  const { openAuth } = useAuthModal();

  // Protected destinations open the login modal (with a return path) when the
  // visitor is logged out, otherwise navigate normally.
  const go = (href: string) => {
    if (isLoggedIn) router.push(href);
    else openAuth("login", { next: href });
  };

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <nav
      style={{ background: T.bg, fontFamily: T.uiFont }}
      className="fixed bottom-0 left-1/2 z-50 w-full max-w-[600px] -translate-x-1/2 border-t border-border bg-card/95 backdrop-blur"
    >
      <div className="flex items-center justify-around h-16 px-1">
        <TabButton label="Home" icon={Home} active={isActive("/")} onClick={() => router.push("/")} />
        <TabButton label="Promo" icon={Gift} active={isActive("/protected/offers")} onClick={() => go("/protected/offers")} />

        {/* Elevated center action — Deposit when logged in, Login when not */}
        <button
          type="button"
          onClick={() => (isLoggedIn ? openFinance("deposit") : openAuth("login"))}
          className="flex flex-1 flex-col items-center gap-1"
          aria-label={isLoggedIn ? "Deposit" : "Login"}
        >
          <span className="-mt-6 flex h-12 w-12 items-center justify-center rounded-full border-4 border-bp-bg bg-gradient-to-b from-bp-accent to-[#c97e08] text-[#1b1305] shadow-[0_4px_16px_rgba(242,154,11,0.5)]">
            {isLoggedIn ? <Wallet size={20} strokeWidth={2.4} /> : <LogIn size={20} strokeWidth={2.4} />}
          </span>
          <span className="text-[10px] font-bold text-bp-accent">{isLoggedIn ? "Deposit" : "Login"}</span>
        </button>

        <TabButton label="Support" icon={Headphones} active={isActive("/protected/support")} onClick={() => go("/protected/support")} />
        <TabButton label="Profile" icon={User} active={isActive("/protected/profile")} onClick={() => go("/protected/profile")} />
      </div>
    </nav>
  );
}

function TabButton({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-1 flex-col items-center gap-1 rounded-lg px-3 py-2 transition-colors",
        active ? "text-primary" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon size={20} strokeWidth={active ? 2.5 : 1.5} />
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}

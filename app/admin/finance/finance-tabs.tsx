import Link from "next/link";
import type { ReactNode } from "react";

type FinanceTab = "deposits" | "withdrawals";

export function FinanceTabs({
  activeTab,
  depositsCount,
  withdrawalsCount,
  depositsTab,
  withdrawalsTab,
}: {
  activeTab: FinanceTab;
  depositsCount: number;
  withdrawalsCount: number;
  depositsTab: ReactNode;
  withdrawalsTab: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="flex w-fit gap-1 rounded-full border border-border/70 bg-card/70 p-1">
        <TabLink
          href="/admin/finance?tab=deposits"
          active={activeTab === "deposits"}
          label="Deposits"
          count={depositsCount}
        />
        <TabLink
          href="/admin/finance?tab=withdrawals"
          active={activeTab === "withdrawals"}
          label="Withdrawals"
          count={withdrawalsCount}
        />
      </div>

      <div>{activeTab === "deposits" ? depositsTab : withdrawalsTab}</div>
    </div>
  );
}

function TabLink({
  href,
  active,
  label,
  count,
}: {
  href: string;
  active: boolean;
  label: string;
  count: number;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      className={`rounded-full px-5 py-2 text-sm font-medium transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      }`}
    >
      {label}
      <span
        className={`ml-2 rounded-full px-2 py-0.5 text-[11px] tabular-nums ${
          active ? "bg-black/15" : "bg-muted text-muted-foreground"
        }`}
      >
        {count}
      </span>
    </Link>
  );
}

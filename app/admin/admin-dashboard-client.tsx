"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { getAdminDashboardStats } from "@/lib/actions/admin";
import { can, type Capability } from "@/lib/auth/roles";

type DashboardStats = Awaited<ReturnType<typeof getAdminDashboardStats>>;

const pkr = (n: number) =>
  `PKR ${n.toLocaleString("en-PK", { maximumFractionDigits: 0 })}`;

type Tile = {
  label: string;
  value: string | number;
  note?: string;
  href?: string;
  /** Capability the href needs — without it the tile renders unlinked. */
  needs?: Capability;
  color: string;
};

export function AdminDashboardClient({
  initialStats,
}: {
  initialStats: DashboardStats;
}) {
  const { data: stats = initialStats } = useQuery({
    queryKey: ["admin", "dashboard"],
    queryFn: getAdminDashboardStats,
    initialData: initialStats,
    initialDataUpdatedAt: Date.now(),
    // Pending liability is a live figure — keep it moving without a reload.
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const role = stats.viewerRole;

  const topStats = [
    { label: "Total Users", value: stats.totalUsers, href: "/admin/users", color: "text-blue-400" },
    { label: "Pending Deposits", value: stats.pendingDeposits, href: "/admin/finance?tab=deposits", color: "text-yellow-400" },
    { label: "Failed Withdrawals", value: stats.failedWithdrawals, href: "/admin/finance?tab=withdrawals", color: "text-red-400" },
  ];

  // All-time money movement. Deposits count once confirmed, withdrawals once
  // completed — the same rule the Reports section applies.
  const moneyTiles: Tile[] = [
    {
      label: "Total Deposits",
      value: pkr(stats.totalDeposits),
      note: "Confirmed, all-time",
      href: "/admin/finance?tab=deposits",
      color: "text-green-400",
    },
    {
      label: "Total Withdrawals",
      value: pkr(stats.totalWithdrawals),
      note: "Completed, all-time",
      href: "/admin/finance?tab=withdrawals",
      color: "text-orange-400",
    },
    {
      label: "Net Cash Flow",
      value: pkr(stats.netCashFlow),
      note: "Deposits - Withdrawals",
      color: stats.netCashFlow >= 0 ? "text-green-400" : "text-red-400",
    },
    {
      label: "Pending Liability",
      value: pkr(stats.pendingLiability),
      note: "Player balances, live",
      color: "text-sky-400",
    },
    {
      label: "Gross Gaming Revenue",
      value: pkr(stats.ggr),
      note: "Wagered - Won",
      href: "/admin/reports",
      needs: "view_reports",
      color: "text-primary",
    },
  ];

  const opsTiles: Tile[] = [
    { label: "Total Users", value: stats.totalUsers, href: "/admin/users", color: "text-blue-400" },
    { label: "Pending Deposits", value: stats.pendingDeposits, href: "/admin/finance?tab=deposits", color: "text-yellow-400" },
    { label: "Pending Withdrawals", value: stats.pendingWithdrawals, href: "/admin/finance?tab=withdrawals", color: "text-yellow-400" },
    { label: "Failed Withdrawals", value: stats.failedWithdrawals, href: "/admin/finance?tab=withdrawals", color: "text-red-400" },
    {
      label: "Active Payment Accounts",
      value: stats.activeAccounts,
      href: "/admin/payment-accounts",
      needs: "manage_payment_accounts",
      color: "text-green-400",
    },
    { label: "Banned Users", value: stats.bannedUsers, href: "/admin/users", color: "text-red-400" },
    { label: "Referrals", value: stats.totalReferrals, href: "/admin/referrals", color: "text-purple-400" },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <section className="rounded-[24px] border border-border/70 bg-card/80 p-4 shadow-sm sm:rounded-[28px] sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary/80">
              Admin Overview
            </p>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl">
              Platform control centre.
            </h1>
            <p className="text-sm text-muted-foreground">
              All deposits and withdrawals are processed automatically. Use this
              panel to monitor activity, process the cash desk, and manage
              accounts.
            </p>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] sm:grid sm:grid-cols-3 sm:gap-3 sm:overflow-visible sm:rounded-2xl sm:border sm:border-border/70 sm:bg-background/70 sm:p-3 sm:pb-3 sm:text-center">
            {topStats.map(({ label, value, color }) => (
              <div
                key={label}
                className="shrink-0 rounded-xl border border-border/60 bg-card px-4 py-3 text-center sm:min-w-0 sm:border-0 sm:px-3 sm:py-4"
              >
                <p className={`text-xl font-bold sm:text-2xl ${color}`}>
                  {value}
                </p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground sm:text-[11px]">
                  {label.replace("Pending ", "").replace("Total ", "")}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Section title="Money">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-5">
          {moneyTiles.map((tile) => (
            <StatTile key={tile.label} tile={tile} role={role} emphasis />
          ))}
        </div>
      </Section>

      <Section title="Operations">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
          {opsTiles.map((tile) => (
            <StatTile key={tile.label} tile={tile} role={role} />
          ))}
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
        {title}
      </p>
      {children}
    </section>
  );
}

/**
 * One stat. Links to its section only when the viewer can actually open it —
 * an admin sees the same figure as a superadmin, just without a link that would
 * bounce them straight back here.
 */
function StatTile({
  tile,
  role,
  emphasis = false,
}: {
  tile: Tile;
  role: string;
  emphasis?: boolean;
}) {
  const { label, value, note, href, needs, color } = tile;
  const openable = href && (!needs || can(role, needs));

  const body = (
    <>
      <p className="text-xs text-muted-foreground sm:text-sm">{label}</p>
      <p
        className={`mt-1.5 font-bold sm:mt-2 ${color} ${
          emphasis ? "text-lg sm:text-2xl" : "text-2xl sm:text-3xl"
        }`}
      >
        {value}
      </p>
      {note && (
        <p className="mt-3 text-[10px] text-muted-foreground sm:mt-4 sm:text-xs">
          {note}
        </p>
      )}
    </>
  );

  const shell =
    "rounded-[20px] border border-border/70 bg-card/80 p-4 sm:rounded-[24px] sm:p-5";

  if (!openable) {
    return <div className={shell}>{body}</div>;
  }

  return (
    <Link
      href={href}
      prefetch={false}
      className={`group ${shell} transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md`}
    >
      {body}
      {!note && (
        <p className="mt-3 text-xs text-primary opacity-0 transition-opacity group-hover:opacity-100 sm:mt-4 sm:text-sm">
          Open section -&gt;
        </p>
      )}
    </Link>
  );
}

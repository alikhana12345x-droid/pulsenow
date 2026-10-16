import Link from "next/link";
import type { ReactNode } from "react";

type AuditTab = "platform" | "players";

export function AuditTabs({
  activeTab,
  platformCount,
  playerCount,
  platformTab,
  playersTab,
}: {
  activeTab: AuditTab;
  platformCount: number;
  playerCount: number;
  platformTab: ReactNode;
  playersTab: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="flex w-fit gap-1 rounded-full border border-border/70 bg-card/70 p-1">
        <TabLink
          href="/admin/audit?tab=platform"
          active={activeTab === "platform"}
          label="Platform Audit"
          count={platformCount}
        />
        <TabLink
          href="/admin/audit?tab=players"
          active={activeTab === "players"}
          label="Player Audit"
          count={playerCount}
        />
      </div>

      <div>{activeTab === "platform" ? platformTab : playersTab}</div>
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
      className={`rounded-full px-4 py-2 text-sm font-medium transition-colors sm:px-5 ${
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
        {count.toLocaleString("en-PK")}
      </span>
    </Link>
  );
}

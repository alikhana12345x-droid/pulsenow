import Link from "next/link";
import { type ReportDateRange, toDateObjects } from "./range-utils";
import { OverviewTab } from "./tabs/overview-tab";
import { RevenueTab } from "./tabs/revenue-tab";
import { GamesTab } from "./tabs/games-tab";
import { CashTab } from "./tabs/cash-tab";
import { ValidationTab } from "./tabs/validation-tab";

const TABS = [
  { value: "overview", label: "Overview" },
  { value: "revenue", label: "Revenue" },
  { value: "games", label: "Games" },
  { value: "cash", label: "Cash" },
  { value: "validation", label: "Validation" },
];

export async function ReportsTabs({
  range,
  activeTab,
}: {
  range: ReportDateRange;
  activeTab: string;
}) {
  const tab = TABS.find((t) => t.value === activeTab) ? activeTab : "overview";
  const { from, to } = toDateObjects(range);

  // Build query string preserving preset/grain/from/to
  function tabHref(value: string) {
    const qs = new URLSearchParams({
      tab: value,
      preset: range.preset,
      grain: range.grain,
      ...(range.preset === "custom" ? { from: range.from, to: range.to } : {}),
    });
    return `/admin/reports?${qs.toString()}`;
  }

  return (
    <div className="space-y-5">
      {/* Tab bar */}
      <nav className="flex gap-1 overflow-x-auto rounded-xl border border-border/70 bg-card/80 p-1 [scrollbar-width:none]">
        {TABS.map(({ value, label }) => (
          <Link
            key={value}
            href={tabHref(value)}
            prefetch={false}
            className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {/* Active tab content */}
      {tab === "overview" && <OverviewTab from={from} to={to} grain={range.grain} />}
      {tab === "revenue" && <RevenueTab from={from} to={to} grain={range.grain} />}
      {tab === "games" && <GamesTab from={from} to={to} />}
      {tab === "cash" && <CashTab from={from} to={to} />}
      {tab === "validation" && <ValidationTab from={from} to={to} />}
    </div>
  );
}

import { Suspense } from "react";
import { requireCapabilityPage } from "@/lib/auth/permissions";
import { parseDateRange } from "./range-utils";
import { DateRangePicker } from "./date-range-picker";
import { RefreshControls } from "./refresh-controls";
import { ReportsTabs } from "./reports-tabs";
import AdminLoading from "../loading";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireCapabilityPage("view_reports");
  const sp = await searchParams;
  const params = new URLSearchParams(
    Object.fromEntries(
      Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : (v ?? "")])
    )
  );
  const range = parseDateRange(params);
  const activeTab = (params.get("tab") as string) || "overview";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary/80">
          Analytics
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Revenue, player activity, cash flow, and win-probability validation —
          all bounded to the date range you select.
        </p>
      </div>

      {/* Global date-range picker + refresh controls */}
      <Suspense fallback={null}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <DateRangePicker range={range} />
          <RefreshControls />
        </div>
      </Suspense>

      {/* Tab nav + content */}
      <Suspense fallback={<AdminLoading />}>
        <ReportsTabs range={range} activeTab={activeTab} />
      </Suspense>
    </div>
  );
}

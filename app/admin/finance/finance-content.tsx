import {
  getAdminDepositsPage,
  getAdminDepositsSummary,
  getAdminWithdrawalsPage,
  getAdminWithdrawalsSummary,
  type DepositFilter,
  type WithdrawalFilter,
} from "@/lib/actions/admin";
import { readChoice, readListParams, type RawParams } from "../list-params";
import { FinanceTabs } from "./finance-tabs";
import { DepositsPanel } from "./deposits-table";
import { WithdrawalsPanel } from "./withdrawals-table";

const DEPOSIT_FILTERS: readonly DepositFilter[] = ["pending", "confirmed", "declined"];
const WITHDRAWAL_FILTERS: readonly WithdrawalFilter[] = ["pending", "processing", "held", "completed", "rejected"];

/**
 * Load a page, and if it's past the end (the list shrank, or a stale link),
 * load the last page that exists instead of showing an empty one.
 */
async function loadPage<T extends { rows: unknown[]; total: number; totalPages: number }>(
  page: number,
  load: (page: number) => Promise<T>
) {
  const data = await load(page);
  return data.rows.length === 0 && data.total > 0 && page > data.totalPages
    ? load(data.totalPages)
    : data;
}

export async function FinanceContent({ searchParams }: { searchParams: RawParams }) {
  const activeTab = searchParams.tab === "withdrawals" ? "withdrawals" : "deposits";
  const { q, page, size } = readListParams(searchParams);

  const depositStatus = readChoice(searchParams, "status", DEPOSIT_FILTERS);
  const withdrawalStatus = readChoice(searchParams, "status", WITHDRAWAL_FILTERS);

  // Only the open tab's list is fetched; the other tab just needs its counts.
  const [deposits, withdrawals] = await Promise.all([
    activeTab === "deposits"
      ? loadPage(page, (p) => getAdminDepositsPage({ page: p, pageSize: size, status: depositStatus, q }))
      : null,
    activeTab === "withdrawals"
      ? loadPage(page, (p) => getAdminWithdrawalsPage({ page: p, pageSize: size, status: withdrawalStatus, q }))
      : null,
  ]);
  const [depositCounts, withdrawalCounts] = await Promise.all([
    deposits?.counts ?? getAdminDepositsSummary(),
    withdrawals?.counts ?? getAdminWithdrawalsSummary(),
  ]);

  const stats = [
    { label: "Pending Deposits", value: depositCounts.pending, color: "text-yellow-400" },
    { label: "Confirmed Deposits", value: depositCounts.confirmed, color: "text-green-400" },
    { label: "Withdrawals to Pay", value: withdrawalCounts.pending, color: "text-orange-400" },
    { label: "Paid Withdrawals", value: withdrawalCounts.completed, color: "text-green-400" },
  ];

  const narrowed = q !== "" || (activeTab === "deposits" ? !!depositStatus : !!withdrawalStatus);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary/80">
          Finance
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">
          Deposits & Withdrawals
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review money movement, process pending requests, and search the full ledger.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(({ label, value, color }) => (
          <div
            key={label}
            className="rounded-2xl border border-border/70 bg-card/80 px-4 py-3"
          >
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`mt-1 text-2xl font-bold tabular-nums ${color}`}>
              {value.toLocaleString("en-PK")}
            </p>
          </div>
        ))}
      </div>

      <FinanceTabs
        activeTab={activeTab}
        depositsCount={depositCounts.all}
        withdrawalsCount={withdrawalCounts.all}
        depositsTab={deposits && <DepositsPanel data={deposits} narrowed={narrowed} />}
        withdrawalsTab={withdrawals && <WithdrawalsPanel data={withdrawals} narrowed={narrowed} />}
      />
    </div>
  );
}

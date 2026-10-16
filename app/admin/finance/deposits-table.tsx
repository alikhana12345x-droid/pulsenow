import type { getAdminDepositsPage } from "@/lib/actions/admin";
import { PaymentMethodLogo, paymentMethodLabel } from "@/components/payment-method-logo";
import { ForceCompleteDepositButton, CancelDepositButton } from "../deposits/deposit-actions";
import { UserIdentity } from "../user-identity";
import {
  ListNav,
  ListResults,
  ListToolbar,
  UrlEmptyList,
  UrlFilterPills,
  UrlPagination,
  UrlSearch,
} from "../list-controls";
import { LIST_PAGE_SIZES } from "../list-params";
import {
  CARD,
  CARD_GRID,
  DateCell,
  PanelNote,
  TABLE_CARD,
  TD,
  TH,
  TR,
  fmtDateTime,
} from "../table-parts";
import { DepositProofButton } from "./deposit-proof-button";
import { SyncStatusButton } from "./sync-status-button";

type DepositsPage = Awaited<ReturnType<typeof getAdminDepositsPage>>;
type DepositRow = DepositsPage["rows"][number];

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-400",
  confirmed: "bg-green-500/20 text-green-400",
  cancelled: "bg-red-500/20 text-red-400",
  failed: "bg-red-500/20 text-red-400",
};

/** Gateways that settle themselves — there is nothing here for an admin to approve. */
const AUTO_SETTLED = new Set(["solidpay"]);

const isAuto = (d: DepositRow) => AUTO_SETTLED.has(d.gateway ?? "");

function money(value: string) {
  return Number(value).toLocaleString("en-PK", { maximumFractionDigits: 2 });
}

function StatusChip({ status }: { status: string }) {
  return (
    <span
      className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${
        STATUS_COLORS[status] ?? "bg-secondary text-muted-foreground"
      }`}
    >
      {status}
    </span>
  );
}

/** Which of our accounts the player paid into. */
function PayTo({ d }: { d: DepositRow }) {
  const label = paymentMethodLabel(d.gateway);
  return (
    <div className="flex min-w-0 items-center gap-2">
      {d.gateway && <PaymentMethodLogo gateway={d.gateway} label={label} size={24} />}
      <div className="min-w-0 leading-tight">
        <p className="truncate text-[13px]" title={d.account_label ?? undefined}>
          {d.account_label ?? "—"}
        </p>
        {d.gateway && <p className="text-[11px] text-muted-foreground">{label}</p>}
      </div>
    </div>
  );
}

function Proof({ d }: { d: DepositRow }) {
  return isAuto(d) ? (
    <span className="text-[11px] text-muted-foreground">Gateway</span>
  ) : (
    <DepositProofButton depositId={d.id} />
  );
}

/** Approve / reject a manual deposit, or re-check a stuck gateway one. Nothing once settled. */
function Actions({ d, inCard = false }: { d: DepositRow; inCard?: boolean }) {
  if (d.status !== "pending") return null;
  return isAuto(d) ? (
    <SyncStatusButton id={d.id} kind="deposit" compact={!inCard} />
  ) : (
    <>
      <ForceCompleteDepositButton depositId={d.id} />
      <CancelDepositButton depositId={d.id} />
    </>
  );
}

function DepositCard({ d }: { d: DepositRow }) {
  return (
    <article className={CARD}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <UserIdentity user={{ ...d, id: d.user_id }} size={32} showEmail={false} />
        </div>
        <span className="shrink-0 text-right font-mono text-base font-bold">
          {money(d.amount)}
          <span className="ml-1 text-[10px] font-normal text-muted-foreground">{d.currency}</span>
        </span>
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-background/40 px-3 py-2">
        <PayTo d={d} />
        <StatusChip status={d.status} />
      </div>

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">{fmtDateTime(d.created_at)}</span>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <Proof d={d} />
          <Actions d={d} inCard />
        </div>
      </div>
    </article>
  );
}

export function DepositsPanel({ data, narrowed }: { data: DepositsPage; narrowed: boolean }) {
  const { rows, counts } = data;

  return (
    <ListNav>
      <PanelNote>
        Manual deposits need a screenshot check before you approve or reject. Gateway deposits
        settle themselves — sync one only if a confirmation looks stuck.
      </PanelNote>

      <ListToolbar
        search={<UrlSearch label="Search deposits" placeholder="Player, phone, TID, reference or amount" />}
        filters={
          <UrlFilterPills
            param="status"
            label="Filter deposits"
            options={[
              { key: "", label: "All", count: counts.all },
              { key: "pending", label: "Pending", count: counts.pending },
              { key: "confirmed", label: "Confirmed", count: counts.confirmed },
              { key: "declined", label: "Declined", count: counts.declined },
            ]}
          />
        }
      />

      <ListResults>
        {rows.length === 0 ? (
          <UrlEmptyList
            narrowed={narrowed}
            message={narrowed ? "No deposits match these filters." : "No deposits yet."}
          />
        ) : (
          <>
            {/* Phones and tablets: cards, two across once there's room. */}
            <div className={CARD_GRID}>
              {rows.map((d) => (
                <DepositCard key={d.id} d={d} />
              ))}
            </div>

            {/* Wide screens: the table. */}
            <div className={TABLE_CARD}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/60">
                      <th className={`${TH} text-left`}>User</th>
                      <th className={`${TH} text-right`}>Amount</th>
                      <th className={`${TH} text-left`}>Pay to</th>
                      <th className={`${TH} text-left`}>Status</th>
                      <th className={`${TH} text-left`}>Proof</th>
                      <th className={`${TH} text-left`}>Date</th>
                      <th className={`${TH} text-right`}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((d) => (
                      <tr key={d.id} className={TR}>
                        <td className={TD}>
                          <div className="max-w-[220px]">
                            <UserIdentity user={{ ...d, id: d.user_id }} size={28} />
                          </div>
                        </td>
                        <td className={`${TD} whitespace-nowrap text-right font-mono font-semibold`}>
                          {money(d.amount)}
                          <span className="ml-1 text-[10px] font-normal text-muted-foreground">{d.currency}</span>
                        </td>
                        <td className={TD}>
                          <div className="max-w-[180px]">
                            <PayTo d={d} />
                          </div>
                        </td>
                        <td className={TD}>
                          <StatusChip status={d.status} />
                        </td>
                        <td className={TD}>
                          <Proof d={d} />
                        </td>
                        <td className={TD}>
                          <DateCell value={d.created_at} />
                        </td>
                        <td className={TD}>
                          <div className="flex items-center justify-end gap-1.5">
                            <Actions d={d} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </ListResults>

      {rows.length > 0 && (
        <UrlPagination
          page={data.page}
          pageCount={data.totalPages}
          pageSize={data.pageSize}
          total={data.total}
          overall={narrowed ? counts.all : null}
          sizes={LIST_PAGE_SIZES}
        />
      )}
    </ListNav>
  );
}

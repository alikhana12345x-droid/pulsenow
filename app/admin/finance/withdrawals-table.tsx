import type { getAdminWithdrawalsPage } from "@/lib/actions/admin";
import { PaymentMethodLogo, paymentMethodLabel } from "@/components/payment-method-logo";
import { CompleteWithdrawalButton, RejectWithdrawalButton } from "@/app/admin/withdrawals/withdrawal-actions";
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
import { SyncStatusButton } from "./sync-status-button";
import { WithdrawalShareButton, type ShareableWithdrawal } from "./withdrawal-share-button";

type WithdrawalsPage = Awaited<ReturnType<typeof getAdminWithdrawalsPage>>;
type WithdrawalRow = WithdrawalsPage["rows"][number];

/** Providers that dispatch and settle payouts themselves. */
const AUTO_SETTLED = new Set(["solidpay"]);

const STATUS_COLORS: Record<string, string> = {
  pending:    "bg-yellow-500/20 text-yellow-400",
  processing: "bg-blue-500/20 text-blue-400",
  completed:  "bg-green-500/20 text-green-400",
  failed:     "bg-red-500/20 text-red-400",
  rejected:   "bg-red-500/20 text-red-400",
};

const CHIP = "whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold";

type WithdrawalMeta = {
  provider?: string;
  dispatch?: string;
  hold?: boolean;
  manual_reason?: string;
  acct_name?: string | null;
};

const metaOf = (w: WithdrawalRow) => (w.metadata ?? {}) as WithdrawalMeta;

const isAuto = (w: WithdrawalRow) => AUTO_SETTLED.has(String(metaOf(w).provider ?? ""));

const isOpen = (w: WithdrawalRow) => w.status === "processing" || w.status === "pending";

/**
 * Waiting for an admin to send the money by hand: manual mode, a player whose
 * withdrawals are held, or a gateway payout that failed (never auto-refunded).
 */
const needsManualPayout = (w: WithdrawalRow) =>
  !isAuto(w) || metaOf(w).dispatch === "manual_review";

function money(value: string) {
  return Number(value).toLocaleString("en-PK", { maximumFractionDigits: 2 });
}

function toShareable(w: WithdrawalRow): ShareableWithdrawal {
  const meta = metaOf(w);
  return {
    id: w.id,
    amount: w.amount,
    currency: w.currency,
    method: w.method,
    destination: w.destination,
    status: w.status,
    rejectionReason: w.rejection_reason,
    gatewayRef: w.gateway_ref,
    held: !!meta.hold,
    accountName: meta.acct_name ?? null,
    deskNote: !meta.hold && meta.dispatch === "manual_review" ? meta.manual_reason ?? null : null,
    createdAt: new Date(w.created_at).toISOString(),
    processedAt: w.processed_at ? new Date(w.processed_at).toISOString() : null,
    player: {
      name: w.display_name || w.username || "there",
      username: w.username,
      phone: w.phone,
    },
  };
}

/** The status chip, plus why an open one is sitting with the desk. */
function StatusCell({ w }: { w: WithdrawalRow }) {
  const meta = metaOf(w);
  const open = isOpen(w);

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-1">
        <span className={`${CHIP} capitalize ${STATUS_COLORS[w.status] ?? "bg-secondary text-muted-foreground"}`}>
          {w.status}
        </span>
        {meta.hold ? (
          <span
            className={`${CHIP} bg-orange-500/20 text-orange-400`}
            title="This player's withdrawals are on hold — it was never sent to the gateway"
          >
            Held
          </span>
        ) : (
          open && isAuto(w) && meta.dispatch === "manual_review" && (
            <span
              className={`${CHIP} bg-orange-500/20 text-orange-400`}
              title="The gateway couldn't pay this out. The balance is still deducted — send it by hand, or reject to refund."
            >
              Pay manually
            </span>
          )
        )}
      </div>
      {open && meta.manual_reason && !meta.hold && (
        <p className="mt-1 truncate text-[11px] text-orange-400/80" title={meta.manual_reason}>
          {meta.manual_reason}
        </p>
      )}
      {w.rejection_reason && (
        <p className="mt-1 truncate text-[11px] text-red-400/80" title={w.rejection_reason}>
          {w.rejection_reason}
        </p>
      )}
    </div>
  );
}

/** Method and the wallet it pays into, stacked — one column instead of two. */
function PayoutTo({ w }: { w: WithdrawalRow }) {
  const label = paymentMethodLabel(w.method);
  return (
    <div className="flex min-w-0 items-center gap-2">
      <PaymentMethodLogo gateway={w.method} label={label} size={24} />
      <div className="min-w-0 leading-tight">
        <p className="text-[13px]">{label}</p>
        <p className="truncate font-mono text-[11px] text-muted-foreground" title={w.destination}>
          {w.destination}
        </p>
      </div>
    </div>
  );
}

/** Share, plus whatever still has to happen to an open withdrawal. */
function Actions({ w, inCard = false }: { w: WithdrawalRow; inCard?: boolean }) {
  const open = isOpen(w);
  return (
    <>
      <WithdrawalShareButton withdrawal={toShareable(w)} withLabel={inCard} />
      {/* A gateway payout — in flight, or failed — can be re-checked with SolidPay. */}
      {open && isAuto(w) && <SyncStatusButton id={w.id} kind="withdrawal" compact={!inCard} />}
      {open && needsManualPayout(w) && (
        <>
          <CompleteWithdrawalButton withdrawalId={w.id} />
          <RejectWithdrawalButton withdrawalId={w.id} />
        </>
      )}
    </>
  );
}

function WithdrawalCard({ w }: { w: WithdrawalRow }) {
  return (
    <article className={CARD}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <UserIdentity user={{ ...w, id: w.user_id }} size={32} showEmail={false} />
        </div>
        <span className="shrink-0 text-right font-mono text-base font-bold">
          {money(w.amount)}
          <span className="ml-1 text-[10px] font-normal text-muted-foreground">{w.currency}</span>
        </span>
      </div>

      <div className="mt-2.5 flex items-start justify-between gap-3 rounded-xl border border-border/50 bg-background/40 px-3 py-2">
        <PayoutTo w={w} />
        <div className="shrink-0 text-right">
          <StatusCell w={w} />
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">{fmtDateTime(w.created_at)}</span>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <Actions w={w} inCard />
        </div>
      </div>
    </article>
  );
}

export function WithdrawalsPanel({ data, narrowed }: { data: WithdrawalsPage; narrowed: boolean }) {
  const { rows, counts } = data;

  return (
    <ListNav>
      <PanelNote>
        The balance is already deducted on every request. Manual payouts — including{" "}
        <span className="text-orange-400">held</span> players and gateway payouts that{" "}
        <span className="text-orange-400">failed</span> — wait for you to send the money and mark
        them complete; rejecting refunds the player. Nothing is refunded automatically.
      </PanelNote>

      <ListToolbar
        search={
          <UrlSearch
            label="Search withdrawals"
            placeholder="Player, wallet, reference or amount"
          />
        }
        filters={
          <UrlFilterPills
            param="status"
            label="Filter withdrawals"
            options={[
              { key: "", label: "All", count: counts.all },
              { key: "pending", label: "To pay", count: counts.pending },
              { key: "held", label: "Held", count: counts.held },
              { key: "processing", label: "With gateway", count: counts.processing },
              { key: "completed", label: "Paid", count: counts.completed },
              { key: "rejected", label: "Rejected", count: counts.rejected },
            ]}
          />
        }
      />

      <ListResults>
        {rows.length === 0 ? (
          <UrlEmptyList
            narrowed={narrowed}
            message={narrowed ? "No withdrawals match these filters." : "No withdrawals yet."}
          />
        ) : (
          <>
            {/* Phones and tablets: cards, two across once there's room. */}
            <div className={CARD_GRID}>
              {rows.map((w) => (
                <WithdrawalCard key={w.id} w={w} />
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
                    <th className={`${TH} text-left`}>Payout to</th>
                    <th className={`${TH} text-left`}>Status</th>
                    <th className={`${TH} text-left`}>Requested</th>
                    <th className={`${TH} text-right`}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((w) => (
                    <tr key={w.id} className={TR}>
                      <td className={TD}>
                        <div className="max-w-[210px]">
                          <UserIdentity user={{ ...w, id: w.user_id }} size={28} />
                        </div>
                      </td>
                      <td className={`${TD} whitespace-nowrap text-right font-mono font-semibold`}>
                        {money(w.amount)}
                        <span className="ml-1 text-[10px] font-normal text-muted-foreground">{w.currency}</span>
                      </td>
                      <td className={TD}>
                        <div className="max-w-[160px]">
                          <PayoutTo w={w} />
                        </div>
                      </td>
                      <td className={TD}>
                        <div className="max-w-[170px]">
                          <StatusCell w={w} />
                        </div>
                      </td>
                      <td className={TD}>
                        <DateCell value={w.created_at} />
                      </td>
                      <td className={TD}>
                        <div className="flex items-center justify-end gap-1.5">
                          <Actions w={w} />
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

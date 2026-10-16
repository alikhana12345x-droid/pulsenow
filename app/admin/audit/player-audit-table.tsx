import type { getPlayerAuditPage, PlayerAuditRow } from "@/lib/actions/admin";
import { APP_TIME_ZONE } from "@/lib/time";
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
import { CARD, CARD_GRID, DateCell, PanelNote, TABLE_CARD, TD, TH, TR } from "../table-parts";
import { AuditDetailButton } from "./audit-detail-button";

type PlayerAuditPage = Awaited<ReturnType<typeof getPlayerAuditPage>>;

const SOURCE_COLORS: Record<PlayerAuditRow["source"], string> = {
  transaction: "bg-blue-500/20 text-blue-400",
  deposit: "bg-green-500/20 text-green-400",
  withdrawal: "bg-red-500/20 text-red-400",
  bet: "bg-bp-accent/20 text-bp-accent",
};

function fmt(d: Date | string) {
  return new Date(d).toLocaleString("en-PK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: APP_TIME_ZONE,
  });
}

function humanize(value: string) {
  return value.replaceAll("_", " ");
}

function shortId(value: string | null) {
  return value ? value.slice(0, 8) : "-";
}

function Player({ row }: { row: PlayerAuditRow }) {
  return (
    <UserIdentity
      size={28}
      showEmail={false}
      user={{ id: row.user_id, username: row.username, display_name: row.display_name }}
    />
  );
}

function SourceChip({ row }: { row: PlayerAuditRow }) {
  return (
    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${SOURCE_COLORS[row.source]}`}>
      {humanize(row.source)}
    </span>
  );
}

function Amount({ row }: { row: PlayerAuditRow }) {
  return (
    <>
      {row.amount ? Number(row.amount).toLocaleString("en-PK", { maximumFractionDigits: 2 }) : "-"}
      {row.currency && <span className="ml-1 text-xs font-normal text-muted-foreground">{row.currency}</span>}
    </>
  );
}

function StatusChip({ row }: { row: PlayerAuditRow }) {
  return (
    <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold capitalize text-muted-foreground">
      {humanize(row.status ?? "-")}
    </span>
  );
}

function Detail({ row }: { row: PlayerAuditRow }) {
  return (
    <AuditDetailButton
      title={`${humanize(row.source)} / ${humanize(row.event)}`}
      subtitle={`${fmt(row.created_at)} for ${row.username ?? shortId(row.user_id)}`}
      record={{
        event_id: row.id,
        created_at: row.created_at,
        source: row.source,
        user_id: row.user_id,
        username: row.username,
        display_name: row.display_name,
        event: row.event,
        category: row.category,
        amount: row.amount,
        currency: row.currency,
        status: row.status,
        reference_type: row.reference_type,
        reference_id: row.reference_id,
        details: row.details,
      }}
    />
  );
}

function PlayerAuditCard({ row }: { row: PlayerAuditRow }) {
  return (
    <article className={CARD}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <SourceChip row={row} />
          <p className="mt-1.5 text-xs capitalize text-muted-foreground">
            {row.category} / {humanize(row.event)}
          </p>
        </div>
        <Detail row={row} />
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-border/50 bg-background/40 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <Player row={row} />
        </div>
        <p className="shrink-0 font-mono font-semibold">
          <Amount row={row} />
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
        <StatusChip row={row} />
        <span>
          {row.reference_type ?? "-"} <span className="font-mono">{shortId(row.reference_id)}</span>
        </span>
        <span className="ml-auto">{fmt(row.created_at)}</span>
      </div>
    </article>
  );
}

export function PlayerAuditPanel({ data, narrowed }: { data: PlayerAuditPage; narrowed: boolean }) {
  const { rows, counts } = data;
  const everything = counts.transaction + counts.deposit + counts.withdrawal + counts.bet;

  return (
    <ListNav>
      <PanelNote>
        Player deposits, withdrawals, wallet ledger entries, and gameplay activity in a single timeline.
      </PanelNote>

      <ListToolbar
        search={<UrlSearch label="Search player audit" placeholder="Player, event, reference or ID" />}
        filters={
          <UrlFilterPills
            param="source"
            label="Filter by source"
            options={[
              { key: "", label: "All", count: everything },
              { key: "transaction", label: "Wallet", count: counts.transaction },
              { key: "deposit", label: "Deposits", count: counts.deposit },
              { key: "withdrawal", label: "Withdrawals", count: counts.withdrawal },
              { key: "bet", label: "Bets", count: counts.bet },
            ]}
          />
        }
      />

      <ListResults>
        {rows.length === 0 ? (
          <UrlEmptyList
            narrowed={narrowed}
            message={narrowed ? "No player activity matches these filters." : "No player activity yet."}
          />
        ) : (
          <>
            <div className={CARD_GRID}>
              {rows.map((row) => (
                <PlayerAuditCard key={`${row.source}-${row.id}`} row={row} />
              ))}
            </div>

            <div className={TABLE_CARD}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/60">
                      <th className={`${TH} text-left`}>Time</th>
                      <th className={`${TH} text-left`}>Player</th>
                      <th className={`${TH} text-left`}>Event</th>
                      <th className={`${TH} text-right`}>Amount</th>
                      <th className={`${TH} text-left`}>Status</th>
                      <th className={`${TH} text-left`}>Reference</th>
                      <th className={`${TH} text-right`}>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr
                        key={`${row.source}-${row.id}`}
                        className={TR}
                      >
                        <td className={TD}>
                          <DateCell value={row.created_at} />
                        </td>
                        <td className={TD}>
                          <Player row={row} />
                        </td>
                        <td className={TD}>
                          <SourceChip row={row} />
                          <p className="mt-1 text-xs text-muted-foreground">
                            {row.category} / {humanize(row.event)}
                          </p>
                        </td>
                        <td className={`${TD} whitespace-nowrap text-right font-mono font-semibold`}>
                          <Amount row={row} />
                        </td>
                        <td className={TD}>
                          <StatusChip row={row} />
                        </td>
                        <td className={TD}>
                          <p className="text-xs text-muted-foreground">{row.reference_type ?? "-"}</p>
                          <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{shortId(row.reference_id)}</p>
                        </td>
                        <td className={`${TD} text-right`}>
                          <Detail row={row} />
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
          overall={narrowed ? everything : null}
          sizes={LIST_PAGE_SIZES}
        />
      )}
    </ListNav>
  );
}

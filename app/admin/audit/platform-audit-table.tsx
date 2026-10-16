import type { getPlatformAuditPage, PlatformAuditRow } from "@/lib/actions/admin";
import { APP_TIME_ZONE } from "@/lib/time";
import { UserIdentity, primaryName, shortId } from "../user-identity";
import {
  ListNav,
  ListResults,
  ListToolbar,
  UrlEmptyList,
  UrlPagination,
  UrlSearch,
  UrlSelectFilter,
} from "../list-controls";
import { LIST_PAGE_SIZES } from "../list-params";
import { CARD, CARD_GRID, DateCell, PanelNote, TABLE_CARD, TD, TH, TR } from "../table-parts";
import { AuditDetailButton } from "./audit-detail-button";

type PlatformAuditPage = Awaited<ReturnType<typeof getPlatformAuditPage>>;

const ACTION_COLORS: Record<string, string> = {
  ban_user: "bg-red-500/20 text-red-400",
  unban_user: "bg-green-500/20 text-green-400",
  change_role: "bg-blue-500/20 text-blue-400",
  set_health: "bg-blue-500/20 text-blue-400",
  hold_withdrawals: "bg-orange-500/20 text-orange-400",
  release_withdrawals: "bg-green-500/20 text-green-400",
  set_support_contacts: "bg-blue-500/20 text-blue-400",
  set_discord_notifications: "bg-blue-500/20 text-blue-400",
  adjust_balance: "bg-bp-accent/20 text-bp-accent",
  force_complete_deposit: "bg-green-500/20 text-green-400",
  cancel_deposit: "bg-red-500/20 text-red-400",
  complete_withdrawal: "bg-green-500/20 text-green-400",
  reject_withdrawal: "bg-red-500/20 text-red-400",
  change_kyc: "bg-blue-500/20 text-blue-400",
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

function ActionChip({ action }: { action: string }) {
  return (
    <span
      className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${
        ACTION_COLORS[action] ?? "bg-secondary text-muted-foreground"
      }`}
    >
      {humanize(action)}
    </span>
  );
}

function Admin({ row }: { row: PlatformAuditRow }) {
  return (
    <UserIdentity
      size={28}
      showEmail={false}
      showRole
      user={{
        id: row.admin_id,
        username: row.admin_username,
        display_name: row.admin_display_name,
        avatar_url: row.admin_avatar_url,
        role: row.admin_role,
      }}
    />
  );
}

/** A profile target has a person behind it; a deposit or withdrawal target is just a record id. */
function Target({ row }: { row: PlatformAuditRow }) {
  return row.target_username || row.target_display_name ? (
    <UserIdentity
      size={28}
      showEmail={false}
      user={{
        id: row.target_id,
        username: row.target_username,
        display_name: row.target_display_name,
        avatar_url: row.target_avatar_url,
      }}
    />
  ) : (
    <>
      <p className="font-medium capitalize">{humanize(row.target_type)}</p>
      <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{shortId(row.target_id)}</p>
    </>
  );
}

function Detail({ row }: { row: PlatformAuditRow }) {
  return (
    <AuditDetailButton
      title={humanize(row.action)}
      subtitle={`${fmt(row.created_at)} by ${primaryName({
        id: row.admin_id,
        username: row.admin_username,
        display_name: row.admin_display_name,
      })}`}
      record={{
        audit_id: row.id,
        created_at: row.created_at,
        admin_id: row.admin_id,
        admin_username: row.admin_username,
        admin_display_name: row.admin_display_name,
        admin_role: row.admin_role,
        action: row.action,
        target_type: row.target_type,
        target_id: row.target_id,
        target_username: row.target_username,
        target_display_name: row.target_display_name,
        ip_address: row.ip_address,
        details: row.details,
      }}
    />
  );
}

function PlatformAuditCard({ row }: { row: PlatformAuditRow }) {
  return (
    <article className={CARD}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <ActionChip action={row.action} />
          <p className="mt-1.5 text-xs text-muted-foreground">{fmt(row.created_at)}</p>
        </div>
        <Detail row={row} />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 rounded-2xl border border-border/50 bg-background/40 px-3 py-2.5 sm:grid-cols-2">
        <div className="min-w-0">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Admin</p>
          <Admin row={row} />
        </div>
        <div className="min-w-0">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Target</p>
          <Target row={row} />
        </div>
      </div>

      {row.ip_address && (
        <p className="mt-3 font-mono text-[11px] text-muted-foreground">IP {row.ip_address}</p>
      )}
    </article>
  );
}

export function PlatformAuditPanel({ data, narrowed }: { data: PlatformAuditPage; narrowed: boolean }) {
  const { rows, actions } = data;
  const everything = actions.reduce((n, a) => n + a.count, 0);

  return (
    <ListNav>
      <PanelNote>
        Administrative decisions, target records, actor identity, and action metadata.
      </PanelNote>

      <ListToolbar
        search={
          <>
            <UrlSearch label="Search platform audit" placeholder="Admin, player, action, note or ID" />
            <UrlSelectFilter
              param="action"
              label="Filter by action"
              allLabel="All actions"
              options={actions.map((a) => ({ key: a.action, label: humanize(a.action), count: a.count }))}
            />
          </>
        }
      />

      <ListResults>
        {rows.length === 0 ? (
          <UrlEmptyList
            narrowed={narrowed}
            message={narrowed ? "No audit records match these filters." : "No platform audit records yet."}
          />
        ) : (
          <>
            <div className={CARD_GRID}>
              {rows.map((row) => (
                <PlatformAuditCard key={row.id} row={row} />
              ))}
            </div>

            <div className={TABLE_CARD}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/60">
                      <th className={`${TH} text-left`}>Time</th>
                      <th className={`${TH} text-left`}>Admin</th>
                      <th className={`${TH} text-left`}>Action</th>
                      <th className={`${TH} text-left`}>Target</th>
                      <th className={`${TH} text-left`}>IP</th>
                      <th className={`${TH} text-right`}>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} className={TR}>
                        <td className={TD}>
                          <DateCell value={row.created_at} />
                        </td>
                        <td className={TD}>
                          <Admin row={row} />
                        </td>
                        <td className={TD}>
                          <ActionChip action={row.action} />
                        </td>
                        <td className={TD}>
                          <Target row={row} />
                        </td>
                        <td className={`${TD} font-mono text-xs text-muted-foreground`}>{row.ip_address ?? "-"}</td>
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

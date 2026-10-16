import {
  getAdminAuditSummary,
  getPlatformAuditPage,
  getPlayerAuditPage,
  type PlayerAuditSource,
} from "@/lib/actions/admin";
import { readChoice, readListParams, type RawParams } from "../list-params";
import { AuditTabs } from "./audit-tabs";
import { PlatformAuditPanel } from "./platform-audit-table";
import { PlayerAuditPanel } from "./player-audit-table";

const SOURCES: readonly PlayerAuditSource[] = ["transaction", "deposit", "withdrawal", "bet"];

/** Actions are open-ended, so any snake_case name is passed through; an unknown one simply matches nothing. */
function readAction(params: RawParams) {
  const value = Array.isArray(params.action) ? params.action[0] : params.action;
  return value && /^[a-z_]{1,64}$/.test(value) ? value : undefined;
}

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

export async function AuditContent({ searchParams }: { searchParams: RawParams }) {
  const activeTab = searchParams.tab === "players" ? "players" : "platform";
  const { q, page, size } = readListParams(searchParams);
  const action = readAction(searchParams);
  const source = readChoice(searchParams, "source", SOURCES);

  const [summary, platformAudit, playerAudit] = await Promise.all([
    getAdminAuditSummary(),
    activeTab === "platform"
      ? loadPage(page, (p) => getPlatformAuditPage({ page: p, pageSize: size, action, q }))
      : Promise.resolve(null),
    activeTab === "players"
      ? loadPage(page, (p) => getPlayerAuditPage({ page: p, pageSize: size, source, q }))
      : Promise.resolve(null),
  ]);

  const narrowed = q !== "" || (activeTab === "platform" ? !!action : !!source);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary/80">
          Compliance
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">
          Audit & Activity
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Review administrative actions and player ledger activity with
          immutable IDs, timestamps, actors, targets, and detailed metadata.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Platform Events" value={summary.platformEvents} />
        <StatCard
          label="Last 24 Hours"
          value={summary.recentPlatformEvents}
          accent="amber"
        />
        <StatCard
          label="Balance Adjustments"
          value={summary.balanceAdjustments}
          accent="blue"
        />
        <StatCard label="Player Events" value={summary.playerEvents} />
      </div>

      <AuditTabs
        activeTab={activeTab}
        platformCount={summary.platformEvents}
        playerCount={summary.playerEvents}
        platformTab={platformAudit && <PlatformAuditPanel data={platformAudit} narrowed={narrowed} />}
        playersTab={playerAudit && <PlayerAuditPanel data={playerAudit} narrowed={narrowed} />}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "amber" | "blue";
}) {
  const valueClass =
    accent === "amber"
      ? "text-bp-accent"
      : accent === "blue"
        ? "text-blue-400"
        : "text-foreground";

  return (
    <div className="rounded-2xl border border-border/70 bg-card/80 px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${valueClass}`}>
        {value.toLocaleString("en-PK")}
      </p>
    </div>
  );
}

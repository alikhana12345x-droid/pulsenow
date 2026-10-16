import { Suspense } from "react";
import { getAdminUsers } from "@/lib/actions/admin";
import { can } from "@/lib/auth/roles";
import { APP_TIME_ZONE } from "@/lib/time";
import {
  BanToggleButton,
  RoleSelect,
  AdjustBalanceButton,
  HealthMeter,
  SetHealthButton,
  WithdrawalHoldButton,
} from "./user-actions";
import { UserIdentity, type Identity } from "../user-identity";
import { UsersBrowser, type UserColumn, type UserEntry } from "./users-browser";
import AdminLoading from "../loading";

type AdminUser = Awaited<ReturnType<typeof getAdminUsers>>["users"][number];

/** What the viewer may see and do, worked out once and shared by every row and card. */
type Access = {
  viewerId: string;
  seesStaff: boolean;
  canEditRoles: boolean;
  canAdjustBalance: boolean;
  canSetHealth: boolean;
  canHoldWithdrawals: boolean;
};

function fmt(d: Date | string) {
  return new Date(d).toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric", timeZone: APP_TIME_ZONE });
}

function money(value: string | number | null, fractionDigits = 0) {
  return Number(value ?? 0).toLocaleString("en-PK", { maximumFractionDigits: fractionDigits });
}

/** Staff accounts never deposit, withdraw or play, so their money and health cells stay blank. */
function Blank() {
  return <span className="text-muted-foreground/50">&mdash;</span>;
}

const ROLE_BADGE: Record<string, string> = {
  superadmin: "bg-primary/20 text-primary",
  admin: "bg-blue-500/20 text-blue-400",
  player: "bg-secondary text-muted-foreground",
};

/** Read-only role, shown wherever the viewer may not reassign it. */
function RoleBadge({ role, isSelf }: { role: string; isSelf: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${
          ROLE_BADGE[role] ?? ROLE_BADGE.player
        }`}
      >
        {role}
      </span>
      {isSelf && (
        <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">You</span>
      )}
    </span>
  );
}

const KYC_BADGE: Record<string, string> = {
  verified: "bg-green-500/20 text-green-400",
  pending: "bg-yellow-500/20 text-yellow-400",
  rejected: "bg-red-500/20 text-red-400",
};

/** Every action dialog shows this so it's clear who is being edited. */
function identityOf(u: AdminUser): Identity {
  return {
    id: u.id,
    username: u.username,
    display_name: u.display_name,
    avatar_url: u.avatar_url,
    email: u.email,
  };
}

/** What the search box matches against. The digits-only phone lets "0300…" find "+92 300…". */
function searchText(u: AdminUser) {
  return [
    u.display_name,
    u.username && `@${u.username}`,
    u.email,
    u.phone,
    u.phone?.replace(/\D/g, ""),
    u.id,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/** Name, identifiers and status chips — the same block heads a row and a card. */
function UserSummary({ user: u, size }: { user: AdminUser; size: number }) {
  // Every account starts at "none", so only a KYC state worth noticing gets a chip.
  const showKyc = u.kyc_status !== "none";

  return (
    <UserIdentity
      user={u}
      size={size}
      badge={
        u.is_banned || u.withdrawals_held || showKyc ? (
          <>
            {u.is_banned && (
              <span className="rounded-full bg-red-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-red-400">
                BANNED
              </span>
            )}
            {u.withdrawals_held && (
              <span
                className="rounded-full bg-orange-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-orange-400"
                title="Withdrawals are on hold — they wait in Finance instead of going to the gateway"
              >
                W/D HELD
              </span>
            )}
            {showKyc && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                  KYC_BADGE[u.kyc_status] ?? "bg-secondary text-muted-foreground"
                }`}
              >
                KYC {u.kyc_status}
              </span>
            )}
          </>
        ) : undefined
      }
      note={
        <>
          {u.phone && (
            <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{u.phone}</p>
          )}
          {u.is_banned && u.ban_reason && (
            <p className="mt-0.5 break-words text-xs text-red-400/80">{u.ban_reason}</p>
          )}
        </>
      }
    />
  );
}

function RoleControl({ user: u, access }: { user: AdminUser; access: Access }) {
  const isSelf = u.id === access.viewerId;

  // Reassigning your own role would lock you out of this page.
  return access.canEditRoles && !isSelf ? (
    <RoleSelect user={identityOf(u)} currentRole={u.role} />
  ) : (
    <RoleBadge role={u.role} isSelf={isSelf} />
  );
}

function HealthControl({ user: u, access }: { user: AdminUser; access: Access }) {
  return access.canSetHealth ? (
    <SetHealthButton user={identityOf(u)} health={u.health} />
  ) : (
    <HealthMeter health={u.health} />
  );
}

function hasActions(u: AdminUser, access: Access) {
  return access.canAdjustBalance || u.id !== access.viewerId;
}

/** Only players withdraw, so only a player's withdrawals can be held. */
function canHold(u: AdminUser, access: Access) {
  return access.canHoldWithdrawals && u.role === "player";
}

function UserActions({
  user: u,
  access,
  buttonClassName,
}: {
  user: AdminUser;
  access: Access;
  buttonClassName?: string;
}) {
  const identity = identityOf(u);

  return (
    <>
      {access.canAdjustBalance && (
        <AdjustBalanceButton
          user={identity}
          balance={Number(u.balance ?? 0)}
          currency={u.currency ?? "PKR"}
          className={buttonClassName}
        />
      )}
      {canHold(u, access) && (
        <WithdrawalHoldButton user={identity} held={u.withdrawals_held} className={buttonClassName} />
      )}
      {/* Banning yourself would lock you out of this page. */}
      {u.id !== access.viewerId && (
        <BanToggleButton
          user={identity}
          isBanned={u.is_banned}
          banReason={u.ban_reason}
          className={buttonClassName}
        />
      )}
    </>
  );
}

// ─── Wide screens: table row ──────────────────────────────────────────────────

function columnsFor(access: Access): UserColumn[] {
  return [
    { label: "User" },
    // Admins only ever see players, so the column would read "player" on every row.
    ...(access.seesStaff ? [{ label: "Role" }] : []),
    { label: "Balance", align: "right" },
    { label: "In / Out", align: "right" },
    { label: "Health" },
    { label: "Joined" },
    { label: "Actions", align: "right" },
  ];
}

const cell = "px-3 py-3 first:pl-4 last:pr-4";

/**
 * Deposited over withdrawn, stacked so both fit in one column. The fixed width
 * keeps the labels and figures on the same lines from row to row, whatever the
 * size of the amounts.
 */
function CashFlow({ deposited, withdrawn }: { deposited: string | null; withdrawn: string | null }) {
  const label = "text-left font-sans text-[10px] uppercase tracking-[0.12em] text-muted-foreground";

  return (
    <dl className="ml-auto grid w-28 grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-0.5 font-mono text-xs tabular-nums">
      <dt className={label}>In</dt>
      <dd className="text-right text-green-400" title="Total deposited">
        {money(deposited)}
      </dd>
      <dt className={label}>Out</dt>
      <dd className="text-right text-orange-400" title="Total withdrawn">
        {money(withdrawn)}
      </dd>
    </dl>
  );
}

function UserRow({ user: u, access }: { user: AdminUser; access: Access }) {
  const isPlayer = u.role === "player";

  return (
    <tr
      className={`border-b border-border/40 transition-colors last:border-0 hover:bg-accent/30 ${u.is_banned ? "opacity-60" : ""}`}
    >
      <td className={cell}>
        {/* Capped so one long email can't push the actions off the table —
            the full address is in its tooltip. */}
        <div className="max-w-[300px]">
          <UserSummary user={u} size={38} />
        </div>
      </td>
      {access.seesStaff && (
        <td className={cell}>
          <RoleControl user={u} access={access} />
        </td>
      )}
      <td className={`${cell} whitespace-nowrap text-right font-mono`}>
        {isPlayer ? (
          <>
            <span className="font-semibold text-foreground">{money(u.balance, 2)}</span>
            <span className="ml-1 text-xs text-muted-foreground">{u.currency ?? "PKR"}</span>
          </>
        ) : (
          <Blank />
        )}
      </td>
      <td className={`${cell} text-right`}>
        {isPlayer ? (
          <CashFlow deposited={u.total_deposited} withdrawn={u.total_withdrawn} />
        ) : (
          <Blank />
        )}
      </td>
      <td className={`${cell} whitespace-nowrap`}>
        {isPlayer ? <HealthControl user={u} access={access} /> : <Blank />}
      </td>
      <td className={`${cell} whitespace-nowrap text-xs text-muted-foreground`}>{fmt(u.created_at)}</td>
      <td className={cell}>
        <div className="flex items-center justify-end gap-2">
          {hasActions(u, access) ? <UserActions user={u} access={access} /> : <Blank />}
        </div>
      </td>
    </tr>
  );
}

// ─── Phones and tablets: card ─────────────────────────────────────────────────

function CardStat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-mono text-sm">{children}</dd>
    </div>
  );
}

function UserCard({ user: u, access }: { user: AdminUser; access: Access }) {
  const isPlayer = u.role === "player";

  return (
    <article
      className={`flex min-w-0 flex-col rounded-[20px] border bg-card/80 p-4 ${
        u.is_banned ? "border-red-500/30" : "border-border/70"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <UserSummary user={u} size={40} />
        </div>
        {access.seesStaff && (
          <div className="shrink-0">
            <RoleControl user={u} access={access} />
          </div>
        )}
      </div>

      {isPlayer ? (
        <dl className="mt-4 grid grid-cols-3 gap-2 rounded-2xl border border-border/50 bg-background/40 px-3 py-2.5">
          <CardStat label="Balance">
            <span className="font-semibold text-foreground">{money(u.balance, 2)}</span>
            <span className="ml-1 text-[10px] text-muted-foreground">{u.currency ?? "PKR"}</span>
          </CardStat>
          <CardStat label="Deposited">
            <span className="text-green-400">{money(u.total_deposited)}</span>
          </CardStat>
          <CardStat label="Withdrawn">
            <span className="text-orange-400">{money(u.total_withdrawn)}</span>
          </CardStat>
        </dl>
      ) : (
        <p className="mt-4 rounded-2xl border border-border/50 bg-background/40 px-3 py-2.5 text-xs text-muted-foreground">
          Staff account — no wallet or play activity.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-muted-foreground">
        {isPlayer && (
          <div className="flex items-center gap-2">
            <span>Health</span>
            <HealthControl user={u} access={access} />
          </div>
        )}
        <span>Joined {fmt(u.created_at)}</span>
      </div>

      {/* Pinned to the bottom so buttons line up across a row of cards. */}
      {hasActions(u, access) && (
        <div className="mt-auto pt-4">
          <div className="flex gap-2 border-t border-border/50 pt-3">
            <UserActions user={u} access={access} buttonClassName="flex-1 py-2.5 text-sm" />
          </div>
        </div>
      )}
    </article>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

async function UsersDirectory() {
  // The server decides what this viewer may see: a superadmin gets every
  // account, an admin gets players only.
  const { viewerId, viewerRole, users } = await getAdminUsers();

  const access: Access = {
    viewerId,
    seesStaff: can(viewerRole, "view_staff_accounts"),
    canEditRoles: can(viewerRole, "change_user_role"),
    canAdjustBalance: can(viewerRole, "adjust_balance"),
    canSetHealth: can(viewerRole, "set_player_health"),
    canHoldWithdrawals: can(viewerRole, "hold_withdrawals"),
  };

  const entries: UserEntry[] = users.map((u) => {
    const isPlayer = u.role === "player";
    return {
      id: u.id,
      search: searchText(u),
      isStaff: !isPlayer,
      isBanned: u.is_banned,
      isHeld: u.withdrawals_held,
      joinedAt: new Date(u.created_at).getTime(),
      // Staff money shows as blank, so it sorts as zero rather than among players.
      balance: isPlayer ? Number(u.balance ?? 0) : 0,
      deposited: isPlayer ? Number(u.total_deposited ?? 0) : 0,
      withdrawn: isPlayer ? Number(u.total_withdrawn ?? 0) : 0,
      row: <UserRow user={u} access={access} />,
      card: <UserCard user={u} access={access} />,
    };
  });

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary/80">User Management</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">
          {access.seesStaff ? "All Users" : "Players"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {users.length} {access.seesStaff ? "accounts" : "player accounts"}
          {!access.seesStaff && " — staff accounts are managed by a superadmin"}
        </p>
      </div>

      <UsersBrowser
        entries={entries}
        columns={columnsFor(access)}
        showStaffFilter={access.seesStaff}
      />
    </div>
  );
}

export default function AdminUsersPage() {
  return (
    <Suspense fallback={<AdminLoading />}>
      <UsersDirectory />
    </Suspense>
  );
}

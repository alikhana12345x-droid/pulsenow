/**
 * One way of naming a person across every admin table — users, finance, audit.
 * Falls back down the chain display name → username → short id so a row is never
 * just a bare uuid, and shows the secondary identifiers an admin needs to tell
 * two similarly-named accounts apart.
 */

const ROLE_BADGE: Record<string, string> = {
  superadmin: "bg-primary/20 text-primary",
  admin: "bg-blue-500/20 text-blue-400",
  player: "bg-secondary text-muted-foreground",
};

export type Identity = {
  id: string;
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  email?: string | null;
  role?: string | null;
};

export function shortId(value: string) {
  return value.slice(0, 8);
}

/** Primary label: the most human name we have. */
export function primaryName(user: Identity) {
  return user.display_name || user.username || shortId(user.id);
}

export function Avatar({ user, size = 34 }: { user: Identity; size?: number }) {
  const initial = (user.display_name || user.username || "?")[0]?.toUpperCase() ?? "?";

  return user.avatar_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={user.avatar_url}
      alt=""
      className="shrink-0 rounded-full border border-border/70 object-cover"
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      className="flex shrink-0 items-center justify-center rounded-full border border-primary/25 bg-primary/10 font-bold text-primary"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initial}
    </span>
  );
}

export function RoleTag({ role }: { role: string }) {
  return (
    <span
      className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold capitalize ${
        ROLE_BADGE[role] ?? ROLE_BADGE.player
      }`}
    >
      {role}
    </span>
  );
}

export function UserIdentity({
  user,
  showEmail = true,
  showId = true,
  showRole = false,
  badge,
  note,
  size = 34,
}: {
  user: Identity;
  /** Login email — off in narrow tables where it would crowd the row. */
  showEmail?: boolean;
  showId?: boolean;
  showRole?: boolean;
  /** Extra chip next to the name, e.g. BANNED. */
  badge?: React.ReactNode;
  /** Extra line under the identifiers, e.g. a ban reason. */
  note?: React.ReactNode;
  size?: number;
}) {
  const name = primaryName(user);
  // Don't repeat the username underneath when it is already the primary label.
  const handle = user.username && user.username !== name ? `@${user.username}` : null;

  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Avatar user={user} size={size} />
      <div className="min-w-0">
        {/* Name and handle share a line — they read as one label, and keeping
            them together stops the cell from wrapping into three rows. Where
            the space is capped (mobile cards, dialogs) they truncate instead. */}
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <p className="truncate font-medium" title={name}>{name}</p>
          {handle && <span className="truncate text-[11px] text-muted-foreground">{handle}</span>}
          {showRole && user.role && <RoleTag role={user.role} />}
          {badge}
        </div>

        {(showId || (showEmail && user.email)) && (
          <div className="mt-0.5 flex items-center gap-2 whitespace-nowrap text-[11px] leading-tight text-muted-foreground">
            {showEmail && user.email && (
              <span className="truncate" title={user.email}>{user.email}</span>
            )}
            {showId && <span className="shrink-0 font-mono">{shortId(user.id)}</span>}
          </div>
        )}

        {note}
      </div>
    </div>
  );
}

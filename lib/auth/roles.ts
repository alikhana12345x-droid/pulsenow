/**
 * Role + capability model — the single source of truth for who may do what.
 *
 * Deliberately free of server imports (db, next/headers, supabase) so client
 * components can render role-aware UI from the same table the server enforces
 * with. Hiding a control in the UI is a convenience, never the boundary: every
 * capability below is re-checked server-side in `lib/auth/permissions.ts`.
 */

export type Role = "player" | "admin" | "superadmin";

export function isAdminRole(role: string | null | undefined): boolean {
  return role === "admin" || role === "superadmin";
}

export function isSuperadmin(role: string | null | undefined): boolean {
  return role === "superadmin";
}

export type Capability =
  // ── Users ──
  | "view_staff_accounts"   // see admin/superadmin rows, not just players
  | "change_user_role"
  | "adjust_balance"
  | "set_player_health"
  | "ban_user"
  | "hold_withdrawals"      // route a player's withdrawals to the desk instead of the gateway
  // ── Money desk ──
  | "manage_deposits"
  | "manage_withdrawals"
  // ── Player-facing catalogue ──
  | "manage_games"
  | "manage_promotions"
  | "view_referrals"
  // ── Owner-level ──
  | "view_reports"
  | "view_audit"
  | "manage_payment_accounts"
  | "manage_platform_settings"
  | "manage_support_contacts"  // the contact channels on the player Support page
  | "manage_discord_notifications" // deposit / withdrawal webhooks under Settings
  | "reset_platform_data"
  | "withdraw_house_funds";   // move the house's own money out of the gateway

const BOTH: readonly Role[] = ["admin", "superadmin"];
const OWNER: readonly Role[] = ["superadmin"];

/**
 * An `admin` runs the day-to-day desk: players, the cash window, the game
 * lobby, promotions. A `superadmin` additionally owns everything that decides
 * how much the house pays out or where the money lands — win-probability
 * tiers, payment mode, gateway credentials, revenue reporting — plus the audit
 * trail, so an admin can never review their own actions.
 */
const CAPABILITIES: Record<Capability, readonly Role[]> = {
  view_staff_accounts:      OWNER,
  change_user_role:         OWNER,
  adjust_balance:           BOTH,
  set_player_health:        BOTH,
  ban_user:                 BOTH,
  hold_withdrawals:         BOTH,

  manage_deposits:          BOTH,
  manage_withdrawals:       BOTH,

  manage_games:             BOTH,
  manage_promotions:        BOTH,
  view_referrals:           BOTH,

  view_reports:             OWNER,
  view_audit:               OWNER,
  manage_payment_accounts:  OWNER,
  manage_platform_settings: OWNER,
  manage_support_contacts:  BOTH,
  manage_discord_notifications: BOTH,
  reset_platform_data:      OWNER,
  withdraw_house_funds:     BOTH,
};

export function can(
  role: string | null | undefined,
  capability: Capability
): boolean {
  return CAPABILITIES[capability].includes(role as Role);
}

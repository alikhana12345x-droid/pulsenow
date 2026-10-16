import { getTiers } from "@/lib/actions/game-settings";
import { getPaymentMode, getSupportContacts } from "@/lib/actions/platform-settings";
import { getSolidPayAccount } from "@/lib/actions/payment-accounts";
import { isSolidPayConfigured } from "@/lib/gateways/solidpay";
import { TiersTable } from "./tiers-table";
import { PaymentModeToggle } from "./payment-mode-toggle";
import { ResetDataCard } from "./reset-data-card";
import { SupportContactsCard } from "./support-contacts-card";
import { DiscordNotificationsCard } from "./discord-notifications-card";
import { ChangePasswordCard } from "./change-password-card";
import { getDiscordSettings } from "@/lib/actions/discord-settings";
import { can } from "@/lib/auth/roles";

export async function SettingsContent({ viewerRole }: { viewerRole: string }) {
  // Admins get Discord notifications and support contacts; everything else here
  // is superadmin-only.
  if (!can(viewerRole, "manage_platform_settings")) {
    const showDiscord = can(viewerRole, "manage_discord_notifications");
    const [supportContacts, discordSettings] = await Promise.all([
      getSupportContacts(),
      showDiscord ? getDiscordSettings() : null,
    ]);
    return (
      <div className="space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary/80">Admin Panel</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Discord notifications, support contacts and your password. Other platform settings are managed by a superadmin.
          </p>
        </div>

        {discordSettings && <DiscordNotificationsCard initial={discordSettings} />}

        <SupportContactsCard initial={supportContacts} />

        <ChangePasswordCard />
      </div>
    );
  }

  const [tiers, paymentMode, supportContacts, discordSettings] = await Promise.all([
    getTiers(),
    getPaymentMode(),
    getSupportContacts(),
    getDiscordSettings(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary/80">Admin Panel</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Platform payment mode, notifications, support contacts and per-round win probability tiers.
        </p>
      </div>

      <PaymentModeToggle initialMode={paymentMode} />

      {paymentMode === "auto" && <AutoRouteStatus />}

      <DiscordNotificationsCard initial={discordSettings} />

      <SupportContactsCard initial={supportContacts} />

      <ChangePasswordCard />

      <div>
        <h2 className="text-lg font-semibold tracking-tight">Game tiers</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {tiers.filter((t) => t.is_active).length} active tier{tiers.filter((t) => t.is_active).length !== 1 ? "s" : ""} &middot; win probabilities applied per-round
        </p>
      </div>

      <TiersTable tiers={tiers} />

      {/* Only superadmins reach this branch, and resetPlatformData re-checks
          the capability itself before deleting anything. */}
      <div className="pt-2">
        <ResetDataCard />
      </div>
    </div>
  );
}

/**
 * Auto mode silently 503s the deposit sheet when the SolidPay route is
 * incomplete, so the gaps are surfaced here instead of in a server log.
 */
async function AutoRouteStatus() {
  const [depositRoute, payoutRoute] = await Promise.all([
    getSolidPayAccount("deposit"),
    getSolidPayAccount("withdrawal"),
  ]);

  const gaps: string[] = [];
  if (!isSolidPayConfigured()) {
    gaps.push("SOLID_PAY_API_KEY / SOLID_PAY_MERCHANT_NO are missing from the environment.");
  }
  if (!depositRoute) {
    gaps.push("No active SolidPay account accepts deposits — add one under Payment accounts.");
  }
  if (!payoutRoute) {
    gaps.push("No active SolidPay account sends withdrawals — enable payouts on the SolidPay account.");
  }
  if (!process.env.APP_BASE_URL) {
    gaps.push("APP_BASE_URL is unset, so callbacks fall back to the notify URLs saved in the SolidPay backend.");
  }

  const healthy = gaps.length === 0;

  return (
    <div
      className={`rounded-2xl border p-4 ${
        healthy ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5"
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Auto route</p>
      <p className={`mt-1 text-sm font-semibold ${healthy ? "text-emerald-400" : "text-amber-400"}`}>
        {healthy ? "SolidPay is live for deposits and payouts." : "SolidPay is not fully wired up."}
      </p>
      {!healthy && (
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
          {gaps.map((gap) => (
            <li key={gap}>&middot; {gap}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

import { Suspense } from "react";
import { getAdminReferrals, getReferralStats } from "@/lib/actions/admin";
import { APP_TIME_ZONE } from "@/lib/time";
import AdminLoading from "../loading";

function fmt(d: Date | string) {
  return new Date(d).toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric", timeZone: APP_TIME_ZONE });
}

async function ReferralsContent() {
  const [referralList, stats] = await Promise.all([
    getAdminReferrals(),
    getReferralStats(),
  ]);

  const statCards = [
    { label: "Total Referrals", value: stats.total, color: "text-blue-400" },
    { label: "Active", value: stats.active, color: "text-green-400" },
    { label: "Total Commissions Paid", value: `PKR ${stats.totalEarned.toLocaleString("en-PK", { maximumFractionDigits: 2 })}`, color: "text-primary" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary/80">Growth</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Referrals</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          5% commission on every bet placed by referred users.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {statCards.map(({ label, value, color }) => (
          <div key={label} className="rounded-[20px] border border-border/70 bg-card/80 p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
            <p className={`mt-2 text-3xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-[24px] border border-border/70 bg-card/80">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="border-b border-border/60">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Referrer</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Referred User</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Commission Rate</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Total Earned</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Joined</th>
              </tr>
            </thead>
            <tbody>
              {referralList.map((r) => (
                <tr key={r.id} className="border-b border-border/40 transition-colors last:border-0 hover:bg-accent/30">
                  <td className="px-4 py-3 font-medium">
                    {r.referrer_username ?? <span className="text-muted-foreground italic text-xs">{r.referrer_id.slice(0, 8)}</span>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {r.referred_username ?? <span className="italic text-xs">{r.referred_id.slice(0, 8)}</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                    {(Number(r.commission_rate) * 100).toFixed(1)}%
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-primary">
                    {Number(r.total_earned).toLocaleString("en-PK", { maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${
                      r.status === "active" ? "bg-green-500/20 text-green-400" : "bg-secondary text-muted-foreground"
                    }`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{fmt(r.created_at)}</td>
                </tr>
              ))}
              {referralList.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">No referrals yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function AdminReferralsPage() {
  return (
    <Suspense fallback={<AdminLoading />}>
      <ReferralsContent />
    </Suspense>
  );
}

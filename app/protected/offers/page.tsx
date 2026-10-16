import Link from "next/link";
import { ProtectedFinanceProvider } from "@/components/protected/finance-drawer-provider";
// import { FinanceDrawerTrigger } from "@/components/protected/finance-drawer-trigger";

const promos = [
  {
    tag: "Welcome Boost",
    title: "100% first deposit bonus",
    value: "Up to PKR 10,000",
    detail: "Fund your account for the first time and get an instant top-up to start stronger.",
    tone: "from-red-600/30 via-red-500/10 to-amber-400/15",
  },
  {
    tag: "Weekend Heat",
    title: "Reload on Friday night",
    value: "25% extra balance",
    detail: "Eligible reload players receive an extra boost during high-traffic weekend sessions.",
    tone: "from-amber-400/20 via-orange-400/10 to-red-600/20",
  },
  {
    tag: "VIP Lane",
    title: "Private cashback tiers",
    value: "Up to 12% weekly",
    detail: "High-volume players unlock a more generous cashback ladder and faster support handling.",
    tone: "from-zinc-200/10 via-amber-500/10 to-yellow-200/10",
  },
];

const tiers = [
  { name: "Gold", perk: "Priority promo access", target: "Casual grinders" },
  { name: "Platinum", perk: "Bigger weekly cashback", target: "Consistent players" },
  { name: "Diamond", perk: "VIP gifts and tailored boosts", target: "Top-volume accounts" },
];

export default function OffersPage() {
  return (
    <ProtectedFinanceProvider>
    <div className="flex flex-col px-4 pb-4 space-y-5" style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}>
      <section className="relative overflow-hidden rounded-[30px] border border-amber-500/20 bg-[radial-gradient(circle_at_top_right,_rgba(251,191,36,0.22),_transparent_26%),radial-gradient(circle_at_top_left,_rgba(239,68,68,0.28),_transparent_34%),linear-gradient(160deg,_rgba(36,12,12,0.98),_rgba(9,9,11,0.96))] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.28)]">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300/90">Promotions</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-white">Hot rewards. Cleaner offers.</h1>
        <p className="mt-2 max-w-[28rem] text-sm leading-6 text-zinc-300">
          A premium offer wall inspired by red-and-gold casino styling, but organized so players can instantly see value.
        </p>
        <div className="mt-5 flex gap-3">
          {/* <FinanceDrawerTrigger action="deposit" className="rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground">
            Deposit now
          </FinanceDrawerTrigger> */}
          <Link href="/protected/invite" className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white backdrop-blur">
            Invite friends
          </Link>
        </div>
      </section>

      <section className="grid gap-4">
        {promos.map((promo) => (
          <div
            key={promo.title}
            className={`rounded-[28px] border border-border/70 bg-gradient-to-br ${promo.tone} bg-card/80 p-5 shadow-sm`}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/80">{promo.tag}</p>
            <div className="mt-3 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black tracking-tight">{promo.title}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{promo.detail}</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/70 px-4 py-3 text-right">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Value</p>
                <p className="mt-1 text-lg font-bold text-amber-400">{promo.value}</p>
              </div>
            </div>
          </div>
        ))}
      </section>

      <section className="rounded-[28px] border border-border/70 bg-card/80 p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">VIP tiers</p>
        <div className="mt-4 grid gap-3">
          {tiers.map((tier, index) => (
            <div key={tier.name} className="flex items-center justify-between rounded-2xl border border-border/70 bg-background/60 p-4">
              <div className="flex items-center gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/12 text-sm font-black text-primary">
                  0{index + 1}
                </div>
                <div>
                  <p className="font-semibold">{tier.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{tier.target}</p>
                </div>
              </div>
              <p className="max-w-[11rem] text-right text-sm text-amber-400">{tier.perk}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[28px] border border-border/70 bg-card/80 p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Promo terms</p>
            <h2 className="mt-2 text-xl font-bold">Before you claim</h2>
          </div>
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-400">
            Updated
          </span>
        </div>
        <div className="mt-4 grid gap-3 text-sm text-muted-foreground">
          <div className="rounded-2xl border border-border/70 bg-background/60 p-4">Bonuses may have wagering or game eligibility requirements before withdrawal.</div>
          <div className="rounded-2xl border border-border/70 bg-background/60 p-4">Promotions can vary by account history, deposit method, and abuse checks.</div>
          <div className="rounded-2xl border border-border/70 bg-background/60 p-4">VIP qualification is reviewed automatically using activity and risk rules.</div>
        </div>
      </section>
    </div>
    </ProtectedFinanceProvider>
  );
}

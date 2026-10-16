import { ChevronRight, Mail, MessageCircle, Phone, Send } from "lucide-react";
import { ProtectedFinanceProvider } from "@/components/protected/finance-drawer-provider";
import { getSupportContacts } from "@/lib/actions/platform-settings";
import { supportChannelLink, type SupportChannel } from "@/lib/support-contacts";
import {
  MIN_DEPOSIT,
  MAX_DEPOSIT,
  MIN_WITHDRAWAL,
  MAX_WITHDRAWAL,
  MIN_BET,
  MAX_BET,
  WITHDRAW_MIN_TOTAL_DEPOSIT,
  fmtPkr,
} from "@/lib/finance-limits";
import { FAQItem } from "./faq-item";

/** Display order and look of each channel. Admins fill the values in under Settings. */
const CHANNELS: { key: SupportChannel; icon: typeof Mail; title: string }[] = [
  { key: "whatsapp", icon: MessageCircle, title: "WhatsApp" },
  { key: "telegram", icon: Send, title: "Telegram" },
  { key: "phone", icon: Phone, title: "Phone" },
  { key: "email", icon: Mail, title: "Email" },
];

/**
 * Every number here comes from lib/finance-limits so the answers can't drift
 * away from what the deposit, withdrawal and bet handlers actually enforce.
 */
const FAQ_ITEMS = [
  {
    q: "How do I deposit?",
    a: `Tap Deposit, pick JazzCash or Easypaisa, and choose an amount between PKR ${fmtPkr(MIN_DEPOSIT)} and PKR ${fmtPkr(MAX_DEPOSIT)}. You'll be taken to a secure payment page to finish the transfer, and your balance updates automatically once the payment clears. If you're asked to upload a payment screenshot instead, your wallet is credited after our team verifies it.`,
  },
  {
    q: "My deposit hasn't arrived — what should I do?",
    a: "Deposits normally credit within a few minutes of the payment clearing. If it's been longer, contact support with the amount and your transaction ID (TID) and we'll trace it. Please don't send a second payment for the same deposit.",
  },
  {
    q: "Why can't I withdraw yet?",
    a: `Withdrawals unlock once your deposits total PKR ${fmtPkr(WITHDRAW_MIN_TOTAL_DEPOSIT)} across the lifetime of your account. The Withdraw screen shows how much is left before they open up.`,
  },
  {
    q: "How do I withdraw my winnings?",
    a: `Tap Withdraw, choose JazzCash or Easypaisa, then enter your account number and the account holder's name exactly as it's registered on that wallet. A mismatched name is the most common reason a payout is rejected. Each request can be between PKR ${fmtPkr(MIN_WITHDRAWAL)} and PKR ${fmtPkr(MAX_WITHDRAWAL)}.`,
  },
  {
    q: "How long do withdrawals take?",
    a: "Payouts are sent automatically and usually land in your wallet within a few minutes. If a request needs a manual check it can take up to 24 hours. If a payout fails, the amount goes straight back to your balance.",
  },
  {
    q: "What are the betting limits?",
    a: `Every game takes bets from PKR ${fmtPkr(MIN_BET)} up to PKR ${fmtPkr(MAX_BET)} per round.`,
  },
  {
    q: "How are game results generated?",
    a: "Each round is generated from a server seed, a client seed and a round number. The seed's hash is recorded alongside the result at the moment the round is settled, so any round can be reproduced from our records afterwards. Send support a round ID if you'd like a result looked up.",
  },
  {
    q: "What games can I play?",
    a: "The Home screen lists everything that's live right now — Aviator, Mines, Dice 3D, Dragon Tower, Plinko, Keno, Limbo, Hi-Lo, Coin Flip, Andar Bahar and Dragon vs Tiger. New games are added regularly.",
  },
];

export default async function SupportPage() {
  const contacts = await getSupportContacts();
  // Only channels an admin has filled in are shown.
  const channels = CHANNELS.filter(({ key }) => contacts[key]).map((c) => ({
    ...c,
    ...supportChannelLink(c.key, contacts[c.key]),
  }));

  return (
    <ProtectedFinanceProvider>
    <div className="min-h-screen bg-bp-bg font-bp-ui text-bp-text">
      <div className="mx-auto w-full max-w-[600px] pb-24">

        {/* ── Header ── */}
        <div className="relative overflow-hidden border-b border-white/[0.06] bg-[radial-gradient(circle_at_top_right,rgba(242,154,11,0.14),transparent_50%)] px-4 pb-6" style={{ paddingTop: "max(1.5rem, env(safe-area-inset-top))" }}>
          <p className="text-[10px] font-bold uppercase tracking-[3px] text-bp-accent/80">
            Help Center
          </p>
          <h1 className="mt-2 text-2xl font-black tracking-tight">Support</h1>
          <p className="mt-1 text-[13px] text-white/40">We&apos;re here to help you 24/7.</p>
        </div>

        <div className="space-y-4 px-4 pt-5">

          {/* ── Contact channels ── */}
          {channels.length > 0 && (
            <div className="overflow-hidden rounded-3xl border border-white/[0.06] bg-bp-mid">
              <div className="px-4 pb-2 pt-4">
                <p className="text-[10px] font-semibold uppercase tracking-[2.5px] text-white/40">
                  Contact Us
                </p>
              </div>
              <div className="divide-y divide-white/[0.04]">
                {channels.map(({ key, icon: Icon, title, display, href }) => (
                  <a
                    key={key}
                    href={href}
                    // Chat apps open in a new tab; mailto: and tel: hand off to the device.
                    {...(href.startsWith("https://") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    className="flex w-full items-center gap-3 px-4 py-3.5 transition-colors hover:bg-white/[0.02]"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-bp-accent/20 bg-bp-accent/10">
                      <Icon className="h-4 w-4 text-bp-accent" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-bp-text">{title}</p>
                      <p className="mt-0.5 truncate text-xs text-white/40">{display}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-white/20" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* ── FAQ ── */}
          <div id="faq" className="scroll-mt-4 rounded-3xl border border-white/[0.06] bg-bp-mid p-4">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[2.5px] text-white/40">
              FAQ
            </p>
            <div className="space-y-2">
              {FAQ_ITEMS.map((item) => (
                <FAQItem key={item.q} q={item.q} a={item.a} />
              ))}
            </div>
          </div>

          {/* ── Footer note ── */}
          <div className="rounded-2xl border border-white/[0.04] bg-white/[0.02] p-3 text-center">
            <p className="text-[11px] text-white/25">
              PulseNow{contacts.email && ` · ${contacts.email}`}
            </p>
          </div>

        </div>
      </div>
    </div>
    </ProtectedFinanceProvider>
  );
}

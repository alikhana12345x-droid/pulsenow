import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Responsible Gambling" };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 border-l-2 border-[#f29a0b] pl-3 text-[13px] font-black uppercase tracking-[0.22em] text-[#f29a0b]">
        {title}
      </h2>
      <div className="space-y-3 text-[14px] leading-relaxed text-white/55">
        {children}
      </div>
    </section>
  );
}

function Item({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5">
      <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#f29a0b]/50" />
      <p>{children}</p>
    </div>
  );
}

const WARNING_SIGNS = [
  "Spending more than you can afford to lose",
  `Gambling to recover previous losses ("chasing losses")`,
  "Hiding your gambling from family or friends",
  "Feeling anxious, irritable, or depressed when not gambling",
  "Neglecting work, studies, or relationships due to gambling",
  "Borrowing money or selling possessions to fund gambling",
  "Gambling for extended periods without taking breaks",
  "Feeling a compulsion to keep gambling even when you want to stop",
];

export default function ResponsiblePage() {
  return (
    <article>
      {/* Warning banner */}
      <div className="mb-8 rounded-2xl border border-rose-500/25 bg-rose-500/8 p-5">
        <p className="mb-1 text-[11px] font-black uppercase tracking-[0.28em] text-rose-400">Important Notice</p>
        <p className="text-[14px] leading-relaxed text-white/65">
          Gambling is entertainment, not a way to make money. You should never gamble more than you can afford to lose.
          If gambling is affecting your life or the lives of those around you, please seek help immediately.
        </p>
      </div>

      {/* Title block */}
      <div className="mb-10 border-b border-white/[0.06] pb-8">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.32em] text-[#f29a0b]/70">Player Protection</p>
        <h1 className="text-[32px] font-black tracking-tight text-[#f4f1ff]">Responsible Gambling</h1>
        <p className="mt-4 text-[14px] leading-relaxed text-white/50">
          PulseNow is committed to providing a safe and enjoyable gambling environment.
          We take problem gambling seriously and provide tools and resources to help you stay in control.
        </p>
      </div>

      <Section title="Our Commitment">
        <Item>PulseNow is strictly for players aged 18 and over. We verify age during registration and reserve the right to conduct further age verification at any time.</Item>
        <Item>We do not target vulnerable individuals or those who have self-excluded from gambling services.</Item>
        <Item>We train our support team to recognise signs of problem gambling and respond appropriately.</Item>
        <Item>We provide tools to help you set limits on your gambling activity — these can only be tightened, never immediately relaxed.</Item>
      </Section>

      <Section title="Warning Signs of Problem Gambling">
        <p>You may have a problem if you recognise any of the following:</p>
        {WARNING_SIGNS.map((sign) => <Item key={sign}>{sign}</Item>)}
        <p className="pt-1">
          If you recognise any of these signs in yourself or someone you know, we strongly encourage you
          to seek support from one of the resources listed below.
        </p>
      </Section>

      <Section title="Tools Available to You">
        <p><strong className="text-white/75">Deposit Limits</strong></p>
        <p>
          Contact our support team to set a daily, weekly, or monthly deposit limit on your account.
          Limits take effect immediately and can only be decreased or removed after a 7-day cooling-off period.
        </p>

        <p className="pt-1"><strong className="text-white/75">Self-Exclusion</strong></p>
        <p>
          You can request a self-exclusion period of 30 days, 6 months, 1 year, or permanently.
          During self-exclusion, your account will be disabled, all bonuses forfeited, and any pending
          withdrawals returned to your registered payment method.
          Email <a href="mailto:support@pulsenow.xyz" className="text-[#f29a0b] underline underline-offset-2 hover:opacity-80">
            support@pulsenow.xyz
          </a> with the subject line <strong className="text-white/70">"Self-Exclusion Request"</strong> to begin this process.
        </p>

        <p className="pt-1"><strong className="text-white/75">Account Closure</strong></p>
        <p>
          You may close your account permanently at any time. Contact our support team and we will
          process your closure within 24 hours and return any remaining balance.
        </p>

        <p className="pt-1"><strong className="text-white/75">Reality Checks</strong></p>
        <p>
          Take regular breaks. We recommend setting a timer and stepping away from the platform for
          at least 15 minutes for every hour of play.
        </p>
      </Section>

      <Section title="Help & Support Resources">
        <p>If you or someone you know needs help, the following services are available:</p>

        {/* Pakistan-specific resources */}
        <div className="mt-2 space-y-3">
          {[
            {
              name: "Pakistan Mental Health Helpline",
              detail: "Umang — Mental health support available 24/7",
              contact: "0311-7786264",
              type: "phone",
            },
            {
              name: "Rozan Counselling",
              detail: "Psychological counselling services, Islamabad",
              contact: "051-2890505",
              type: "phone",
            },
            {
              name: "Gamblers Anonymous (International)",
              detail: "Free peer-support meetings online and in person worldwide",
              contact: "www.gamblersanonymous.org",
              type: "web",
              href: "https://www.gamblersanonymous.org",
            },
            {
              name: "BeGambleAware",
              detail: "Free, confidential help and advice about problem gambling",
              contact: "www.begambleaware.org",
              type: "web",
              href: "https://www.begambleaware.org",
            },
          ].map((r) => (
            <div
              key={r.name}
              className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3.5"
            >
              <p className="text-[13px] font-bold text-white/80">{r.name}</p>
              <p className="mt-0.5 text-[12px] text-white/40">{r.detail}</p>
              {r.type === "phone" ? (
                <a
                  href={`tel:${r.contact.replace(/-/g, "")}`}
                  className="mt-1.5 inline-block font-mono text-[13px] font-bold text-[#f29a0b] hover:opacity-80"
                >
                  {r.contact}
                </a>
              ) : (
                <a
                  href={r.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1.5 inline-block text-[12px] text-[#f29a0b] underline underline-offset-2 hover:opacity-80"
                >
                  {r.contact}
                </a>
              )}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Keeping Gambling Fun">
        <Item>Set a strict budget before you play — only gamble what you can afford to lose.</Item>
        <Item>Treat gambling as entertainment, not as a source of income.</Item>
        <Item>Take regular breaks and never play when tired, stressed, or under the influence of substances.</Item>
        <Item>Balance gambling with other activities and social interactions.</Item>
        <Item>Do not chase losses. If you lose your session budget, stop and walk away.</Item>
        <Item>Keep track of how much time and money you spend gambling each week.</Item>
      </Section>

      {/* Contact CTA */}
      <div className="mt-10 rounded-2xl border border-[#f29a0b]/20 bg-[#f29a0b]/6 p-6 text-center">
        <p className="text-[14px] font-bold text-white/75">Need to talk to someone at PulseNow?</p>
        <p className="mt-1 text-[13px] text-white/40">
          Our support team is available 24/7 and can help you access any of the tools above.
        </p>
        <a
          href="mailto:support@pulsenow.xyz"
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-[#f29a0b] to-[#c97e08] px-6 py-2.5 text-[13px] font-black text-[#1b1305] shadow-[0_2px_10px_rgba(242,154,11,0.35)] hover:opacity-90"
        >
          Contact Support
        </a>
        <p className="mt-3 text-[11px] text-white/25">
          Or visit the{" "}
          <Link href="/protected/support" className="underline underline-offset-2 hover:text-white/50">
            in-app support page
          </Link>
        </p>
      </div>
    </article>
  );
}

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms of Service" };

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

export default function TermsPage() {
  return (
    <article>
      {/* Title block */}
      <div className="mb-10 border-b border-white/[0.06] pb-8">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.32em] text-[#f29a0b]/70">Legal</p>
        <h1 className="text-[32px] font-black tracking-tight text-[#f4f1ff]">Terms of Service</h1>
        <p className="mt-2 text-[12px] text-white/30">Last updated: January 2025 · Effective immediately</p>
        <p className="mt-4 text-[14px] leading-relaxed text-white/50">
          By accessing or using PulseNow, you agree to be bound by these Terms of Service.
          Please read them carefully before creating an account or placing any bet.
        </p>
      </div>

      <Section title="1. Eligibility">
        <Item>You must be at least <strong className="text-white/80">18 years of age</strong> to register and use PulseNow.</Item>
        <Item>You must be legally permitted to participate in online gambling activities under the laws of your jurisdiction. It is your sole responsibility to verify that gambling is lawful where you reside.</Item>
        <Item>Only one account is permitted per person, household, device, or IP address. Duplicate accounts will be suspended and balances forfeited.</Item>
        <Item>Employees, contractors, and immediate family members of PulseNow are not permitted to hold player accounts.</Item>
      </Section>

      <Section title="2. Account Registration">
        <Item>You agree to provide accurate, current, and complete information when creating your account, including your real name and contact details.</Item>
        <Item>You are responsible for maintaining the confidentiality of your password. PulseNow will not be liable for any loss resulting from unauthorised access to your account.</Item>
        <Item>You must notify us immediately if you suspect your account has been compromised by contacting support.</Item>
        <Item>We reserve the right to verify your identity (KYC) at any time, and may restrict access to funds until verification is complete.</Item>
      </Section>

      <Section title="3. Deposits & Withdrawals">
        <Item>Minimum deposit: PKR 100. Maximum single deposit: PKR 50,000. Limits may vary by payment method.</Item>
        <Item>We accept JazzCash, Easypaisa, USDT (TRC20), ETH (ERC20), and BNB (BEP20).</Item>
        <Item>Withdrawals are processed within 24 hours on business days. Bank transfers may take an additional 1–2 banking days.</Item>
        <Item>Minimum withdrawal: PKR 500. We reserve the right to request additional identity verification before releasing withdrawal funds.</Item>
        <Item>We may withhold funds pending investigation if we have reason to believe a transaction is fraudulent, or if any associated bet is suspected of manipulation.</Item>
      </Section>

      <Section title="4. Betting Rules">
        <Item>Minimum bet: PKR 10. Maximum bet: PKR 50,000 per round, unless otherwise stated per game.</Item>
        <Item>All bets are final once confirmed. No cancellations are accepted after a round begins.</Item>
        <Item>PulseNow uses a provably fair system — all game outcomes are determined by a cryptographic hash of a server seed and client seed. You may verify any result after the round ends.</Item>
        <Item>House edge varies by game: 1% on Dice 3D, 2% on Coin Flip, 3% on Skyrise (Crash).</Item>
        <Item>In the event of a technical fault that prevents a game from being completed, all stakes will be returned.</Item>
      </Section>

      <Section title="5. Bonuses & Referrals">
        <Item>Referral commissions are 5% of eligible activity from referred players, credited automatically.</Item>
        <Item>PulseNow reserves the right to modify, suspend, or terminate any bonus or promotion at any time without notice.</Item>
        <Item>Abuse of bonus programs — including use of multiple accounts or coordinated betting strategies — will result in account suspension and forfeiture of related funds.</Item>
      </Section>

      <Section title="6. Prohibited Activities">
        <Item>Using automated bots, scripts, or software to gain an unfair advantage.</Item>
        <Item>Attempting to exploit bugs, glitches, or errors in the platform. Identified exploits must be reported immediately.</Item>
        <Item>Money laundering, fraud, or any activity that violates applicable anti-money laundering (AML) regulations.</Item>
        <Item>Sharing or selling your account credentials, or allowing third parties to access your account.</Item>
        <Item>Collusion with other players or PulseNow staff to manipulate game outcomes.</Item>
      </Section>

      <Section title="7. Termination & Suspension">
        <p>We may suspend or permanently close your account, with or without notice, if:</p>
        <Item>You breach any of these Terms of Service.</Item>
        <Item>We are required to do so by law or regulatory authority.</Item>
        <Item>Your account shows signs of fraudulent or abusive activity.</Item>
        <Item>You are found to be under 18 years of age.</Item>
        <p>Upon termination, any outstanding balance (net of pending investigations) may be returned to you minus any applicable fees.</p>
      </Section>

      <Section title="8. Limitation of Liability">
        <p>To the maximum extent permitted by law, PulseNow and its directors, employees, and partners shall not be liable for:</p>
        <Item>Any loss of profit, data, or indirect or consequential damage arising from the use of our platform.</Item>
        <Item>Service interruptions, maintenance periods, or technical failures beyond our reasonable control.</Item>
        <Item>Third-party payment processing failures or delays.</Item>
      </Section>

      <Section title="9. Changes to Terms">
        <p>
          We may update these Terms at any time. Continued use of PulseNow after changes are posted constitutes
          acceptance of the revised Terms. We will make reasonable efforts to notify registered users of material changes
          via email or in-app notice.
        </p>
      </Section>

      <Section title="10. Contact">
        <p>
          For questions regarding these Terms, please contact us at{" "}
          <a href="mailto:support@pulsenow.xyz" className="text-[#f29a0b] underline underline-offset-2 hover:opacity-80">
            support@pulsenow.xyz
          </a>{" "}
          or via the support page in the app.
        </p>
      </Section>
    </article>
  );
}

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy Policy" };

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

export default function PrivacyPage() {
  return (
    <article>
      {/* Title block */}
      <div className="mb-10 border-b border-white/[0.06] pb-8">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.32em] text-[#f29a0b]/70">Legal</p>
        <h1 className="text-[32px] font-black tracking-tight text-[#f4f1ff]">Privacy Policy</h1>
        <p className="mt-2 text-[12px] text-white/30">Last updated: January 2025</p>
        <p className="mt-4 text-[14px] leading-relaxed text-white/50">
          PulseNow is committed to protecting your personal information. This Privacy Policy explains what
          data we collect, how we use it, and the choices you have.
        </p>
      </div>

      <Section title="1. Data We Collect">
        <p><strong className="text-white/75">Account Information</strong></p>
        <Item>Email address, username, display name, and phone number provided at registration.</Item>
        <Item>Identity documents submitted during optional KYC verification (ID card, selfie).</Item>

        <p className="pt-1"><strong className="text-white/75">Financial Information</strong></p>
        <Item>Deposit and withdrawal amounts, selected payment method, and transaction references.</Item>
        <Item>We do not store raw payment credentials (card numbers, bank PINs). These are handled by third-party gateways (JazzCash, Easypaisa, Tatum).</Item>

        <p className="pt-1"><strong className="text-white/75">Gameplay Data</strong></p>
        <Item>Bet history, game outcomes, and cashout times — used to calculate payouts and for provably fair verification.</Item>

        <p className="pt-1"><strong className="text-white/75">Technical Data</strong></p>
        <Item>IP address, browser type, device identifier, and approximate location (country/city level).</Item>
        <Item>Session cookies required for authentication. No advertising or third-party tracking cookies are used.</Item>
      </Section>

      <Section title="2. How We Use Your Data">
        <Item>To create and manage your account, process deposits and withdrawals, and settle bets.</Item>
        <Item>To verify your identity and comply with Anti-Money Laundering (AML) obligations.</Item>
        <Item>To detect and prevent fraud, collusion, and underage gambling.</Item>
        <Item>To calculate and distribute referral commissions.</Item>
        <Item>To send transactional emails (account confirmations, withdrawal notices). We do not send marketing email without your consent.</Item>
        <Item>To improve platform stability, game performance, and user experience based on aggregated analytics.</Item>
      </Section>

      <Section title="3. Data Sharing">
        <p>We do not sell your personal data. We share it only in the following circumstances:</p>
        <Item><strong className="text-white/70">Payment Processors:</strong> JazzCash, Easypaisa, and Tatum.io receive the minimum data required to complete transactions.</Item>
        <Item><strong className="text-white/70">Infrastructure Providers:</strong> Supabase (database and authentication hosting) — data is encrypted at rest and in transit.</Item>
        <Item><strong className="text-white/70">Legal Obligations:</strong> We may disclose data to law enforcement or regulatory authorities when legally required to do so.</Item>
        <Item><strong className="text-white/70">Business Transfer:</strong> In the event of a merger or acquisition, user data may be transferred as a business asset. You will be notified prior to any such transfer.</Item>
      </Section>

      <Section title="4. Data Retention">
        <Item>Account data is retained for the duration of your account and for a minimum of 5 years thereafter, as required by AML regulations.</Item>
        <Item>Bet and transaction records are retained for 7 years to satisfy financial reporting requirements.</Item>
        <Item>You may request deletion of your personal profile data at any time, subject to legal retention obligations.</Item>
      </Section>

      <Section title="5. Security">
        <Item>All data is transmitted over TLS/HTTPS. Database connections are encrypted.</Item>
        <Item>Passwords are never stored in plain text — they are hashed and salted by Supabase Auth.</Item>
        <Item>Access to production databases is restricted to authorised personnel and is audit-logged.</Item>
        <Item>We conduct periodic security reviews. If a data breach occurs that affects your rights, we will notify you within 72 hours of becoming aware.</Item>
      </Section>

      <Section title="6. Cookies">
        <p>
          PulseNow uses session cookies exclusively for authentication. These are{" "}
          <strong className="text-white/75">httpOnly, Secure, and SameSite=Strict</strong> — they cannot be read
          by client-side scripts and are not shared with third parties.
        </p>
        <p>
          We do not use advertising cookies, pixel trackers, or third-party analytics SDKs. No data is shared
          with advertising networks.
        </p>
      </Section>

      <Section title="7. Your Rights">
        <Item><strong className="text-white/70">Access:</strong> Request a copy of the personal data we hold about you.</Item>
        <Item><strong className="text-white/70">Rectification:</strong> Request correction of inaccurate data via your profile settings or by contacting support.</Item>
        <Item><strong className="text-white/70">Erasure:</strong> Request deletion of your account and associated personal data (subject to legal retention requirements).</Item>
        <Item><strong className="text-white/70">Portability:</strong> Request your bet history and transaction records in a machine-readable format.</Item>
        <Item><strong className="text-white/70">Restriction:</strong> Request that we restrict processing of your data in certain circumstances.</Item>
        <p>To exercise any of these rights, email us at{" "}
          <a href="mailto:privacy@pulsenow.xyz" className="text-[#f29a0b] underline underline-offset-2 hover:opacity-80">
            privacy@pulsenow.xyz
          </a>.
        </p>
      </Section>

      <Section title="8. Children">
        <p>
          PulseNow is strictly for users aged 18 and over. We do not knowingly collect personal data
          from anyone under 18. If we discover that a minor has registered an account, it will be
          immediately closed and any funds returned.
        </p>
      </Section>

      <Section title="9. Changes to This Policy">
        <p>
          We may update this Privacy Policy from time to time. When we do, we will revise the
          &quot;Last updated&quot; date above and, for material changes, send a notification to your registered
          email address.
        </p>
      </Section>

      <Section title="10. Contact">
        <p>
          Privacy queries: {" "}
          <a href="mailto:privacy@pulsenow.xyz" className="text-[#f29a0b] underline underline-offset-2 hover:opacity-80">
            privacy@pulsenow.xyz
          </a>
          <br />
          General support: {" "}
          <a href="mailto:support@pulsenow.xyz" className="text-[#f29a0b] underline underline-offset-2 hover:opacity-80">
            support@pulsenow.xyz
          </a>
        </p>
      </Section>
    </article>
  );
}

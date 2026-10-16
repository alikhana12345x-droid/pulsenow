"use client";

import { useRef, useState } from "react";
import { Upload, X } from "lucide-react";
import {
  createPaymentAccount,
  updatePaymentAccount,
  type GatewayType,
  type PaymentAccountCredentials,
} from "@/lib/actions/payment-accounts";
import { compressImage } from "@/lib/image";
import { useRouter } from "next/navigation";

const GATEWAYS = [
  { value: "solidpay", label: "SolidPay", type: "auto gateway" },
  { value: "jazzcash", label: "JazzCash", type: "fiat" },
  { value: "easypaisa", label: "Easypaisa", type: "fiat" },
  { value: "crypto_usdt", label: "USDT", type: "crypto" },
  { value: "crypto_eth", label: "ETH", type: "crypto" },
] as const;

type PaymentAccountFormProps = {
  mode: "create" | "edit";
  accountId?: string;
  initialData?: {
    gateway: GatewayType;
    label: string;
    credentials: PaymentAccountCredentials;
    daily_limit: string | number;
    priority: number;
    is_deposit: boolean;
    is_withdrawal: boolean;
    is_active?: boolean;
  };
};

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  mono,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  disabled?: boolean;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className={`w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-70 ${mono ? "font-mono" : ""}`}
    />
  );
}

export function PaymentAccountForm({ mode, accountId, initialData }: PaymentAccountFormProps) {
  const router = useRouter();
  const credentials = initialData?.credentials ?? {};
  const [gateway, setGateway] = useState<GatewayType>(initialData?.gateway ?? "jazzcash");
  const [label, setLabel] = useState(initialData?.label ?? "");
  const [dailyLimit, setDailyLimit] = useState(String(initialData?.daily_limit ?? "50000"));
  const [priority, setPriority] = useState(String(initialData?.priority ?? 0));
  const [isDeposit, setIsDeposit] = useState(initialData?.is_deposit ?? true);
  const [isWithdrawal, setIsWithdrawal] = useState(initialData?.is_withdrawal ?? true);
  const [isActive, setIsActive] = useState(initialData?.is_active ?? true);
  const [sandbox, setSandbox] = useState(Boolean(credentials.sandbox));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [jcMerchantId, setJcMerchantId] = useState(String(credentials.merchant_id ?? ""));
  const [jcPassword, setJcPassword] = useState(String(credentials.password ?? ""));
  const [jcSalt, setJcSalt] = useState(String(credentials.integrity_salt ?? ""));

  const [epStoreId, setEpStoreId] = useState(String(credentials.store_id ?? ""));
  const [epHashKey, setEpHashKey] = useState(String(credentials.hash_key ?? ""));

  // SolidPay routes JazzCash/Easypaisa through one merchant account. The API
  // key lives in SOLID_PAY_API_KEY and is never stored here.
  const [merchNo, setMerchNo] = useState(String(credentials.merch_no ?? ""));
  const [jazzcashChannel, setJazzcashChannel] = useState(String(credentials.jazzcash_channel ?? "Jazzcash"));
  const [easypaisaChannel, setEasypaisaChannel] = useState(String(credentials.easypaisa_channel ?? "Easypaisa"));
  const [payInFeePct, setPayInFeePct] = useState(String(credentials.payin_fee_pct ?? ""));
  const [payOutFeePct, setPayOutFeePct] = useState(String(credentials.payout_fee_pct ?? ""));

  const [cryptoAddress, setCryptoAddress] = useState(String(credentials.wallet_address ?? ""));
  const [cryptoNetwork, setCryptoNetwork] = useState(String(credentials.network ?? "TRC20"));
  const [webhookSecret, setWebhookSecret] = useState(String(credentials.webhook_secret ?? ""));

  // Manual-flow display fields (shown to players on the deposit checkout).
  const [accountTitle, setAccountTitle] = useState(String(credentials.account_title ?? ""));
  const [accountNumber, setAccountNumber] = useState(String(credentials.account_number ?? ""));
  const [logo, setLogo] = useState(String(credentials.logo ?? ""));
  const [instructions, setInstructions] = useState(String(credentials.instructions ?? ""));
  const [logoLoading, setLogoLoading] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const isCrypto = gateway.startsWith("crypto");
  const isSolidPay = gateway === "solidpay";
  const origin = typeof window !== "undefined" ? window.location.origin : "https://yourdomain.com";

  const handleLogoPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoLoading(true);
    setError(null);
    try {
      setLogo(await compressImage(file, { maxDim: 256, quality: 0.8 }));
    } catch {
      setError("Could not process the logo image. Try a different file.");
    } finally {
      setLogoLoading(false);
      e.target.value = "";
    }
  };

  const buildCredentials = (): PaymentAccountCredentials => {
    // Display fields are shared across every gateway — these are what players
    // see on the manual checkout.
    const display = {
      account_title: accountTitle,
      logo,
      instructions,
    };

    if (gateway === "solidpay") {
      return {
        ...credentials,
        merch_no: merchNo.trim(),
        jazzcash_channel: jazzcashChannel,
        easypaisa_channel: easypaisaChannel,
        payin_fee_pct: Number(payInFeePct) || 0,
        payout_fee_pct: Number(payOutFeePct) || 0,
      };
    }

    if (gateway === "jazzcash") {
      return {
        ...credentials,
        ...display,
        account_number: accountNumber,
        merchant_id: jcMerchantId,
        password: jcPassword,
        integrity_salt: jcSalt,
        sandbox,
      };
    }

    if (gateway === "easypaisa") {
      return {
        ...credentials,
        ...display,
        account_number: accountNumber,
        store_id: epStoreId,
        hash_key: epHashKey,
        sandbox,
      };
    }

    return {
      ...credentials,
      ...display,
      wallet_address: cryptoAddress,
      network: cryptoNetwork,
      webhook_secret: webhookSecret,
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (mode === "create") {
        await createPaymentAccount({
          gateway,
          label,
          credentials: buildCredentials(),
          daily_limit: Number(dailyLimit),
          priority: Number(priority),
          is_deposit: isDeposit,
          is_withdrawal: isWithdrawal,
        });
      } else {
        if (!accountId) throw new Error("Missing payment account id.");

        await updatePaymentAccount(accountId, {
          label,
          credentials: buildCredentials(),
          daily_limit: Number(dailyLimit),
          priority: Number(priority),
          is_active: isActive,
          is_deposit: isDeposit,
          is_withdrawal: isWithdrawal,
        });
      }

      router.push("/admin/payment-accounts");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed");
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => router.back()}
          className="inline-flex h-11 items-center justify-center rounded-2xl border border-border bg-card px-4 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Go back"
        >
          Back
        </button>
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/80">Admin Setup</p>
          <h1 className="text-3xl font-bold tracking-tight">
            {mode === "create" ? "Add payment account" : "Edit payment account"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {mode === "create"
              ? "Create a new payment route for deposits, withdrawals, or both."
              : "Update routing, credentials, and account behavior without leaving the admin flow."}
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_340px]">
        <form onSubmit={handleSubmit} className="rounded-[28px] border border-border/70 bg-card/80 p-6 shadow-sm sm:p-8">
          <div className="space-y-8">
            <section className="space-y-4">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold">Account basics</h2>
                <p className="text-sm text-muted-foreground">Choose a gateway, name it clearly, and decide how traffic should be routed.</p>
              </div>

              <Field label="Gateway">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {GATEWAYS.map((g) => (
                    <button
                      key={g.value}
                      type="button"
                      onClick={() => mode === "create" && setGateway(g.value)}
                      disabled={mode === "edit"}
                      className={`rounded-2xl border px-3 py-3 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-80 ${
                        gateway === g.value ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary hover:bg-accent"
                      }`}
                    >
                      <p className="font-medium">{g.label}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">{g.type}</p>
                    </button>
                  ))}
                </div>
                {mode === "edit" && <p className="text-[11px] text-muted-foreground">Gateway is locked for existing accounts to avoid accidental routing changes.</p>}
              </Field>

              <Field label="Internal label" hint="e.g. JazzCash Merchant #1">
                <TextInput value={label} onChange={setLabel} placeholder="Account label" />
              </Field>
            </section>

            {/* Aggregator rows are routing config, not an account players pay into. */}
            {!isSolidPay && (
            <section className="space-y-4">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold">Payment details (shown to players)</h2>
                <p className="text-sm text-muted-foreground">
                  In manual mode these appear on the deposit checkout so players know exactly where to send their payment.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Account holder name" hint="e.g. Muhammad Ali">
                  <TextInput value={accountTitle} onChange={setAccountTitle} placeholder="Name on the account" />
                </Field>
                {!isCrypto && (
                  <Field label="Account number" hint="Number players send money to">
                    <TextInput value={accountNumber} onChange={setAccountNumber} placeholder="03001234567" mono />
                  </Field>
                )}
              </div>

              <Field label="Logo" hint="Optional — shown next to the method (PNG/JPG)">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-secondary">
                    {logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={logo} alt="logo" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">None</span>
                    )}
                  </div>
                  <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoPick} />
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    disabled={logoLoading}
                    className="inline-flex items-center gap-2 rounded-xl border border-border bg-secondary px-4 py-2 text-sm transition-colors hover:bg-accent disabled:opacity-60"
                  >
                    <Upload className="h-4 w-4" />
                    {logoLoading ? "Processing…" : logo ? "Change logo" : "Upload logo"}
                  </button>
                  {logo && !logoLoading && (
                    <button
                      type="button"
                      onClick={() => setLogo("")}
                      className="inline-flex items-center gap-1 text-sm text-destructive transition-colors hover:opacity-80"
                    >
                      <X className="h-4 w-4" /> Remove
                    </button>
                  )}
                </div>
              </Field>

              <Field label="Instructions" hint="Optional — extra guidance shown to the player">
                <textarea
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="e.g. Send the exact amount, then upload your payment screenshot."
                  rows={3}
                  className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </Field>
            </section>
            )}

            {isSolidPay && (
              <section className="space-y-4">
                <div className="rounded-2xl border border-border bg-secondary/40 p-4 text-xs text-muted-foreground">
                  <p className="font-semibold text-foreground">SolidPay aggregator</p>
                  <p className="mt-1">
                    Serves JazzCash and Easypaisa for both deposits and payouts while payment mode is
                    set to Auto. The API key is read from <code className="font-mono">SOLID_PAY_API_KEY</code>{" "}
                    and is never stored in the database.
                  </p>
                </div>

                <Field label="Merchant number (merchNo)" hint="Leave blank to use SOLID_PAY_MERCHANT_NO from the environment">
                  <TextInput value={merchNo} onChange={setMerchNo} placeholder="pulsenow" mono />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="JazzCash collection channel" hint="Hosted opens a checkout page; direct pushes to the player's wallet app">
                    <select
                      value={jazzcashChannel}
                      onChange={(e) => setJazzcashChannel(e.target.value)}
                      className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="Jazzcash">Jazzcash (hosted page)</option>
                      <option value="Jazzcash_Direct">Jazzcash_Direct (push to wallet)</option>
                    </select>
                  </Field>
                  <Field label="Easypaisa collection channel" hint="Only pick direct if SolidPay has enabled it for this merchant">
                    <select
                      value={easypaisaChannel}
                      onChange={(e) => setEasypaisaChannel(e.target.value)}
                      className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="Easypaisa">Easypaisa (hosted page)</option>
                      <option value="Easypaisa_Direct">Easypaisa_Direct (push to wallet)</option>
                    </select>
                  </Field>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Deposit commission (%)"
                    hint="A PKR 1,000 deposit landing as 970 means 3"
                  >
                    <TextInput value={payInFeePct} onChange={setPayInFeePct} placeholder="3" mono />
                  </Field>
                  <Field
                    label="Payout commission (%)"
                    hint="Ask SolidPay — used to estimate the real gateway balance"
                  >
                    <TextInput value={payOutFeePct} onChange={setPayOutFeePct} placeholder="0" mono />
                  </Field>
                </div>
              </section>
            )}

            {gateway === "jazzcash" && (
              <section className="space-y-4">
                <div className="rounded-2xl border border-border bg-secondary/40 p-4 text-xs text-muted-foreground">
                  <p className="font-semibold text-foreground">JazzCash MWALLET API</p>
                  <p className="mt-1">Get credentials from the JazzCash merchant portal. Sandbox host: sandbox.jazzcash.com.pk.</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Merchant ID">
                    <TextInput value={jcMerchantId} onChange={setJcMerchantId} placeholder="MC12345" />
                  </Field>
                  <Field label="API Password">
                    <TextInput value={jcPassword} onChange={setJcPassword} placeholder="API password from portal" />
                  </Field>
                </div>
                <Field label="Integrity Salt (HMAC key)" hint="Used to verify webhook signatures">
                  <TextInput value={jcSalt} onChange={setJcSalt} placeholder="Salt string" />
                </Field>
              </section>
            )}

            {gateway === "easypaisa" && (
              <section className="space-y-4">
                <div className="rounded-2xl border border-border bg-secondary/40 p-4 text-xs text-muted-foreground">
                  <p className="font-semibold text-foreground">Easypaisa MA Push API</p>
                  <p className="mt-1">Get credentials from the Easypaisa developer portal. Sandbox is supported.</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Store ID">
                    <TextInput value={epStoreId} onChange={setEpStoreId} placeholder="12345" />
                  </Field>
                  <Field label="Hash Key" hint="Used to compute and verify signatures">
                    <TextInput value={epHashKey} onChange={setEpHashKey} placeholder="Hash key from portal" />
                  </Field>
                </div>
              </section>
            )}

            {isCrypto && (
              <section className="space-y-4">
                <div className="rounded-2xl border border-border bg-secondary/40 p-4 text-xs text-muted-foreground">
                  <p className="font-semibold text-foreground">Crypto monitoring via Tatum.io</p>
                  <p className="mt-1">Add this wallet to an ADDRESS_TRANSACTION subscription so incoming transfers trigger your webhook.</p>
                </div>
                <Field label="Wallet address" hint="Players send funds to this address">
                  <TextInput value={cryptoAddress} onChange={setCryptoAddress} placeholder="TRC20 / ERC20 address" mono />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Network">
                    <select
                      value={cryptoNetwork}
                      onChange={(e) => setCryptoNetwork(e.target.value)}
                      className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="TRC20">TRC20 (Tron)</option>
                      <option value="ERC20">ERC20 (Ethereum)</option>
                      <option value="BEP20">BEP20 (BSC)</option>
                    </select>
                  </Field>
                  <Field label="Webhook secret" hint="Optional but recommended">
                    <TextInput value={webhookSecret} onChange={setWebhookSecret} placeholder="Random secret string" />
                  </Field>
                </div>
              </section>
            )}

            {!isCrypto && !isSolidPay && (
              <label className="flex items-center gap-3 rounded-2xl border border-border bg-background/70 px-4 py-3">
                <input type="checkbox" checked={sandbox} onChange={(e) => setSandbox(e.target.checked)} className="h-4 w-4 accent-primary" />
                <span className="text-sm">Use sandbox API endpoint</span>
              </label>
            )}

            <section className="space-y-4">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold">Routing rules</h2>
                <p className="text-sm text-muted-foreground">Set daily capacity and decide where this account can be used.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Daily limit (PKR)">
                  <input
                    type="number"
                    value={dailyLimit}
                    onChange={(e) => setDailyLimit(e.target.value)}
                    className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </Field>
                <Field label="Priority" hint="Higher values are picked first">
                  <input
                    type="number"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {[{ label: "Accepts deposits", v: isDeposit, set: setIsDeposit }, { label: "Sends withdrawals", v: isWithdrawal, set: setIsWithdrawal }].map(({ label: optionLabel, v, set }) => (
                  <label key={optionLabel} className="flex items-center gap-3 rounded-2xl border border-border bg-background/70 px-4 py-3">
                    <input type="checkbox" checked={v} onChange={(e) => set(e.target.checked)} className="h-4 w-4 accent-primary" />
                    <span className="text-sm">{optionLabel}</span>
                  </label>
                ))}
              </div>

              {mode === "edit" && (
                <label className="flex items-center gap-3 rounded-2xl border border-border bg-background/70 px-4 py-3">
                  <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 accent-primary" />
                  <span className="text-sm">Account is active</span>
                </label>
              )}
            </section>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {loading ? (mode === "create" ? "Saving..." : "Updating...") : mode === "create" ? "Save account" : "Update account"}
            </button>
          </div>
        </form>

        <aside className="space-y-4">
          <div className="rounded-[28px] border border-border/70 bg-card/80 p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Webhook URLs</p>
            <p className="mt-2 text-sm text-muted-foreground">Register the matching callback URL in your gateway dashboard.</p>
            <div className="mt-5 space-y-3">
              {[
                { label: "SolidPay payIn_notify_url", url: `${origin}/api/webhooks/solidpay/payin` },
                { label: "SolidPay payOut_notify_url", url: `${origin}/api/webhooks/solidpay/payout` },
                { label: "JazzCash IPN", url: `${origin}/api/webhooks/jazzcash` },
                { label: "Easypaisa Callback", url: `${origin}/api/webhooks/easypaisa` },
                { label: "Crypto (Tatum)", url: `${origin}/api/webhooks/crypto` },
              ].map(({ label: itemLabel, url }) => (
                <div key={itemLabel} className="rounded-2xl border border-border bg-background/70 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{itemLabel}</p>
                  <code className="mt-2 block break-all rounded-xl bg-secondary px-3 py-2 text-[11px]">{url}</code>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-border/70 bg-card/80 p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              {mode === "create" ? "Tips" : "Editing notes"}
            </p>
            <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
              <li>Use a clear internal label so operators can identify the right account quickly.</li>
              <li>Keep priority higher on the accounts you want the system to route first.</li>
              <li>{mode === "create" ? "Disable deposit or withdrawal support if an account should only be used for one side of the flow." : "Gateway stays locked during editing so existing routing rules do not shift unexpectedly."}</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

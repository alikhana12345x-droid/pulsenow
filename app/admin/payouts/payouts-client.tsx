"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, AlertTriangle } from "lucide-react";
import {
  createHousePayout,
  syncHousePayout,
  getHousePayouts,
  getHouseFloatEstimate,
  getEgressIp,
} from "@/lib/actions/house-payouts";
import { SOLIDPAY_BANKS } from "@/lib/gateways/solidpay-banks";
import { APP_TIME_ZONE } from "@/lib/time";

type Payout = Awaited<ReturnType<typeof getHousePayouts>>[number];
type Float = Awaited<ReturnType<typeof getHouseFloatEstimate>>;

const STATUS_COLORS: Record<string, string> = {
  processing: "bg-blue-500/20 text-blue-400",
  completed: "bg-green-500/20 text-green-400",
  failed: "bg-red-500/20 text-red-400",
};

const pkr = (n: number) =>
  n.toLocaleString("en-PK", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

function fmt(d: Date | string) {
  return new Date(d).toLocaleString("en-PK", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: APP_TIME_ZONE,
  });
}

export function PayoutsClient({
  initialPayouts,
  float,
  gatewayReady,
}: {
  initialPayouts: Payout[];
  float: Float;
  gatewayReady: boolean;
}) {
  const router = useRouter();
  const [payouts, setPayouts] = useState(initialPayouts);
  const [pending, startTransition] = useTransition();

  const [method, setMethod] = useState("jazzcash");
  const [amount, setAmount] = useState("");
  const [acctNo, setAcctNo] = useState("");
  const [acctName, setAcctName] = useState("");
  const [mobile, setMobile] = useState("");
  const [note, setNote] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const isBank = method !== "jazzcash" && method !== "easypaisa";
  const numericAmount = Number(amount);

  const refresh = () =>
    startTransition(async () => {
      setPayouts(await getHousePayouts());
      router.refresh();
    });

  const submit = async () => {
    setError(null);
    setNotice(null);

    const destination = isBank
      ? `${SOLIDPAY_BANKS.find((b) => b.code === method)?.name ?? method} ${acctNo}`
      : `${method} ${acctNo}`;

    if (
      !confirm(
        `Send PKR ${pkr(numericAmount || 0)} to ${acctName} (${destination})?\n\n` +
          `This moves real money out of the gateway and cannot be undone from here.`
      )
    ) {
      return;
    }

    setSending(true);
    try {
      const result = await createHousePayout({
        amount: numericAmount,
        method,
        acctNo,
        acctName,
        mobile,
        note,
      });

      if (result.status === "failed") {
        setError(`Provider rejected the payout: ${result.message}`);
      } else {
        setNotice(result.message || "Payout accepted — awaiting confirmation.");
        setAmount("");
        setNote("");
      }
      setPayouts(await getHousePayouts());
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Payout failed");
    } finally {
      setSending(false);
    }
  };

  const sync = async (id: string) => {
    const result = await syncHousePayout(id);
    setNotice(result.changed ? `Settled as ${result.status}` : result.reason ?? "No change yet");
    setPayouts(await getHousePayouts());
    router.refresh();
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary/80">Finance</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Profit Payouts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Move the house&apos;s own funds out of the payment gateway to a company account. Player
          withdrawals are handled separately under Finance.
        </p>
      </div>

      {!gatewayReady && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <p className="text-sm text-amber-400">
            SolidPay is not configured — set <code className="font-mono">SOLID_PAY_API_KEY</code> and{" "}
            <code className="font-mono">SOLID_PAY_MERCHANT_NO</code> before sending a payout.
          </p>
        </div>
      )}

      {/* ── Float estimate ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          {
            label: float.payInFeePct ? `Collected (net of ${float.payInFeePct}%)` : "Collected",
            value: float.collected,
            color: "text-green-400",
          },
          { label: "Paid to players", value: float.paidToPlayers, color: "text-blue-400" },
          { label: "Already taken", value: float.takenByHouse, color: "text-muted-foreground" },
          { label: "Estimated available", value: float.available, color: "text-primary" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-2xl border border-border/70 bg-card/80 px-4 py-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`mt-1 text-xl font-bold tabular-nums ${color}`}>PKR {pkr(value)}</p>
          </div>
        ))}
      </div>

      <p className="-mt-3 text-xs text-muted-foreground">
        {float.feesConfigured ? (
          <>
            Estimated from settled records, net of the commission rates set on the SolidPay account
            ({float.payInFeePct}% in, {float.payOutFeePct}% out).
          </>
        ) : (
          <>
            <span className="text-amber-400">Commission rates are not set</span>, so this overstates
            the balance — a PKR 1,000 deposit lands as about 970. Set them on the SolidPay payment
            account.
          </>
        )}{" "}
        SolidPay&apos;s Money Detail page is the authority — always leave enough float to cover
        pending player withdrawals.
      </p>

      <EgressIpCard />

      {/* ── Send form ── */}
      <div className="rounded-3xl border border-border/70 bg-card/80 p-5">
        <h2 className="font-semibold tracking-tight">Send a payout</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          The account holder name must match the destination account exactly, or the provider
          rejects the transfer.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Destination">
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="jazzcash">JazzCash</option>
              <option value="easypaisa">Easypaisa</option>
              <optgroup label="Banks">
                {SOLIDPAY_BANKS.map((b) => (
                  <option key={b.code} value={b.code}>
                    {b.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </Field>

          <Field label="Amount (PKR)">
            <input
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="10000"
              className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </Field>

          <Field label={isBank ? "Bank account number" : "Wallet number"}>
            <input
              value={acctNo}
              onChange={(e) => setAcctNo(e.target.value)}
              placeholder={isBank ? "PK00XXXX0000000000000000" : "03001234567"}
              className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </Field>

          <Field label="Account holder name">
            <input
              value={acctName}
              onChange={(e) => setAcctName(e.target.value)}
              placeholder="As registered on the account"
              className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </Field>

          {isBank && (
            <Field label="Mobile number" hint="Required by the provider for bank transfers">
              <input
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                placeholder="03001234567"
                className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </Field>
          )}

          <Field label="Note" hint="Optional — kept on the record only">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. weekly settlement"
              className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </Field>
        </div>

        {error && (
          <p className="mt-4 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}
        {notice && (
          <p className="mt-4 rounded-lg border border-green-500/25 bg-green-500/10 px-3 py-2 text-sm text-green-400">
            {notice}
          </p>
        )}

        <button
          onClick={submit}
          disabled={sending || !gatewayReady || !numericAmount || !acctNo || !acctName}
          className="mt-4 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {sending ? "Sending…" : "Send payout"}
        </button>
      </div>

      {/* ── History ── */}
      <div className="overflow-hidden rounded-3xl border border-border/70 bg-card/80">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <div>
            <h2 className="font-semibold tracking-tight">Payout history</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Sent by the house, newest first. A failed payout means the money never left the gateway.
            </p>
          </div>
          <button
            onClick={refresh}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${pending ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border/60">
                {["Amount", "Destination", "Status", "Reference", "Sent", ""].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {payouts.map((p) => (
                <tr key={p.id} className="border-b border-border/40 last:border-0 hover:bg-accent/30">
                  <td className="px-4 py-3 font-mono font-semibold">{pkr(Number(p.amount))}</td>
                  <td className="px-4 py-3">
                    <div className="text-sm">{p.acct_name}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">
                      {p.acct_code} · {p.acct_no}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${
                        STATUS_COLORS[p.status] ?? "bg-secondary text-muted-foreground"
                      }`}
                    >
                      {p.status}
                    </span>
                    {p.failure_reason && (
                      <p className="mt-1 max-w-[220px] text-xs text-red-400/80">{p.failure_reason}</p>
                    )}
                  </td>
                  <td className="max-w-[160px] truncate px-4 py-3 font-mono text-[11px] text-muted-foreground">
                    {p.gateway_ref ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{fmt(p.created_at)}</td>
                  <td className="px-4 py-3 text-right">
                    {p.status === "processing" && (
                      <button
                        onClick={() => sync(p.id)}
                        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-secondary px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      >
                        <RefreshCw className="h-3 w-3" />
                        Sync
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {payouts.length === 0 && (
                <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                  No payouts yet.
                </td>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/**
 * SolidPay rejects payouts from un-whitelisted addresses ("IP error"), so this
 * reports the address this server actually goes out from. On serverless hosting
 * it is the IP of one invocation and may differ on the next — check it twice
 * before handing it over, and see the note below if it moves.
 */
function EgressIpCard() {
  const [ip, setIp] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seen, setSeen] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const check = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getEgressIp();
      setIp(result.ip);
      setError(result.error);
      if (result.ip) {
        setSeen((prev) => (prev.includes(result.ip!) ? prev : [...prev, result.ip!]));
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Lookup failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border/70 bg-card/80 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Outbound IP</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            The address SolidPay sees. Send it to their support to whitelist payouts.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {ip && <code className="rounded-lg bg-secondary px-3 py-1.5 font-mono text-sm">{ip}</code>}
          <button
            onClick={check}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            {ip ? "Check again" : "Check"}
          </button>
        </div>
      </div>

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      {seen.length > 1 && (
        <p className="mt-2 flex items-start gap-2 text-xs text-amber-400">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            This server has gone out from {seen.length} different addresses ({seen.join(", ")}), so a
            whitelist of any single one will keep breaking. A fixed outbound address is needed.
          </span>
        </p>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground/70">{hint}</p>}
    </div>
  );
}

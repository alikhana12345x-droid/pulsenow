"use client";

import { useEffect, useState } from "react";
import { RefreshCw, ChevronRight, FileText, TrendingUp, TrendingDown } from "lucide-react";
import { PanelHeader } from "./panel-header";
import { T } from "./../theme";

const TABS = ["Statement", "Bet record", "Report", "Retrieve Balance"] as const;

interface Transaction {
  id: string;
  type: string;
  amount: string;
  balance_after: string;
  description: string | null;
  created_at: string;
}

interface Bet {
  id: string;
  amount: string;
  payout: string;
  profit: string;
  game_type: string;
  multiplier: string | null;
  created_at: string;
}

interface Deposit {
  id: string;
  amount: string;
  currency: string;
  status: string;
  created_at: string;
}

interface Withdrawal {
  id: string;
  amount: string;
  currency: string;
  method: string;
  status: string;
  created_at: string;
}

interface WalletSummary {
  balance: number;
  total_deposited: number;
  total_withdrawn: number;
  total_won: number;
  total_wagered: number;
  currency: string;
  is_locked: boolean;
}

interface RecordsData {
  transactions: Transaction[];
  bets: Bet[];
  deposits: Deposit[];
  withdrawals: Withdrawal[];
  wallet: WalletSummary | null;
}

interface RecordsPanelProps {
  onBack: () => void;
}

export function RecordsPanel({ onBack }: RecordsPanelProps) {
  const [tab, setTab] = useState(0);
  const [data, setData] = useState<RecordsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRecords = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/wallet/records");
      if (!res.ok) throw new Error("Failed to load records");
      setData(await res.json());
    } catch {
      setError("Could not load records. Tap refresh to retry.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, []);

  const wallet = data?.wallet;
  const currency = wallet?.currency ?? "PKR";

  return (
    <div
      className="relative w-full max-w-[600px] flex flex-col m-auto"
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        background: T.bg,
        fontFamily: T.uiFont,
      }}
    >
      <PanelHeader title="My Records" onBack={onBack} />

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          borderBottom: `1px solid ${T.border}`,
          background: T.bgMid,
        }}
      >
        {TABS.map((t, i) => (
          <button
            key={t}
            onClick={() => setTab(i)}
            style={{
              flex: 1,
              padding: "11px 4px",
              background: "transparent",
              border: "none",
              borderBottom: tab === i ? `2px solid ${T.accent}` : "2px solid transparent",
              color: tab === i ? T.accent : T.textMuted,
              fontSize: 10,
              fontWeight: 700,
              cursor: "pointer",
              letterSpacing: 0.2,
              transition: "color 0.15s",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Balance row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px 8px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: T.textMuted }}>Current Balance</span>
          <span
            style={{
              fontFamily: T.monoFont,
              fontSize: 13,
              fontWeight: 700,
              color: T.accent,
            }}
          >
            {loading ? "—" : `${currency} ${(wallet?.balance ?? 0).toLocaleString("en-PK")}`}
          </span>
          <button
            onClick={fetchRecords}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 0 }}
          >
            <RefreshCw
              size={11}
              color={T.accent}
              style={{ animation: loading ? "spin 1s linear infinite" : "none" }}
            />
          </button>
        </div>
        <button
          onClick={() => setTab(3)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            background: "transparent",
            border: "none",
            color: T.accent,
            fontSize: 11,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Retrieve Balance <ChevronRight size={11} />
        </button>
      </div>

      <p
        style={{
          padding: "0 16px 12px",
          fontSize: 10,
          lineHeight: 1.6,
          color: T.textMuted,
        }}
      >
        If your balance is lost when entering or leaving a game, use the self-service balance recovery tab.
      </p>

      {/* Content area */}
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {error ? (
          <EmptyState icon={<RefreshCw size={32} strokeWidth={1} color={T.textMuted} />} message={error} />
        ) : loading ? (
          <LoadingRows />
        ) : (
          <>
            {tab === 0 && <StatementTab transactions={data?.transactions ?? []} currency={currency} />}
            {tab === 1 && <BetRecordTab bets={data?.bets ?? []} currency={currency} />}
            {tab === 2 && <ReportTab wallet={wallet as any} currency={currency} />}
            {tab === 3 && (
              <RetrieveTab
                deposits={data?.deposits ?? []}
                withdrawals={data?.withdrawals ?? []}
                currency={currency}
                isLocked={wallet?.is_locked ?? false}
              />
            )}
          </>
        )}
      </div>
      <br /><br /> <br />
      {/* Footer totals */}
      <div
        className="absolute bottom-0 left-0 w-full"
        style={{
          borderTop: `1px solid ${T.border}`,
          padding: "14px 16px",
          background: T.bgMid,
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {[
            ["Total Deposits", `${currency} ${(wallet?.total_deposited ?? 0).toLocaleString("en-PK")}`],
            ["Total Withdrawal", `${currency} ${(wallet?.total_withdrawn ?? 0).toLocaleString("en-PK")}`],
            ["Total Won", `${currency} ${(wallet?.total_won ?? 0).toLocaleString("en-PK")}`],
          ].map(([label, val]) => (
            <div key={label}>
              <p style={{ fontSize: 10, color: T.textMuted }}>{label}</p>
              <p
                style={{
                  marginTop: 3,
                  fontFamily: T.monoFont,
                  fontSize: 12,
                  fontWeight: 700,
                  color: T.accent,
                }}
              >
                {loading ? "—" : val}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Statement ───────────────────────────────────────────────────────────

function StatementTab({ transactions, currency }: { transactions: Transaction[]; currency: string }) {
  if (!transactions.length) {
    return <EmptyState message="No transactions yet." />;
  }
  return (
    <div style={{ overflowY: "auto", flex: 1 }}>
      {transactions.map((tx) => {
        const isCredit = ["deposit", "referral_commission", "refund"].includes(tx.type);
        const amt = Number(tx.amount);
        return (
          <div
            key={tx.id}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "11px 16px",
              borderBottom: `1px solid ${T.border}`,
            }}
          >
            <div>
              <p style={{ fontSize: 12, fontWeight: 600, color: T.textPrimary, textTransform: "capitalize" }}>
                {tx.type.replace(/_/g, " ")}
              </p>
              <p style={{ marginTop: 2, fontSize: 10, color: T.textMuted }}>
                {tx.description ?? formatDate(tx.created_at)}
              </p>
              <p style={{ marginTop: 1, fontSize: 9, color: T.textMuted }}>
                Balance after: {currency} {Number(tx.balance_after).toLocaleString("en-PK")}
              </p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p
                style={{
                  fontFamily: T.monoFont,
                  fontSize: 13,
                  fontWeight: 700,
                  color: isCredit ? "#4ade80" : "#f87171",
                }}
              >
                {isCredit ? "+" : "-"}{currency} {amt.toLocaleString("en-PK")}
              </p>
              <p style={{ marginTop: 2, fontSize: 9, color: T.textMuted }}>{formatDate(tx.created_at)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Tab: Bet Record ──────────────────────────────────────────────────────────

function BetRecordTab({ bets, currency }: { bets: Bet[]; currency: string }) {
  if (!bets.length) {
    return <EmptyState message="No bets placed yet." />;
  }
  return (
    <div style={{ overflowY: "auto", flex: 1 }}>
      {bets.map((bet) => {
        const profit = Number(bet.profit);
        const won = profit > 0;
        return (
          <div
            key={bet.id}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "11px 16px",
              borderBottom: `1px solid ${T.border}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: won ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {won
                  ? <TrendingUp size={13} color="#4ade80" />
                  : <TrendingDown size={13} color="#f87171" />
                }
              </div>
              <div>
                <p style={{ fontSize: 12, fontWeight: 600, color: T.textPrimary, textTransform: "capitalize" }}>
                  {bet.game_type.replace(/-/g, " ")}
                </p>
                <p style={{ marginTop: 2, fontSize: 10, color: T.textMuted }}>
                  Bet: {currency} {Number(bet.amount).toLocaleString("en-PK")}
                  {bet.multiplier ? ` · ${Number(bet.multiplier).toFixed(2)}×` : ""}
                </p>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <p
                style={{
                  fontFamily: T.monoFont,
                  fontSize: 13,
                  fontWeight: 700,
                  color: won ? "#4ade80" : "#f87171",
                }}
              >
                {won ? "+" : ""}{currency} {profit.toLocaleString("en-PK")}
              </p>
              <p style={{ marginTop: 2, fontSize: 9, color: T.textMuted }}>{formatDate(bet.created_at)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Tab: Report ──────────────────────────────────────────────────────────────

function ReportTab({ wallet, currency }: { wallet: WalletSummary | null; currency: string }) {
  const deposited = wallet?.total_deposited ?? 0;
  const withdrawn = wallet?.total_withdrawn ?? 0;
  const wagered = wallet?.total_wagered ?? 0;
  const won = wallet?.total_won ?? 0;
  const netPL = won - wagered;

  const stats = [
    { label: "Total Deposited", value: deposited, color: "#4ade80" },
    { label: "Total Withdrawn", value: withdrawn, color: T.textPrimary },
    { label: "Total Wagered", value: wagered, color: T.textPrimary },
    { label: "Total Won", value: won, color: "#4ade80" },
    { label: "Net P&L", value: netPL, color: netPL >= 0 ? "#4ade80" : "#f87171" },
  ];

  return (
    <div style={{ overflowY: "auto", flex: 1, padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
      {stats.map(({ label, value, color }) => (
        <div
          key={label}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px 14px",
            borderRadius: T.radius.md,
            background: T.bgCard,
            border: `1px solid ${T.border}`,
          }}
        >
          <span style={{ fontSize: 12, color: T.textSub }}>{label}</span>
          <span
            style={{
              fontFamily: T.monoFont,
              fontSize: 13,
              fontWeight: 700,
              color,
            }}
          >
            {value < 0 ? "-" : ""}{currency} {Math.abs(value).toLocaleString("en-PK")}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Tab: Retrieve Balance ────────────────────────────────────────────────────

function RetrieveTab({
  deposits,
  withdrawals,
  currency,
  isLocked,
}: {
  deposits: Deposit[];
  withdrawals: Withdrawal[];
  currency: string;
  isLocked: boolean;
}) {
  const pendingWithdrawals = withdrawals.filter((w) => w.status === "pending");

  return (
    <div style={{ overflowY: "auto", flex: 1, padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
      {isLocked && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: T.radius.md,
            background: "rgba(251,191,36,0.08)",
            border: "1px solid rgba(251,191,36,0.2)",
            fontSize: 12,
            color: "#fbbf24",
          }}
        >
          Your wallet is locked pending a withdrawal review. Contact support if this takes too long.
        </div>
      )}

      {pendingWithdrawals.length > 0 && (
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: T.textMuted, marginBottom: 8 }}>
            Pending Withdrawals
          </p>
          {pendingWithdrawals.map((w) => (
            <div
              key={w.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "11px 14px",
                borderRadius: T.radius.md,
                background: T.bgCard,
                border: `1px solid ${T.border}`,
                marginBottom: 6,
              }}
            >
              <div>
                <p style={{ fontSize: 12, fontWeight: 600, color: T.textPrimary, textTransform: "capitalize" }}>
                  {w.method}
                </p>
                <p style={{ marginTop: 2, fontSize: 10, color: T.textMuted }}>{formatDate(w.created_at)}</p>
              </div>
              <div style={{ textAlign: "right" }}>
                <p style={{ fontFamily: T.monoFont, fontSize: 13, fontWeight: 700, color: T.accent }}>
                  {currency} {Number(w.amount).toLocaleString("en-PK")}
                </p>
                <p style={{ marginTop: 2, fontSize: 9, color: "#fbbf24", textTransform: "uppercase" }}>
                  {w.status}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div>
        <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: T.textMuted, marginBottom: 8 }}>
          Recent Deposits
        </p>
        {deposits.length === 0 ? (
          <EmptyState message="No deposits yet." />
        ) : (
          deposits.slice(0, 10).map((d) => (
            <div
              key={d.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "11px 14px",
                borderRadius: T.radius.md,
                background: T.bgCard,
                border: `1px solid ${T.border}`,
                marginBottom: 6,
              }}
            >
              <div>
                <p style={{ fontSize: 12, fontWeight: 600, color: T.textPrimary }}>Deposit</p>
                <p style={{ marginTop: 2, fontSize: 10, color: T.textMuted }}>{formatDate(d.created_at)}</p>
              </div>
              <div style={{ textAlign: "right" }}>
                <p style={{ fontFamily: T.monoFont, fontSize: 13, fontWeight: 700, color: "#4ade80" }}>
                  +{currency} {Number(d.amount).toLocaleString("en-PK")}
                </p>
                <p
                  style={{
                    marginTop: 2,
                    fontSize: 9,
                    textTransform: "uppercase",
                    color: d.status === "confirmed" ? "#4ade80" : "#fbbf24",
                  }}
                >
                  {d.status}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function EmptyState({
  icon,
  message,
}: {
  icon?: React.ReactNode;
  message: string;
}) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        padding: "48px 16px",
        color: T.textMuted,
      }}
    >
      {icon ?? <FileText size={36} strokeWidth={1} color={T.textMuted} />}
      <p style={{ fontSize: 12, textAlign: "center" }}>{message}</p>
    </div>
  );
}

function LoadingRows() {
  return (
    <div style={{ flex: 1, padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          style={{
            height: 52,
            borderRadius: T.radius.md,
            background: T.bgCard,
            border: `1px solid ${T.border}`,
            opacity: 1 - i * 0.15,
          }}
        />
      ))}
    </div>
  );
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" }) +
    " " +
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

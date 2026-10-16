"use client";

import { useEffect, useState } from "react";
import { RefreshCw, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { PanelHeader } from "./panel-header";
import { T } from "./../theme";

interface Deposit {
  id: string;
  amount: string;
  currency: string;
  status: string;
  gateway?: string | null;
  account_label?: string | null;
  created_at: string;
}

interface Withdrawal {
  id: string;
  amount: string;
  currency: string;
  method: string;
  destination: string;
  status: string;
  rejection_reason?: string | null;
  created_at: string;
}

interface RecordsData {
  deposits: Deposit[];
  withdrawals: Withdrawal[];
}

const GATEWAY_LABELS: Record<string, string> = {
  jazzcash: "JazzCash",
  easypaisa: "Easypaisa",
  crypto_usdt: "USDT",
  crypto_eth: "ETH",
};

function depositStatus(s: string): { label: string; color: string } {
  switch (s) {
    case "confirmed": return { label: "Confirmed", color: "#4ade80" };
    case "pending":   return { label: "Pending approval", color: "#fbbf24" };
    case "cancelled":
    case "failed":    return { label: "Declined", color: "#f87171" };
    default:          return { label: s, color: T.textMuted };
  }
}

function withdrawalStatus(s: string): { label: string; color: string } {
  switch (s) {
    case "completed":  return { label: "Paid", color: "#4ade80" };
    // case "pending":
    // case "processing": return { label: "Pending", color: "#fbbf24" };
    case "rejected":
    case "failed":     return { label: "Rejected", color: "#f87171" };
    default: return { label: "Paid", color: "#4ade80" };
  }
}

export function PaymentsHistoryPanel({
  kind,
  onBack,
}: {
  kind: "deposit" | "withdrawal";
  onBack: () => void;
}) {
  const [data, setData] = useState<RecordsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRecords = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/wallet/records", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load");
      setData(await res.json());
    } catch {
      setError("Could not load history. Tap refresh to retry.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRecords(); }, []);

  const isDeposit = kind === "deposit";
  const deposits = data?.deposits ?? [];
  const withdrawals = data?.withdrawals ?? [];
  const count = isDeposit ? deposits.length : withdrawals.length;

  return (
    <div
      className="relative w-full max-w-[600px] flex flex-col m-auto"
      style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, background: T.bg, fontFamily: T.uiFont }}
    >
      <PanelHeader title={isDeposit ? "Deposits" : "Withdrawals"} onBack={onBack} />

      {/* Sub-header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          borderBottom: `1px solid ${T.border}`,
          background: T.bgMid,
        }}
      >
        <span style={{ fontSize: 11, color: T.textMuted }}>
          {loading ? "Loading…" : `${count} ${isDeposit ? "deposit" : "withdrawal"}${count === 1 ? "" : "s"}`}
        </span>
        <button
          onClick={fetchRecords}
          style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", color: T.accent, fontSize: 11, fontWeight: 700, cursor: "pointer" }}
        >
          <RefreshCw size={12} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
          Refresh
        </button>
      </div>

      {/* List */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "12px 16px 24px", display: "flex", flexDirection: "column", gap: 8 }}>
        {error ? (
          <EmptyState message={error} />
        ) : loading ? (
          <LoadingRows />
        ) : isDeposit ? (
          deposits.length === 0 ? (
            <EmptyState message="No deposits yet." />
          ) : (
            deposits.map((d) => {
              const st = depositStatus(d.status);
              const method = d.gateway ? (GATEWAY_LABELS[d.gateway] ?? d.gateway) : "Deposit";
              return (
                <Row
                  key={d.id}
                  icon={<ArrowDownToLine size={14} color="#4ade80" />}
                  title={method}
                  subtitle={d.account_label ?? undefined}
                  date={d.created_at}
                  amount={`+${d.currency} ${Number(d.amount).toLocaleString("en-PK")}`}
                  amountColor="#4ade80"
                  statusLabel={st.label}
                  statusColor={st.color}
                />
              );
            })
          )
        ) : withdrawals.length === 0 ? (
          <EmptyState message="No withdrawals yet." />
        ) : (
          withdrawals.map((w) => {
            const st = withdrawalStatus(w.status);
            const method = GATEWAY_LABELS[w.method] ?? w.method;
            return (
              <Row
                key={w.id}
                icon={<ArrowUpFromLine size={14} color={T.accent} />}
                title={method}
                subtitle={w.destination}
                date={w.created_at}
                amount={`-${w.currency} ${Number(w.amount).toLocaleString("en-PK")}`}
                amountColor={T.textPrimary}
                statusLabel={st.label}
                statusColor={st.color}
                note={w.status === "rejected" && w.rejection_reason ? w.rejection_reason : undefined}
              />
            );
          })
        )}
      </div>
    </div>
  );
}

function Row({
  icon, title, subtitle, date, amount, amountColor, statusLabel, statusColor, note,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  date: string;
  amount: string;
  amountColor: string;
  statusLabel: string;
  statusColor: string;
  note?: string;
}) {
  return (
    <div
      style={{
        padding: "11px 14px",
        borderRadius: T.radius.md,
        background: T.bgCard,
        border: `1px solid ${T.border}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <div
            style={{
              width: 28, height: 28, borderRadius: 8, flexShrink: 0,
              background: "rgba(255,255,255,0.05)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            {icon}
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: T.textPrimary }}>{title}</p>
            {subtitle && (
              <p style={{ marginTop: 2, fontSize: 10, color: T.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180, fontFamily: T.monoFont }}>
                {subtitle}
              </p>
            )}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <p style={{ fontFamily: T.monoFont, fontSize: 13, fontWeight: 700, color: amountColor }}>{amount}</p>
          <p style={{ marginTop: 2, fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3, color: statusColor }}>
            {statusLabel}
          </p>
        </div>
      </div>
      <div style={{ marginTop: 6, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 9, color: T.textMuted }}>{formatDate(date)}</span>
      </div>
      {note && (
        <p
          style={{
            marginTop: 8,
            padding: "7px 10px",
            borderRadius: T.radius.sm,
            background: "rgba(248,113,113,0.08)",
            border: "1px solid rgba(248,113,113,0.2)",
            fontSize: 10,
            color: "#f87171",
          }}
        >
          {note}
        </p>
      )}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: "60px 16px", color: T.textMuted }}>
      <p style={{ fontSize: 12, textAlign: "center" }}>{message}</p>
    </div>
  );
}

function LoadingRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} style={{ height: 64, borderRadius: T.radius.md, background: T.bgCard, border: `1px solid ${T.border}`, opacity: 1 - i * 0.15 }} />
      ))}
    </>
  );
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return (
    d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" }) +
    " " +
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  );
}

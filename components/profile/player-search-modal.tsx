"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Search, X } from "lucide-react";
import { T } from "@/components/theme";

// ─── Types ────────────────────────────────────────────────────────────────────

type Wallet = {
  balance: string;
  total_deposited: string;
  total_withdrawn: string;
  total_wagered: string;
  total_won: string;
  currency: string;
  is_locked: boolean;
};

type Player = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  role: string;
  kyc_status: string;
  is_banned: boolean;
  created_at: string;
  wallet: Wallet | null;
  betCount: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: string | number, currency = "PKR") {
  return `${currency} ${Number(n).toLocaleString("en-PK")}`;
}

function initials(p: Player) {
  return (
    p.display_name?.[0]?.toUpperCase() ??
    p.username?.[0]?.toUpperCase() ??
    "?"
  );
}

function displayName(p: Player) {
  return p.display_name ?? p.username ?? "Unknown";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Avatar({ player, size = 40 }: { player: Player; size?: number }) {
  const r = Math.round(size * 0.27);
  return player.avatar_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={player.avatar_url}
      alt=""
      style={{ width: size, height: size, borderRadius: r, objectFit: "cover", flexShrink: 0 }}
    />
  ) : (
    <div
      style={{
        width: size, height: size, borderRadius: r, flexShrink: 0,
        background: "rgba(242,154,11,0.1)", border: "1px solid rgba(242,154,11,0.25)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: T.monoFont, fontSize: size * 0.38, fontWeight: 900, color: T.accent,
      }}
    >
      {initials(player)}
    </div>
  );
}

function Badge({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span style={{
      fontSize: 8, padding: "2px 5px", borderRadius: 5,
      background: bg, color, fontWeight: 800, letterSpacing: 0.5,
    }}>
      {label}
    </span>
  );
}

function StatCard({ label, value, accent, span }: { label: string; value: string; accent?: boolean; span?: boolean }) {
  return (
    <div style={{
      padding: "11px 12px", borderRadius: T.radius.md,
      gridColumn: span ? "1 / -1" : undefined,
      background: accent ? "rgba(242,154,11,0.06)" : T.bgCard,
      border: `1px solid ${accent ? T.accentBorder : T.border}`,
    }}>
      <p style={{ fontFamily: T.monoFont, fontSize: 12, fontWeight: 800, color: accent ? T.accent : T.textPrimary }}>
        {value}
      </p>
      <p style={{ marginTop: 3, fontSize: 9, color: T.textMuted, textTransform: "uppercase", letterSpacing: 0.8 }}>
        {label}
      </p>
    </div>
  );
}

// ─── PlayerRow ────────────────────────────────────────────────────────────────

function PlayerRow({ player, onClick, exact }: { player: Player; onClick: () => void; exact?: boolean }) {
  const currency = player.wallet?.currency ?? "PKR";
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 10, width: "100%",
        padding: "9px 8px", borderRadius: T.radius.md,
        background: exact ? "rgba(242,154,11,0.05)" : "transparent",
        border: exact ? `1px solid rgba(242,154,11,0.18)` : "1px solid transparent",
        cursor: "pointer", textAlign: "left",
        transition: "background 0.1s",
      }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = exact ? "rgba(242,154,11,0.09)" : "rgba(255,255,255,0.03)")}
      onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = exact ? "rgba(242,154,11,0.05)" : "transparent")}
    >
      <Avatar player={player} size={40} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: T.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {displayName(player)}
          </span>
          {exact && <Badge label="MATCH" color="#f29a0b" bg="rgba(242,154,11,0.15)" />}
          {player.is_banned && <Badge label="BANNED" color="#ff5d73" bg="rgba(255,93,115,0.12)" />}
          {player.role === "admin" && <Badge label="ADMIN" color="#818cf8" bg="rgba(129,140,248,0.1)" />}
        </div>
        <p style={{ marginTop: 2, fontSize: 10, color: T.textMuted }}>
          {player.username ? `@${player.username} · ` : ""}ID: {player.id.slice(0, 8)}…
        </p>
      </div>

      {player.wallet && (
        <p style={{ fontFamily: T.monoFont, fontSize: 11, fontWeight: 700, color: T.accent, flexShrink: 0 }}>
          {fmt(player.wallet.balance, currency)}
        </p>
      )}
    </button>
  );
}

// ─── PlayerDetail ─────────────────────────────────────────────────────────────

function PlayerDetail({ player, onBack }: { player: Player; onBack: () => void }) {
  const currency = player.wallet?.currency ?? "PKR";
  const memberSince = new Date(player.created_at).toLocaleDateString("en-PK", {
    month: "short", year: "numeric",
  });

  // Only the money facts — balance plus lifetime deposit / withdraw totals.
  const stats = player.wallet
    ? [
      { label: "Balance", value: fmt(player.wallet.balance, currency), accent: true },
      { label: "Deposited", value: fmt(player.wallet.total_deposited, currency) },
      { label: "Withdrawn", value: fmt(player.wallet.total_withdrawn, currency) },
    ]
    : [];

  return (
    <>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderBottom: `1px solid ${T.border}` }}>
        <button
          onClick={onBack}
          style={{ background: "none", border: "none", cursor: "pointer", color: T.textSub, display: "flex", padding: 4, borderRadius: 8 }}
        >
          <ArrowLeft size={16} />
        </button>
        <span style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary }}>Player Profile</span>
      </div>

      {/* Player identity */}
      <div style={{
        padding: "18px 16px 16px",
        borderBottom: `1px solid ${T.border}`,
        background: "radial-gradient(ellipse at top right, rgba(242,154,11,0.08), transparent 60%)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Avatar player={player} size={52} />
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: T.textPrimary }}>{displayName(player)}</span>
              {player.is_banned && <Badge label="BANNED" color="#ff5d73" bg="rgba(255,93,115,0.1)" />}
              {player.role === "admin" && <Badge label="ADMIN" color="#818cf8" bg="rgba(129,140,248,0.1)" />}
            </div>
            {player.username && (
              <p style={{ marginTop: 2, fontSize: 11, color: T.textMuted }}>@{player.username}</p>
            )}
            <p style={{ marginTop: 2, fontSize: 9, color: T.textMuted, fontFamily: T.monoFont }}>
              ID: {player.id.slice(0, 16)}… · Since {memberSince}
            </p>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div style={{ padding: "14px 16px", overflowY: "auto", flex: 1 }}>
        {stats.length > 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {stats.map((s) => (
              <StatCard key={s.label} label={s.label} value={s.value} accent={s.accent} span={s.accent} />
            ))}
          </div>
        ) : (
          <p style={{ textAlign: "center", fontSize: 12, color: T.textMuted, padding: "24px 0" }}>
            No wallet data available
          </p>
        )}
      </div>
    </>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

function isExactMatch(p: Player, q: string) {
  const lq = q.toLowerCase().trim();
  return (
    p.username?.toLowerCase() === lq ||
    p.id.toLowerCase() === lq
  );
}

export function PlayerSearchModal({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Player[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Player | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); setLoading(false); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/players/search?q=${encodeURIComponent(query.trim())}`);
        const data = await res.json();
        const players: Player[] = data.players ?? [];
        // Sort exact matches to top
        players.sort((a, b) => {
          const aExact = isExactMatch(a, query) ? 0 : 1;
          const bExact = isExactMatch(b, query) ? 0 : 1;
          return aExact - bExact;
        });
        setResults(players);
        // Auto-open if exactly one exact match
        const exact = players.filter((p) => isExactMatch(p, query));
        if (exact.length === 1) setSelected(exact[0]);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 320);
    return () => clearTimeout(t);
  }, [query]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    // Backdrop
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(9,7,20,0.82)", backdropFilter: "blur(5px)",
        display: "flex", alignItems: "flex-end",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Sheet */}
      <div style={{
        width: "100%", maxWidth: 600, marginLeft: "auto", marginRight: "auto", maxHeight: "88vh",
        background: T.bgMid,
        borderRadius: `${T.radius.xl}px ${T.radius.xl}px 0 0`,
        border: `1px solid ${T.border}`, borderBottom: "none",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>

        {/* Sheet handle + title bar */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 16px 10px",
          borderBottom: `1px solid ${T.border}`,
        }}>
          {/* Drag handle */}
          <div style={{ width: 32, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.1)", margin: "0 auto", position: "absolute", left: "50%", transform: "translateX(-50%)", top: 8 }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary }}>
            {selected ? "Player Profile" : "Search Player"}
          </span>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: T.textMuted, display: "flex", padding: 4 }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Content — either search view or detail view */}
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflowY: "auto" }}>
          {selected ? (
            <PlayerDetail player={selected} onBack={() => setSelected(null)} />
          ) : (
            <>
              {/* Search input */}
              <div style={{ padding: "12px 16px 8px" }}>
                <div style={{ position: "relative" }}>
                  <Search size={13} style={{
                    position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)",
                    color: T.textMuted, pointerEvents: "none",
                  }} />
                  <input
                    ref={inputRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Username or player ID…"
                    style={{
                      width: "100%", padding: "10px 12px 10px 34px",
                      borderRadius: T.radius.md,
                      background: T.bgCard, border: `1px solid ${T.border}`,
                      color: T.textPrimary, fontFamily: T.uiFont, fontSize: 13,
                      outline: "none", boxSizing: "border-box",
                    }}
                    onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = T.accentBorder; }}
                    onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = T.border; }}
                  />
                  {query && (
                    <button
                      onClick={() => setQuery("")}
                      style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: T.textMuted, display: "flex" }}
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>

              {/* Results area */}
              <div style={{ padding: "4px 8px 16px", overflowY: "auto" }}>
                {loading && (
                  <p style={{ textAlign: "center", fontSize: 12, color: T.textMuted, padding: "28px 0" }}>
                    Searching…
                  </p>
                )}

                {!loading && query.trim().length < 2 && (
                  <p style={{ textAlign: "center", fontSize: 12, color: T.textMuted, padding: "36px 0" }}>
                    Type at least 2 characters
                  </p>
                )}

                {!loading && query.trim().length >= 2 && results.length === 0 && (
                  <div style={{ textAlign: "center", padding: "36px 0" }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: T.textSub }}>No players found</p>
                    <p style={{ marginTop: 4, fontSize: 11, color: T.textMuted }}>
                      Try a different username or ID
                    </p>
                  </div>
                )}

                {!loading && results.map((player) => (
                  <PlayerRow
                    key={player.id}
                    player={player}
                    exact={isExactMatch(player, query)}
                    onClick={() => setSelected(player)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

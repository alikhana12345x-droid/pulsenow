"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  BarChart3,
  ChevronRight,
  FileText,
  HelpCircle,
  KeyRound,
  LogOut,
  Search,
  User,
  Users,
  Copy,
  Check,
  Pencil,
  Heart,
} from "lucide-react";

import { T } from "@/components/theme";
import { RecordsPanel } from "@/components/profile/records-panel";
import { PaymentsHistoryPanel } from "@/components/profile/payments-history-panel";
import { ProfileEditPanel } from "@/components/profile/profile-edit-panel";
import { InvitePanel } from "@/components/profile/invite-panel";
import { PlayerSearchModal } from "@/components/profile/player-search-modal";
import { ProtectedFinanceProvider, useFinanceDrawer } from "@/components/protected/finance-drawer-provider";
import { FinanceDrawerTrigger } from "@/components/protected/finance-drawer-trigger";

type Panel = null | "records" | "profile" | "invite" | "deposits" | "withdrawals";

/** Health colour bands — the admin Users table uses the same thresholds. */
function healthColor(health: number) {
  if (health > 50) return T.win;
  if (health > 20) return T.accent;
  return T.lose;
}

function HealthBar({ health }: { health: number }) {
  const color = healthColor(health);

  return (
    <div
      style={{
        marginTop: 14,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        borderRadius: T.radius.md,
        background: T.bgCard,
        border: `1px solid ${T.border}`,
      }}
    >
      <Heart size={13} color={color} fill={color} style={{ flexShrink: 0 }} />
      <span style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: 1.5, color: T.textMuted }}>
        Health
      </span>
      <div
        role="progressbar"
        aria-label="Health"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={health}
        style={{
          flex: 1,
          height: 6,
          borderRadius: 999,
          background: "rgba(255,255,255,0.06)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${health}%`,
            height: "100%",
            borderRadius: 999,
            background: color,
            boxShadow: `0 0 8px ${color}66`,
            transition: "width 0.4s ease",
          }}
        />
      </div>
      <span
        style={{
          minWidth: 34,
          textAlign: "right",
          fontFamily: T.monoFont,
          fontSize: 12,
          fontWeight: 800,
          color,
        }}
      >
        {health}%
      </span>
    </div>
  );
}

function CopyBtn({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async (e) => {
        e.stopPropagation();
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
      style={{
        width: 24,
        height: 24,
        borderRadius: 7,
        background: "rgba(255,255,255,0.06)",
        border: `1px solid ${T.border}`,
        color: T.textMuted,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        flexShrink: 0,
        transition: "all 0.15s",
      }}
    >
      {copied ? <Check size={11} color="#5eead4" /> : <Copy size={11} />}
    </button>
  );
}

function MenuItem({
  icon,
  label,
  right,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  right?: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        padding: "11px 12px",
        borderRadius: T.radius.md,
        background: "transparent",
        border: "none",
        cursor: "pointer",
        transition: "background 0.12s",
        textAlign: "left",
      }}
      onMouseEnter={(e) =>
        ((e.currentTarget as HTMLButtonElement).style.background =
          danger ? "rgba(255,93,115,0.06)" : "rgba(255,255,255,0.03)")
      }
      onMouseLeave={(e) =>
        ((e.currentTarget as HTMLButtonElement).style.background = "transparent")
      }
    >
      <span
        style={{
          width: 34,
          height: 34,
          borderRadius: T.radius.sm,
          background: danger ? "rgba(255,93,115,0.1)" : T.bgCard,
          border: `1px solid ${danger ? "rgba(255,93,115,0.2)" : T.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: danger ? "#ff5d73" : T.textSub,
          flexShrink: 0,
        }}
      >
        {icon}
      </span>
      <span
        style={{
          flex: 1,
          fontSize: 12,
          fontWeight: 600,
          color: danger ? "#ff5d73" : T.textPrimary,
          fontFamily: T.uiFont,
        }}
      >
        {label}
      </span>
      {right && <span>{right}</span>}
      <ChevronRight size={12} color={danger ? "rgba(255,93,115,0.4)" : T.textMuted} />
    </button>
  );
}

export interface ProfileClientProps {
  profile?: {
    id?: string;
    username?: string;
    display_name?: string;
    phone?: string;
    email?: string;
    avatar_url?: string;
    referral_code?: string;
    kyc_status?: string;
    health?: number;
    role?: string;
    created_at?: string;
  };
  wallet?: {
    balance: number;
    total_deposited: number;
    total_withdrawn: number;
    total_wagered: number;
    total_won: number;
    isLocked?: boolean;
    currency?: string;
  };
  betSummary?: { totalBets: number };
  referralSummary?: { referralCount: number; totalEarned: string };
  recentReferrals?: Array<{
    totalEarned: string;
    status: string;
    createdAt: string;
  }>;
  signOutAction: () => Promise<void>;
  defaultPanel?: "records" | "profile" | "invite";
}

/**
 * The header balance. The page's own `wallet` prop is only as fresh as the last
 * server render, so this follows the finance provider instead — it reloads the
 * wallet whenever a deposit or withdraw sheet closes and whenever a payout
 * settles — and falls back to the rendered value until that first load lands.
 * Must render inside <ProtectedFinanceProvider>.
 */
function LiveBalance({ fallback, fallbackCurrency }: { fallback: number; fallbackCurrency: string }) {
  const { balance, currency } = useFinanceDrawer();
  return (
    <>
      {balance === null ? fallbackCurrency : currency} {(balance ?? fallback).toLocaleString("en-PK")}
    </>
  );
}

export default function ProfileClient({
  profile,
  wallet,
  betSummary,
  referralSummary,
  recentReferrals = [],
  signOutAction,
  defaultPanel,
}: ProfileClientProps) {
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>(defaultPanel ?? null);
  const [signingOut, setSigningOut] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const balance = wallet?.balance ?? 0;
  const currency = wallet?.currency ?? "PKR";
  const avatarLabel =
    profile?.display_name?.[0]?.toUpperCase() ??
    profile?.username?.[0]?.toUpperCase() ??
    "?";

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOutAction();
  };

  const closePanel = () => setPanel(null);

  // Panels render inside the finance provider so the bottom nav (rendered by
  // the provider) stays visible, and inside a full-height shell so short panels
  // don't collapse to their content height.
  const panelNode =
    panel === "records" ? (
      <RecordsPanel onBack={closePanel} />
    ) : panel === "deposits" ? (
      <PaymentsHistoryPanel kind="deposit" onBack={closePanel} />
    ) : panel === "withdrawals" ? (
      <PaymentsHistoryPanel kind="withdrawal" onBack={closePanel} />
    ) : panel === "profile" ? (
      <ProfileEditPanel
        onBack={closePanel}
        profile={{
          id: profile?.id,
          username: profile?.username,
          display_name: profile?.display_name,
          phone: profile?.phone,
          email: profile?.email,
          avatar_url: profile?.avatar_url,
          created_at: profile?.created_at,
        }}
      />
    ) : panel === "invite" ? (
      <InvitePanel
        onBack={closePanel}
        referralCode={profile?.referral_code}
        recentReferrals={recentReferrals}
      />
    ) : null;

  if (panelNode) {
    return (
      <ProtectedFinanceProvider>
        {/* Pinned to the viewport so the panel never adds document height —
            in flow it could still push the page taller than the screen, which
            let the whole page scroll and dragged the action bar off the nav.
            z-30 keeps it under the bottom nav (z-50) and the finance sheets. */}
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 30,
            display: "flex",
            justifyContent: "center",
            paddingBottom: "calc(64px + env(safe-area-inset-bottom))",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: "100%",
              maxWidth: 600,
              minHeight: 0,
              overflow: "hidden",
              background: T.bg,
              fontFamily: T.uiFont,
            }}
          >
            {panelNode}
          </div>
        </div>
      </ProtectedFinanceProvider>
    );
  }

  return (
    <ProtectedFinanceProvider>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          paddingBottom: "calc(64px + env(safe-area-inset-bottom))",
          background: T.bg,
          minHeight: "100dvh",
          fontFamily: T.uiFont,
        }}
      >
        {/* Header */}
        <div
          style={{
            paddingTop: "max(20px, env(safe-area-inset-top))",
            paddingRight: 16,
            paddingBottom: 16,
            paddingLeft: 16,
            background: `radial-gradient(circle at top right, rgba(242,154,11,0.16), transparent 40%),
                       linear-gradient(180deg, #0d0b1e 0%, ${T.bg} 100%)`,
            borderBottom: `1px solid ${T.border}`,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ position: "relative" }}>
                {profile?.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt="avatar"
                    style={{
                      width: 50,
                      height: 50,
                      borderRadius: T.radius.md,
                      border: `1px solid ${T.border}`,
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: 50,
                      height: 50,
                      borderRadius: T.radius.md,
                      border: `1px solid rgba(242,154,11,0.3)`,
                      background: "rgba(242,154,11,0.1)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: T.monoFont,
                      fontSize: 20,
                      fontWeight: 900,
                      color: T.accent,
                    }}
                  >
                    {avatarLabel}
                  </div>
                )}
                <div
                  style={{
                    position: "absolute",
                    bottom: -5,
                    right: -5,
                    padding: "1px 5px",
                    borderRadius: 5,
                    background: T.bg,
                    border: `1px solid rgba(242,154,11,0.5)`,
                    fontFamily: T.monoFont,
                    fontSize: 8,
                    fontWeight: 900,
                    color: T.accent,
                    lineHeight: "14px",
                  }}
                >
                  V0
                </div>
              </div>

              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 800,
                      color: T.textPrimary,
                      letterSpacing: -0.2,
                    }}
                  >
                    {profile?.display_name || profile?.username || "—"}
                  </span>
                  {profile?.username && <CopyBtn value={profile.username} />}
                  <button
                    onClick={() => setPanel("profile")}
                    aria-label="Edit profile"
                    title="Edit profile"
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 7,
                      background: "rgba(242,154,11,0.12)",
                      border: `1px solid ${T.accentBorder}`,
                      color: T.accent,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      flexShrink: 0,
                      transition: "all 0.15s",
                    }}
                  >
                    <Pencil size={11} />
                  </button>
                </div>
                <div style={{ marginTop: 3, display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ fontSize: 10, color: T.textMuted }}>
                    ID: {profile?.id?.slice(0, 9) ?? "—"}
                  </span>
                  {profile?.id && <CopyBtn value={profile.id} />}
                </div>
              </div>
            </div>

            <div style={{ textAlign: "right" }}>
              <p style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: 1.5, color: T.textMuted }}>
                Balance
              </p>
              <p
                style={{
                  marginTop: 3,
                  fontFamily: T.monoFont,
                  fontSize: 14,
                  fontWeight: 800,
                  color: T.accent,
                }}
              >
                <LiveBalance fallback={balance} fallbackCurrency={currency} />
              </p>
            </div>
          </div>

          <HealthBar health={profile?.health ?? 50} />

          {/* Quick actions — tucked under the health bar so the cards read as one group */}
          <div
            style={{
              marginTop: 8,
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 8,
            }}
          >
            {(
              [
                { icon: <ArrowUpFromLine size={15} />, label: "Withdraw", financeTrigger: "withdraw" as const },
                { icon: <ArrowDownToLine size={15} />, label: "Deposit", financeTrigger: "deposit" as const },
                { icon: <BarChart3 size={15} />, label: "Records", action: () => setPanel("records") },
              ] as const
            ).map((btn) => {
              if ("financeTrigger" in btn) {
                return (
                  <FinanceDrawerTrigger key={btn.label} action={btn.financeTrigger} className="w-full">
                    <p
                      style={{
                        width: "100%",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 6,
                        padding: "11px 0",
                        borderRadius: T.radius.md,
                        background: T.bgCard,
                        border: `1px solid ${T.border}`,
                        color: T.textSub,
                        cursor: "pointer",
                        transition: "border-color 0.15s, color 0.15s",
                      }}
                    >
                      {btn.icon}
                      <span style={{ fontSize: 10, fontWeight: 600 }}>{btn.label}</span>
                    </p>
                  </FinanceDrawerTrigger>
                );
              }
              return (
                <button
                  key={btn.label}
                  onClick={btn.action}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 6,
                    padding: "11px 0",
                    borderRadius: T.radius.md,
                    background: T.bgCard,
                    border: `1px solid ${T.border}`,
                    color: T.textSub,
                    cursor: "pointer",
                    transition: "border-color 0.15s, color 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = T.accentBorder;
                    (e.currentTarget as HTMLButtonElement).style.color = T.accent;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = T.border;
                    (e.currentTarget as HTMLButtonElement).style.color = T.textSub;
                  }}
                >
                  {btn.icon}
                  <span style={{ fontSize: 10, fontWeight: 600 }}>{btn.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Stats row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 1,
            background: T.border,
            borderBottom: `1px solid ${T.border}`,
          }}
        >
          {[
            { label: "Total Bets", value: String(betSummary?.totalBets ?? 0) },
            { label: "Referrals", value: String(referralSummary?.referralCount ?? 0) },
            {
              label: "Earned",
              value: `Rs ${Number(referralSummary?.totalEarned ?? 0).toLocaleString()}`,
            },
          ].map((stat) => (
            <div
              key={stat.label}
              style={{ background: T.bgMid, padding: "10px 0", textAlign: "center" }}
            >
              <p
                style={{
                  fontFamily: T.monoFont,
                  fontSize: 14,
                  fontWeight: 800,
                  color: T.textPrimary,
                }}
              >
                {stat.value}
              </p>
              <p
                style={{
                  marginTop: 2,
                  fontSize: 9,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  color: T.textMuted,
                }}
              >
                {stat.label}
              </p>
            </div>
          ))}
        </div>

        {/* Menu */}
        <div style={{ padding: "8px 12px", flex: 1 }}>
          <MenuItem
            icon={<FileText size={15} />}
            label="My records"
            right={
              <span style={{ fontSize: 9, color: T.textMuted }}>Details, bets, reports</span>
            }
            onClick={() => setPanel("records")}
          />
          <MenuItem
            icon={<ArrowDownToLine size={15} />}
            label="Manage deposit"
            right={<span style={{ fontSize: 9, color: T.textMuted }}>History & status</span>}
            onClick={() => setPanel("deposits")}
          />
          <MenuItem
            icon={<ArrowUpFromLine size={15} />}
            label="Manage withdrawal"
            right={<span style={{ fontSize: 9, color: T.textMuted }}>History & status</span>}
            onClick={() => setPanel("withdrawals")}
          />

          <div style={{ margin: "4px 0", height: 1, background: T.border }} />

          <MenuItem
            icon={<Users size={15} />}
            label="Invite"
            right={
              <span
                style={{
                  fontFamily: T.monoFont,
                  fontSize: 11,
                  fontWeight: 800,
                  color: T.accent,
                }}
              >
                Get Rs 600
              </span>
            }
            onClick={() => setPanel("invite")}
          />
          <MenuItem icon={<User size={15} />} label="Profile" onClick={() => setPanel("profile")} />

          <div style={{ margin: "4px 0", height: 1, background: T.border }} />

          <MenuItem
            icon={<Search size={15} />}
            label="Search Player"
            right={<span style={{ fontSize: 9, color: T.textMuted }}>By username or ID</span>}
            onClick={() => setSearchOpen(true)}
          />
          <MenuItem
            icon={<HelpCircle size={15} />}
            label="FAQ"
            right={<span style={{ fontSize: 9, color: T.textMuted }}>Help & support</span>}
            onClick={() => router.push("/protected/support#faq")}
          />

          <div style={{ margin: "4px 0", height: 1, background: T.border }} />

          <MenuItem
            icon={<KeyRound size={15} />}
            label="Change password"
            right={
              <span style={{ fontSize: 9, color: T.textMuted }}>Refresh credentials</span>
            }
            onClick={() => router.push("/auth/update-password")}
          />

          <MenuItem
            icon={<LogOut size={15} />}
            label={signingOut ? "Signing out…" : "Sign out"}
            onClick={handleSignOut}
            danger
          />
        </div>
      </div>

      {searchOpen && <PlayerSearchModal onClose={() => setSearchOpen(false)} />}
    </ProtectedFinanceProvider>
  );
}

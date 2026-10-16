"use client";

import { useState } from "react";
import { Copy, Check, Users, ChevronRight } from "lucide-react";
import { PanelHeader } from "./panel-header";
import { T, shade } from "./../theme";

interface InvitePanelProps {
    onBack: () => void;
    referralCode?: string;
    recentReferrals?: Array<{
        totalEarned: string;
        status: string;
        createdAt: string;
    }>;
}

export function InvitePanel({ onBack, referralCode, recentReferrals = [] }: InvitePanelProps) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        if (!referralCode) return;
        await navigator.clipboard.writeText(referralCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
    };

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
            <PanelHeader title="Invite Friends" onBack={onBack} />

            <div
                style={{
                    flex: 1,
                    minHeight: 0,
                    overflowY: "auto",
                    padding: "16px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 14,
                }}
            >
                {/* Hero reward card */}
                <div
                    style={{
                        padding: "20px 16px",
                        borderRadius: T.radius.xl,
                        background: `radial-gradient(circle at top right, rgba(242,154,11,0.22), transparent 40%),
                         linear-gradient(160deg, rgba(20,14,36,0.98), rgba(9,7,20,0.96))`,
                        border: `1px solid rgba(242,154,11,0.25)`,
                        textAlign: "center",
                    }}
                >
                    <div
                        style={{
                            width: 44,
                            height: 44,
                            borderRadius: T.radius.md,
                            background: T.accentDim,
                            border: `1px solid ${T.accentBorder}`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            margin: "0 auto 10px",
                        }}
                    >
                        <Users size={20} color={T.accent} />
                    </div>
                    <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 2, color: T.textMuted }}>
                        Earn per referral
                    </p>
                    <p
                        style={{
                            marginTop: 4,
                            fontFamily: T.monoFont,
                            fontSize: 30,
                            fontWeight: 900,
                            color: T.accent,
                            letterSpacing: -1,
                        }}
                    >
                        Rs 600
                    </p>
                    <p style={{ marginTop: 6, fontSize: 10, color: T.textMuted, lineHeight: 1.6 }}>
                        Share your code and earn every time a friend deposits and bets.
                    </p>
                </div>

                {/* Referral code */}
                <div>
                    <p
                        style={{
                            marginBottom: 8,
                            fontSize: 10,
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: 1.2,
                            color: T.textSub,
                        }}
                    >
                        Your referral code
                    </p>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <div
                            style={{
                                flex: 1,
                                padding: "12px 16px",
                                borderRadius: T.radius.md,
                                background: T.bgCard,
                                border: `1px solid ${T.border}`,
                                fontFamily: T.monoFont,
                                fontSize: 14,
                                fontWeight: 700,
                                letterSpacing: 3,
                                color: T.textPrimary,
                            }}
                        >
                            {referralCode ?? "————————"}
                        </div>
                        <button
                            onClick={handleCopy}
                            disabled={!referralCode}
                            style={{
                                width: 44,
                                height: 44,
                                borderRadius: T.radius.md,
                                background: copied ? `rgba(94,234,212,0.12)` : T.accentDim,
                                border: `1px solid ${copied ? "rgba(94,234,212,0.4)" : T.accentBorder}`,
                                color: copied ? "#5eead4" : T.accent,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                cursor: referralCode ? "pointer" : "default",
                                flexShrink: 0,
                                transition: "all 0.15s",
                            }}
                        >
                            {copied ? <Check size={16} /> : <Copy size={16} />}
                        </button>
                    </div>
                </div>

                {/* Go to invite page */}
                <a
                    href="/protected/invite"
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "13px 16px",
                        borderRadius: T.radius.md,
                        background: `linear-gradient(180deg, ${T.accent} 0%, ${shade(T.accent, -15)} 100%)`,
                        textDecoration: "none",
                        boxShadow: `0 4px 14px rgba(242,154,11,0.35)`,
                    }}
                >
                    <span style={{ fontSize: 12, fontWeight: 900, color: "#000" }}>
                        Open invite page
                    </span>
                    <ChevronRight size={14} color="rgba(0,0,0,0.6)" />
                </a>

                {/* Recent referrals */}
                <div>
                    <p
                        style={{
                            marginBottom: 8,
                            fontSize: 10,
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: 1.2,
                            color: T.textSub,
                        }}
                    >
                        Recent referrals
                    </p>

                    {recentReferrals.length === 0 ? (
                        <div
                            style={{
                                padding: "20px 16px",
                                borderRadius: T.radius.md,
                                background: T.bgCard,
                                border: `1px dashed ${T.border}`,
                                textAlign: "center",
                                fontSize: 11,
                                color: T.textMuted,
                            }}
                        >
                            No referrals yet. Share your code to start earning!
                        </div>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {recentReferrals.map((item, i) => (
                                <div
                                    key={`${item.createdAt}-${i}`}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        padding: "12px 16px",
                                        borderRadius: T.radius.md,
                                        background: T.bgCard,
                                        border: `1px solid ${T.border}`,
                                    }}
                                >
                                    <div>
                                        <p style={{ fontSize: 12, fontWeight: 700, color: T.textPrimary }}>
                                            Referral #{i + 1}
                                        </p>
                                        <p style={{ marginTop: 2, fontSize: 10, color: T.textMuted }}>
                                            {new Date(item.createdAt).toLocaleDateString()}
                                        </p>
                                    </div>
                                    <div style={{ textAlign: "right" }}>
                                        <p
                                            style={{
                                                fontFamily: T.monoFont,
                                                fontSize: 12,
                                                fontWeight: 700,
                                                color: T.accent,
                                            }}
                                        >
                                            PKR {Number(item.totalEarned).toLocaleString("en-PK")}
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
                                            {item.status}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
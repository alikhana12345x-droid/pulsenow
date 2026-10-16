"use client";

import { ArrowLeft } from "lucide-react";
import { T } from "../theme";

interface PanelHeaderProps {
    title: string;
    onBack: () => void;
}

export function PanelHeader({ title, onBack }: PanelHeaderProps) {
    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "14px 16px",
                borderBottom: `1px solid ${T.border}`,
                background: `linear-gradient(180deg, #0d0b1e 0%, ${T.bg} 100%)`,
                position: "sticky",
                top: 0,
                zIndex: 10,
                flexShrink: 0,
            }}
        >
            <button
                onClick={onBack}
                style={{
                    width: 36,
                    height: 36,
                    borderRadius: T.radius.md,
                    background: T.bgCard,
                    border: `1px solid ${T.border}`,
                    color: T.textSub,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    flexShrink: 0,
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
                <ArrowLeft size={15} />
            </button>
            <span
                style={{
                    fontFamily: T.uiFont,
                    fontSize: 14,
                    fontWeight: 700,
                    color: T.textPrimary,
                    letterSpacing: 0.2,
                }}
            >
                {title}
            </span>
        </div>
    );
}
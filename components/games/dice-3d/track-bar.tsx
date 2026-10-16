// components/games/TrackBar.tsx
"use client";

import React from "react";

export function hexToRgb(hex: string): string {
    const h = hex.replace("#", "");
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `${r},${g},${b}`;
}

interface TrackBarProps {
    side: "over" | "under";
    target: number;
    rollPercent: number | null;
    lastResult: { roll: number; won: boolean } | null;
    accent?: string;
}

export function TrackBar({
    side,
    target,
    rollPercent,
    lastResult,
    accent = "#7c5cff",
}: TrackBarProps) {
    const accentRgb = hexToRgb(accent);

    const winZoneStyle: React.CSSProperties =
        side === "over"
            ? { left: `${target}%`, right: 0 }
            : { left: 0, width: `${target}%` };

    const markerColor =
        lastResult == null
            ? "#f4f1ff"
            : lastResult.won
                ? "#5eead4"
                : "#ff5d73";

    const markerGlow =
        lastResult == null
            ? "0 0 0 rgba(0,0,0,0)"
            : lastResult.won
                ? "0 0 20px rgba(94,234,212,0.8), 0 0 40px rgba(94,234,212,0.4)"
                : "0 0 20px rgba(255,93,115,0.8), 0 0 40px rgba(255,93,115,0.4)";

    return (
        <div style={{ width: "100%" }}>
            <div
                style={{
                    position: "relative",
                    height: 30,
                    borderRadius: 999,
                    background: "linear-gradient(180deg, #13111c 0%, #1b1828 100%)",
                    boxShadow:
                        "inset 0 2px 4px rgba(0,0,0,0.6), inset 0 -1px 0 rgba(255,255,255,0.04), 0 1px 0 rgba(255,255,255,0.03)",
                    overflow: "visible",
                }}
            >
                {/* Inner track */}
                <div
                    style={{
                        position: "absolute",
                        inset: 2,
                        borderRadius: 999,
                        overflow: "hidden",
                    }}
                >
                    {/* Win zone */}
                    <div
                        style={{
                            position: "absolute",
                            top: 0,
                            bottom: 0,
                            background: `linear-gradient(180deg, rgba(${accentRgb},0.35) 0%, rgba(${accentRgb},0.18) 100%)`,
                            boxShadow: `inset 0 0 0 1px rgba(${accentRgb},0.4)`,
                            transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                            ...winZoneStyle,
                        }}
                    />
                    {/* Tick marks every 10 */}
                    {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((t) => (
                        <div
                            key={t}
                            style={{
                                position: "absolute",
                                top: "50%",
                                transform: "translate(-50%, -50%)",
                                left: `${t}%`,
                                width: 2,
                                height: 15,
                                background: "rgba(255,255,255,0.08)",
                                pointerEvents: "none",
                            }}
                        />
                    ))}
                </div>

                {/* Target line */}
                <div
                    style={{
                        position: "absolute",
                        top: -4,
                        bottom: -4,
                        width: 3,
                        left: `${target}%`,
                        transform: "translateX(-50%)",
                        background: accent,
                        borderRadius: 2,
                        boxShadow: `0 0 8px ${accent}, 0 0 2px #fff inset`,
                        zIndex: 5,
                        transition: "left 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                    }}
                />

                {/* Roll marker */}
                {rollPercent !== null && rollPercent !== undefined && (
                    <div
                        style={{
                            position: "absolute",
                            top: "50%",
                            left: `${rollPercent}%`,
                            transform: "translate(-50%, -50%)",
                            width: 28,
                            height: 28,
                            borderRadius: "50%",
                            background: `radial-gradient(circle at 35% 30%, #ffffff 0%, ${markerColor} 60%, ${markerColor} 100%)`,
                            boxShadow: `
                inset 0 -2px 3px rgba(0,0,0,0.25),
                inset 0 2px 2px rgba(255,255,255,0.6),
                0 2px 6px rgba(0,0,0,0.5),
                ${markerGlow}
              `,
                            border: "2px solid rgba(255,255,255,0.2)",
                            zIndex: 10,
                            transition: lastResult
                                ? "background 0.15s, box-shadow 0.3s"
                                : "none",
                        }}
                    />
                )}
            </div>

            {/* Scale labels */}
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontFamily: "JetBrains Mono, monospace",
                    fontSize: 16,
                    color: "rgba(255,255,255,0.35)",
                    marginTop: 8,
                    letterSpacing: 0.5,
                }}
            >
                {["0", "25", "50", "75", "99"].map((n) => (
                    <span key={n}>{n}</span>
                ))}
            </div>
        </div>
    );
}
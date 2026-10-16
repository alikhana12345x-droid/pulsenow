// ─── Shared theme tokens matching the game (Dice3D) aesthetic ────────────────
// Background:  #090714  →  #0d0b1e  (same as Dice3DGame)
// Accent:      #f29a0b  (amber — same as ACCENT in dice)
// Font:        JetBrains Mono for numbers, system-ui for labels
// Glass:       rgba(255,255,255,0.03) + border rgba(255,255,255,0.06)

export const T = {
    bg: "#090714",
    bgMid: "#0d0b1e",
    bgCard: "rgba(255,255,255,0.03)",
    border: "rgba(255,255,255,0.06)",
    borderHover: "rgba(242,154,11,0.35)",
    accent: "#f29a0b",
    accentDim: "rgba(242,154,11,0.15)",
    accentBorder: "rgba(242,154,11,0.4)",
    win: "#5eead4",
    lose: "#ff5d73",
    textPrimary: "#f4f1ff",
    textSub: "rgba(255,255,255,0.45)",
    textMuted: "rgba(255,255,255,0.28)",
    monoFont: "'JetBrains Mono', 'Fira Code', monospace",
    uiFont: "Inter, system-ui, sans-serif",
    radius: {
        sm: 10,
        md: 14,
        lg: 18,
        xl: 22,
    },
} as const;

export function shade(hex: string, amount: number): string {
    const h = hex.replace("#", "");
    const num = parseInt(h, 16);
    const r = Math.max(0, Math.min(255, (num >> 16) + amount));
    const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + amount));
    const b = Math.max(0, Math.min(255, (num & 0xff) + amount));
    return "#" + ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0");
}
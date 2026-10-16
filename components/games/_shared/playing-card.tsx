// Shared programmatic playing-card rendering — used by Hi-Lo and Andar Bahar.
// Cards are rendered from data ({ rank, suit }), so NO image assets are needed.
// Extracted verbatim from the original Hi-Lo implementation.

export type SuitId = "spade" | "heart" | "diamond" | "club";
export type Card = { rank: number; suit: number };

export const SUITS: { id: SuitId; color: string; glyph: string }[] = [
    { id: "spade", color: "#1a1629", glyph: "♠" },
    { id: "heart", color: "#e02b4a", glyph: "♥" },
    { id: "diamond", color: "#e87a17", glyph: "♦" },
    { id: "club", color: "#1a1629", glyph: "♣" },
];

export const RANK_LABEL = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

export function CornerPip({ card, flipped = false }: { card: Card; flipped?: boolean }) {
    const suit = SUITS[card.suit];
    return (
        <div
            className={`absolute flex flex-col items-center gap-0.5 font-bp-mono font-black leading-none ${flipped ? "bottom-3 right-3 rotate-180" : "left-3 top-3"}`}
            style={{ color: suit.color }}
        >
            <span className="text-lg sm:text-xl">{RANK_LABEL[card.rank]}</span>
            <span className="text-lg sm:text-xl">{suit.glyph}</span>
        </div>
    );
}

export function PlayingCard({ card, label, glow = false, small = false }: { card: Card; label?: string; glow?: boolean; small?: boolean }) {
    const suit = SUITS[card.suit];
    return (
        <div
            className={`relative overflow-hidden rounded-[18px] bg-gradient-to-b from-white to-[#f2ece2] transition-all duration-300 ${small ? "h-[76px] w-[54px] rounded-xl" : "h-[238px] w-[170px] sm:h-[270px] sm:w-[194px]"}`}
            style={{
                boxShadow: glow
                    ? "0 24px 70px rgba(242,154,11,.34), 0 8px 24px rgba(0,0,0,.55), inset 0 0 0 1px rgba(255,255,255,.65)"
                    : "0 18px 44px rgba(0,0,0,.58), inset 0 0 0 1px rgba(255,255,255,.55)",
            }}
        >
            <div className="pointer-events-none absolute inset-1.5 rounded-[14px] border border-black/[0.06]" />
            {!small && <CornerPip card={card} />}
            {!small && <CornerPip card={card} flipped />}
            {label && !small && (
                <div className="absolute left-1/2 top-2 -translate-x-1/2 text-[9px] font-black uppercase tracking-[.24em] text-black/35">
                    {label}
                </div>
            )}
            <div className="absolute inset-0 flex flex-col items-center justify-center font-bp-mono" style={{ color: suit.color }}>
                <div className={`${small ? "text-xl" : "text-[78px] sm:text-[88px]"} font-black leading-none tracking-[-.06em]`}>
                    {RANK_LABEL[card.rank]}
                </div>
                <div className={`${small ? "text-lg" : "-mt-2 text-[54px] sm:text-[62px]"} leading-none`}>{suit.glyph}</div>
            </div>
        </div>
    );
}

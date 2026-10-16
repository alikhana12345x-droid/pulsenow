"use client";

import { ctaLabelFromAction } from "@/lib/use-promo-cta";

export type PromotionData = {
  id: string;
  title: string;
  content?: string | null;
  image_url?: string | null;
  bg_color?: string | null;
  type: string;
  show_frequency?: string;
  // CTA — resolved externally (BannerSlider / LobbyPromotionToasts / etc.)
  // and passed in as onCtaClick. Cards are presentational only.
  cta_action?: string | null;
  cta_label?: string | null;
};

// ─── Banner ───────────────────────────────────────────────────────────────────
// Full-bleed image (object-right) with left-gradient text shield.
//
// variant="standalone" — card owns border + rounding.
// variant="inSlider"   — border/rounding stripped; slider container owns them.
//
// onCtaClick — when provided, whole card is clickable + amber CTA button shown.
// Button label is derived from promo.cta_label then promo.cta_action.

export function PromotionBannerCard({
  promo,
  onCtaClick,
  variant = "standalone",
}: {
  promo: PromotionData;
  onCtaClick?: () => void;
  variant?: "standalone" | "inSlider";
}) {
  const bg = promo.bg_color ?? "#0d0b1e";
  const label = ctaLabelFromAction(promo.cta_action, promo.cta_label);

  return (
    <div
      className={[
        "relative min-h-[190px] overflow-hidden p-5",
        variant === "standalone" ? "rounded-[24px] border border-white/[0.08]" : "",
        onCtaClick ? "cursor-pointer" : "",
      ].join(" ")}
      style={{ backgroundColor: bg }}
      onClick={onCtaClick}
    >
      {promo.image_url ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={promo.image_url}
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-right"
          />
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(to right, ${bg} 25%, ${bg}cc 48%, ${bg}55 68%, transparent 88%)`,
            }}
          />
        </>
      ) : (
        <div className="pointer-events-none absolute -right-2 top-0 select-none text-[80px] font-black leading-none text-white/[0.04]">
          ★
        </div>
      )}

      <div className="relative z-10">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-bp-accent/35 bg-bp-accent/10 px-2.5 py-1 font-bp-mono text-[10px] font-bold uppercase tracking-widest text-bp-accent">
          <span className="h-1.5 w-1.5 rounded-full bg-bp-accent" />
          Promo
        </span>

        <h2 className="mt-3 max-w-[62%] text-[20px] font-black leading-tight tracking-tight text-bp-text">
          {promo.title}
        </h2>

        {promo.content && (
          <p className="mt-1.5 max-w-[58%] text-[12px] leading-relaxed text-white/50">
            {promo.content}
          </p>
        )}

        {onCtaClick && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onCtaClick(); }}
            className="mt-4 inline-flex items-center rounded-[10px] bg-bp-accent px-4 py-2 text-[12px] font-black text-[#1b1305] shadow-[0_4px_16px_rgba(242,154,11,0.4)] transition-all hover:opacity-90 active:scale-[0.97]"
          >
            {label}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────
// Compact notification-style card. Icon left, title + content centre,
// optional CTA button right.

export function PromotionToastCard({
  promo,
  onCtaClick,
}: {
  promo: PromotionData;
  onCtaClick?: () => void;
}) {
  const label = ctaLabelFromAction(promo.cta_action, promo.cta_label, true);

  return (
    <div
      className="flex items-center gap-3 overflow-hidden rounded-[20px] border border-white/[0.08] px-4 py-3"
      style={{ backgroundColor: promo.bg_color ?? "#0d0b1e" }}
    >
      {promo.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={promo.image_url} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover" />
      )}

      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-bp-text">{promo.title}</p>
        {promo.content && (
          <p className="mt-0.5 text-[11px] leading-relaxed text-white/50 truncate">{promo.content}</p>
        )}
      </div>

      {onCtaClick && (
        <button
          type="button"
          onClick={onCtaClick}
          className="shrink-0 rounded-[8px] bg-bp-accent/15 border border-bp-accent/30 px-2.5 py-1.5 text-[11px] font-bold text-bp-accent transition-all hover:bg-bp-accent/25 active:scale-[0.97] whitespace-nowrap"
        >
          {label}
        </button>
      )}
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────
// Rich overlay card. Image flushes to top edge; text + optional CTA in body.

export function PromotionModalCard({
  promo,
  onCtaClick,
}: {
  promo: PromotionData;
  onCtaClick?: () => void;
}) {
  const label = ctaLabelFromAction(promo.cta_action, promo.cta_label);

  return (
    <div
      className="w-full overflow-hidden rounded-[24px] border border-white/[0.08] shadow-2xl"
      style={{ backgroundColor: promo.bg_color ?? "#0d0b1e" }}
    >
      {promo.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={promo.image_url} alt="" className="h-40 w-full object-cover" />
      )}
      <div className="p-6">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-bp-accent/35 bg-bp-accent/10 px-2.5 py-1 font-bp-mono text-[10px] font-bold uppercase tracking-widest text-bp-accent">
          <span className="h-1.5 w-1.5 rounded-full bg-bp-accent" />
          Promo
        </span>
        <h2 className="mt-3 text-[22px] font-black leading-tight tracking-tight text-bp-text">
          {promo.title}
        </h2>
        {promo.content && (
          <p className="mt-2 text-[13px] leading-relaxed text-white/50">{promo.content}</p>
        )}
        {onCtaClick && (
          <button
            type="button"
            onClick={onCtaClick}
            className="mt-5 w-full rounded-[12px] bg-bp-accent py-3 text-[13px] font-black text-[#1b1305] shadow-[0_4px_16px_rgba(242,154,11,0.4)] transition-all hover:opacity-90 active:scale-[0.98]"
          >
            {label}
          </button>
        )}
      </div>
    </div>
  );
}

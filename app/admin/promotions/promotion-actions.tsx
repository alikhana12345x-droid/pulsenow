"use client";

import { useState, useRef, type FormEvent } from "react";
import { ctaLabelFromAction } from "@/lib/use-promo-cta";
import {
  createPromotion,
  updatePromotion,
  deletePromotion,
  togglePromotion,
  addPromotionPlayer,
  updatePromotionPlayer,
  togglePromotionPlayer,
  removePromotionPlayer,
  findUserByUsername,
  type CreatePromotionInput,
} from "@/lib/actions/promotions";
import type { getPromotions } from "@/lib/actions/promotions";
import {
  PromotionBannerCard,
  PromotionToastCard,
  PromotionModalCard,
} from "@/components/promotions/promotion-cards";

// ─── Promotion defaults type (shared between templates and edit form) ─────────

type PromotionDefaults = {
  title?: string;
  description?: string | null;
  type?: string;
  show_frequency?: string;
  image_url?: string | null;
  content?: string | null;
  bg_color?: string | null;
  cta_action?: string | null;
  cta_label?: string | null;
};

// ─── Templates ────────────────────────────────────────────────────────────────

type TemplateCategory = "games" | "deposits" | "retention" | "custom";

interface Template {
  id: string;
  name: string;
  useCase: string;
  category: TemplateCategory;
  defaults: PromotionDefaults;
}

const TYPE_META: Record<string, { border: string; badge: string; label: string }> = {
  toast: { border: "border-l-blue-500", badge: "bg-blue-500/15 text-blue-400", label: "Toast" },
  modal: { border: "border-l-purple-500", badge: "bg-purple-500/15 text-purple-400", label: "Modal" },
  banner: { border: "border-l-yellow-500", badge: "bg-yellow-500/15 text-yellow-400", label: "Banner" },
};

// Brand promotion assets
const IMGS = {
  // Generic promo assets (svg)
  banner_welcome:  "/brand/promotions/promo-banner-welcome.svg",
  banner_deposit:  "/brand/promotions/promo-banner-deposit.svg",
  icon_cashback:   "/brand/promotions/promo-icon-cashback.svg",
  icon_referral:   "/brand/promotions/promo-icon-referral.svg",
  modal_newgame:   "/brand/promotions/promo-modal-newgame.svg",
  modal_bigwin:    "/brand/promotions/promo-modal-bigwin.svg",
  modal_vip:       "/brand/promotions/promo-modal-vip.svg",
  // Per-game banner art (png — 3:1, art on right, left dark for text)
  game_dice:       "/brand/promotions/games/dice-roll.png",
  game_skyrise:    "/brand/promotions/games/sky-rise.png",
  game_coinflip:   "/brand/promotions/games/coin-flip.png",
  game_hilo:       "/brand/promotions/games/cards.png",
  game_mines:      "/brand/promotions/games/mines.png",
} as const;

const TEMPLATES: Template[] = [
  // ── Games ─────────────────────────────────────────────────────────────────
  {
    id: "game_skyrise",
    name: "SkyRise",
    useCase: "Crash game · cash out before it crashes",
    category: "games",
    defaults: {
      title: "SkyRise — Watch It Climb, Cash Out in Time",
      description: "Crash game launch banner",
      content: "A multiplier that never stops climbing — until it crashes. Place your bet, ride the surge, and cash out before it's gone. Every round is unique. Provably fair.",
      type: "banner",
      show_frequency: "once",
      bg_color: "#0e0c1f",
      image_url: IMGS.game_skyrise,
      cta_action: "game:skyrise",
    },
  },
  {
    id: "game_dice",
    name: "Dice 3D",
    useCase: "Predict over/under · up to 9900×",
    category: "games",
    defaults: {
      title: "Dice 3D — Roll Over or Under, Win Big",
      description: "Dice game launch banner",
      content: "Set your target, pick over or under, and watch the dice fall. Win probability from 1% to 98%. Up to 9,900× payout. Fully provably fair.",
      type: "banner",
      show_frequency: "once",
      bg_color: "#0a0812",
      image_url: IMGS.game_dice,
      cta_action: "game:dice-3d",
    },
  },
  {
    id: "game_coinflip",
    name: "Coin Flip",
    useCase: "Pure 50/50 · 1.96× payout",
    category: "games",
    defaults: {
      title: "Coin Flip — Heads or Tails, Instant Win",
      description: "Coin flip game launch banner",
      content: "The simplest game on the platform. One flip, one outcome. Pick heads or tails and win 1.96× your stake. No skill needed — pure chance, instant result.",
      type: "banner",
      show_frequency: "once",
      bg_color: "#120a00",
      image_url: IMGS.game_coinflip,
      cta_action: "game:coinflip",
    },
  },
  {
    id: "game_hilo",
    name: "Hi-Lo Cards",
    useCase: "Read the deck · build streak up to 49.5×",
    category: "games",
    defaults: {
      title: "Hi-Lo — Read the Deck, Build Your Streak",
      description: "Hi-Lo card game launch banner",
      content: "A fresh card is dealt each round. Predict higher or lower to grow your multiplier — up to 49.50×. Cash out any time or push your luck to the next card.",
      type: "banner",
      show_frequency: "once",
      bg_color: "#0d0b1e",
      image_url: IMGS.game_hilo,
      cta_action: "game:hi-lo",
    },
  },
  {
    id: "game_mines",
    name: "Mines",
    useCase: "5×5 grid · find gems, dodge mines",
    category: "games",
    defaults: {
      title: "Mines — One Wrong Step Ends It All",
      description: "Mines game launch banner",
      content: "A 5×5 grid hides gems and mines. Click safe tiles to multiply your stake. Hit a mine and lose everything. Cash out before your luck runs out.",
      type: "banner",
      show_frequency: "once",
      bg_color: "#0a0812",
      image_url: IMGS.game_mines,
      cta_action: "game:mines",
    },
  },
  {
    id: "new_game",
    name: "New Game Launch",
    useCase: "General announce — modal, show once",
    category: "games",
    defaults: {
      title: "New Game Just Dropped",
      description: "Generic new game modal announcement",
      content: "A brand new game is live on PulseNow. Try it now and discover a fresh way to win big. Provably fair, instant payouts.",
      type: "modal",
      show_frequency: "once",
      bg_color: "#0a0d1e",
      image_url: IMGS.modal_newgame,
      cta_action: "game:skyrise",
    },
  },
  // ── Deposits ──────────────────────────────────────────────────────────────
  {
    id: "welcome_bonus",
    name: "Welcome Bonus",
    useCase: "First deposit match · show once to new players",
    category: "deposits",
    defaults: {
      title: "100% Match on Your First Deposit",
      description: "First deposit bonus banner",
      content: "Deposit now and we'll double it instantly. No wagering requirement. Play any game on the platform.",
      type: "banner",
      show_frequency: "once",
      bg_color: "#180e02",
      image_url: IMGS.banner_welcome,
      cta_action: "deposit",
    },
  },
  {
    id: "deposit_offer",
    name: "Deposit Offer",
    useCase: "Limited-time bonus on a deposit amount",
    category: "deposits",
    defaults: {
      title: "Deposit PKR 5,000 — Play with 7,000",
      description: "Deposit amount bonus banner",
      content: "Limited time offer. Deposit PKR 5,000 and your balance is credited at PKR 7,000 — a 40% bonus, instantly applied.",
      type: "banner",
      show_frequency: "daily",
      bg_color: "#140c00",
      image_url: IMGS.banner_deposit,
      cta_action: "deposit",
    },
  },
  // ── Retention ─────────────────────────────────────────────────────────────
  {
    id: "weekend_cashback",
    name: "Weekend Cashback",
    useCase: "Daily toast · re-engage with cashback",
    category: "retention",
    defaults: {
      title: "20% Cashback This Weekend",
      description: "Weekend cashback toast",
      content: "Had a rough week? We've got you. Claim 20% cashback on all losses every Saturday — automatically credited to your wallet.",
      type: "toast",
      show_frequency: "daily",
      bg_color: "#0d0b1e",
      image_url: IMGS.icon_cashback,
      cta_action: "deposit",
    },
  },
  {
    id: "refer_friend",
    name: "Refer a Friend",
    useCase: "Always-on toast · viral referral growth",
    category: "retention",
    defaults: {
      title: "Invite Friends, Earn 5% Forever",
      description: "Referral program toast",
      content: "Share your referral code and earn a 5% lifetime commission on every bet your friends place — paid out instantly.",
      type: "toast",
      show_frequency: "always",
      bg_color: "#0d0b1e",
      image_url: IMGS.icon_referral,
      cta_action: null,
    },
  },
  {
    id: "big_win",
    name: "Big Win Alert",
    useCase: "Daily modal · social proof FOMO",
    category: "retention",
    defaults: {
      title: "Someone Just Won Big!",
      description: "Social proof win alert modal",
      content: "A player just hit a massive win on SkyRise. Could you be next? Every round is a fresh chance to multiply your balance.",
      type: "modal",
      show_frequency: "daily",
      bg_color: "#0d0b1e",
      image_url: IMGS.modal_bigwin,
      cta_action: "game:skyrise",
    },
  },
  {
    id: "vip_offer",
    name: "VIP Exclusive",
    useCase: "One-time modal · high-value player offer",
    category: "retention",
    defaults: {
      title: "You're a VIP — Exclusive Offer Inside",
      description: "VIP exclusive modal",
      content: "As one of our top players, you've unlocked a special bonus. Check your wallet — a surprise has been credited.",
      type: "modal",
      show_frequency: "once",
      bg_color: "#120a14",
      image_url: IMGS.modal_vip,
      cta_action: "deposit",
    },
  },
  // ── Custom ────────────────────────────────────────────────────────────────
  {
    id: "custom",
    name: "Custom",
    useCase: "Start blank — full control over every field",
    category: "custom",
    defaults: {
      type: "toast",
      show_frequency: "always",
      bg_color: "#0d0b1e",
      cta_action: null,
    },
  },
];

// ─── Template picker step ─────────────────────────────────────────────────────

const CATEGORY_TABS: { key: TemplateCategory | "all"; label: string }[] = [
  { key: "all",       label: "All" },
  { key: "games",     label: "Games" },
  { key: "deposits",  label: "Deposits" },
  { key: "retention", label: "Retention" },
  { key: "custom",    label: "Custom" },
];

function TemplatePickerStep({ onSelect }: { onSelect: (t: Template) => void }) {
  const [tab, setTab] = useState<TemplateCategory | "all">("games");

  const filtered = tab === "all"
    ? TEMPLATES
    : TEMPLATES.filter((t) => t.category === tab);

  const gameTemplates = filtered.filter((t) => t.category === "games" && t.id !== "custom");
  const nonGameTemplates = filtered.filter((t) => t.category !== "games" && t.id !== "custom");
  const customTemplate = TEMPLATES.find((t) => t.id === "custom")!;

  return (
    <div className="space-y-3">
      {/* Category tabs */}
      <div className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none] pb-0.5">
        {CATEGORY_TABS.map((c) => {
          const count = c.key === "all"
            ? TEMPLATES.length - 1 // exclude custom from count
            : TEMPLATES.filter((t) => t.category === c.key && t.id !== "custom").length;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => setTab(c.key)}
              className={`shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-all ${
                tab === c.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border border-border/60 text-muted-foreground hover:text-foreground hover:bg-accent/40"
              }`}
            >
              {c.label}
              {c.key !== "custom" && count > 0 && (
                <span className={`rounded-full px-1 text-[9px] font-bold ${tab === c.key ? "bg-white/20" : "bg-border/80 text-muted-foreground"}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Template list */}
      <div className="space-y-1.5 max-h-[55vh] overflow-y-auto pr-1">
        {/* Game templates — image thumbnail cards */}
        {gameTemplates.length > 0 && (
          <div className="space-y-1.5">
            {tab === "all" && (
              <p className="px-1 text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60">Games</p>
            )}
            {gameTemplates.map((t) => {
              const tc = TYPE_META[t.defaults.type ?? "banner"] ?? TYPE_META.banner;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onSelect(t)}
                  className={`group w-full flex items-center gap-3 overflow-hidden rounded-[14px] border border-border/60 bg-card p-2 text-left transition-all hover:bg-accent/40 hover:border-border`}
                >
                  {/* Game image thumbnail */}
                  {t.defaults.image_url && (
                    <div className="relative shrink-0 h-[48px] w-[96px] overflow-hidden rounded-[8px] bg-black">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={t.defaults.image_url}
                        alt={t.name}
                        className="h-full w-full object-cover object-right"
                      />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-foreground leading-tight">{t.name}</span>
                      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold capitalize ${tc.badge}`}>
                        {tc.label}
                      </span>
                      {t.defaults.cta_action && (
                        <span className="shrink-0 rounded-full bg-bp-accent/10 border border-bp-accent/25 px-1.5 py-0.5 text-[9px] font-semibold text-bp-accent">
                          {t.defaults.cta_action.startsWith("game:") ? "Play Now" : "Deposit"}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground truncate">{t.useCase}</p>
                  </div>
                  <svg className="shrink-0 h-4 w-4 text-muted-foreground/40 group-hover:text-foreground/60 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              );
            })}
          </div>
        )}

        {/* Non-game templates — compact 2-col grid */}
        {nonGameTemplates.length > 0 && (
          <div>
            {tab === "all" && gameTemplates.length > 0 && (
              <p className="px-1 pt-2 pb-1 text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60">Promotions</p>
            )}
            <div className="grid grid-cols-2 gap-1.5">
              {nonGameTemplates.map((t) => {
                const type = t.defaults.type ?? "toast";
                const tc = TYPE_META[type] ?? TYPE_META.toast;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onSelect(t)}
                    className={`group flex flex-col gap-1 overflow-hidden rounded-[12px] border border-border/60 bg-card px-3 py-2.5 text-left transition-all hover:bg-accent/40 border-l-4 ${tc.border}`}
                  >
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[12px] font-semibold text-foreground leading-tight">{t.name}</span>
                      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold capitalize ${tc.badge}`}>
                        {tc.label}
                      </span>
                    </div>
                    <p className="text-[10px] leading-relaxed text-muted-foreground line-clamp-2">{t.useCase}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Custom — always last when All or Custom tab */}
        {(tab === "all" || tab === "custom") && (
          <div className={tab === "all" ? "pt-1.5" : ""}>
            {tab === "all" && (
              <p className="px-1 pb-1 text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60">Other</p>
            )}
            <button
              type="button"
              onClick={() => onSelect(customTemplate)}
              className="w-full flex items-center gap-3 rounded-[12px] border border-dashed border-border/60 bg-card/50 px-4 py-3 text-left transition-all hover:bg-accent/40 hover:border-border"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-card text-lg">✏️</div>
              <div>
                <p className="text-sm font-semibold text-foreground">Custom</p>
                <p className="text-[11px] text-muted-foreground">Start blank — full control over every field</p>
              </div>
            </button>
          </div>
        )}

        {filtered.filter((t) => t.id !== "custom").length === 0 && tab !== "all" && tab !== "custom" && (
          <p className="py-8 text-center text-sm text-muted-foreground">No templates in this category.</p>
        )}
      </div>
    </div>
  );
}

// ─── Shared UI helpers ────────────────────────────────────────────────────────

function Overlay({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    />
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <>
      <Overlay onClose={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-[24px] border border-border/70 bg-bp-mid shadow-2xl">
          <div className="flex items-center justify-between border-b border-border/60 px-6 py-4">
            <h2 className="text-lg font-bold">{title}</h2>
            <button
              onClick={onClose}
              className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="px-6 py-5">{children}</div>
        </div>
      </div>
    </>
  );
}

function FieldRow({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
        {label}{required && <span className="ml-0.5 text-red-400">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls = "w-full rounded-xl border border-border/70 bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50";
const selectCls = "w-full rounded-xl border border-border/70 bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50";
const textareaCls = "w-full rounded-xl border border-border/70 bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50 resize-none";

// Games that have live routes — kept in sync with LIVE_GAMES in the lobby page
const LIVE_GAME_OPTIONS = [
  { value: "game:dice-3d",  label: "Dice 3D" },
  { value: "game:skyrise",  label: "Aviator" },
  { value: "game:coinflip", label: "Coin Flip" },
  { value: "game:hi-lo",    label: "Hi-Lo (Cards)" },
  { value: "game:mines",    label: "Mines" },
  { value: "game:limbo",    label: "Limbo" },
  { value: "game:dragon-tower", label: "Dragon Tower" },
  { value: "game:andar-bahar", label: "Andar Bahar" },
  { value: "game:plinko",    label: "Plinko" },
  { value: "game:keno",      label: "Keno" },
  { value: "game:dragon-tiger", label: "Dragon vs Tiger" },
  { value: "game:teen-patti", label: "Teen Patti" },
] as const;

// Parse DB cta_action back into the select value + optional URL
function parseCtaSelect(action: string | null | undefined): string {
  if (!action) return "";
  if (action.startsWith("url:")) return "url:";
  return action;
}
function parseCtaUrl(action: string | null | undefined): string {
  if (!action?.startsWith("url:")) return "";
  return action.slice(4);
}

// ─── Promotion form fields (shared between create and edit) ───────────────────

function PromotionFormFields({ defaults }: { defaults?: PromotionDefaults }) {
  const [ctaSelect, setCtaSelect] = useState(() => parseCtaSelect(defaults?.cta_action));

  return (
    <>
      <FieldRow label="Title" required>
        <input name="title" defaultValue={defaults?.title ?? ""} placeholder="e.g. Weekend Bonus Drop" className={inputCls} required />
      </FieldRow>

      <FieldRow label="Description">
        <input name="description" defaultValue={defaults?.description ?? ""} placeholder="Short summary shown in the table" className={inputCls} />
      </FieldRow>

      <div className="grid grid-cols-2 gap-3">
        <FieldRow label="Type" required>
          <select name="type" className={selectCls} defaultValue={defaults?.type ?? "toast"}>
            <option value="toast">Toast</option>
            <option value="modal">Modal</option>
            <option value="banner">Banner</option>
          </select>
        </FieldRow>
        <FieldRow label="Show Frequency" required>
          <select name="show_frequency" className={selectCls} defaultValue={defaults?.show_frequency ?? "always"}>
            <option value="always">Always</option>
            <option value="once">Once per session</option>
            <option value="daily">Once per day</option>
          </select>
        </FieldRow>
      </div>

      <FieldRow label="Image URL">
        <input name="image_url" defaultValue={defaults?.image_url ?? ""} placeholder="https://… (optional)" className={inputCls} type="text" />
      </FieldRow>

      <FieldRow label="Content / Body Text">
        <textarea name="content" rows={3} defaultValue={defaults?.content ?? ""} placeholder="Main message shown to the player" className={textareaCls} />
      </FieldRow>

      <FieldRow label="Background Color">
        <div className="flex items-center gap-2">
          <input name="bg_color" type="color" defaultValue={defaults?.bg_color ?? "#0d0b1e"} className="h-9 w-12 cursor-pointer rounded-lg border border-border/70 bg-card p-1" />
          <span className="text-xs text-muted-foreground">Card / container background</span>
        </div>
      </FieldRow>

      {/* ── CTA section ───────────────────────────────────────────────────── */}
      <div className="space-y-3 rounded-xl border border-border/40 bg-card/50 p-3.5">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
          CTA Button <span className="normal-case font-normal text-muted-foreground/60">(optional)</span>
        </p>

        <FieldRow label="Action">
          <select
            name="cta_action_select"
            className={selectCls}
            value={ctaSelect}
            onChange={(e) => setCtaSelect(e.target.value)}
          >
            <option value="">None — no button</option>
            <option value="deposit">Open Deposit</option>
            <option value="withdraw">Open Withdraw</option>
            <optgroup label="── Send to Game ──">
              {LIVE_GAME_OPTIONS.map((g) => (
                <option key={g.value} value={g.value}>Play {g.label}</option>
              ))}
            </optgroup>
            <option value="url:">Custom URL / path</option>
          </select>
        </FieldRow>

        {ctaSelect === "url:" && (
          <FieldRow label="URL or path">
            <input
              name="cta_custom_url"
              defaultValue={parseCtaUrl(defaults?.cta_action)}
              placeholder="/protected/games/... or https://..."
              className={inputCls}
            />
          </FieldRow>
        )}

        <FieldRow label="Button Label">
          <input
            name="cta_label"
            defaultValue={defaults?.cta_label ?? ""}
            placeholder={ctaSelect ? `Auto: "${ctaLabelFromAction(ctaSelect === "url:" ? "url:x" : ctaSelect, null)}"` : "No button — action is None"}
            className={inputCls}
            disabled={!ctaSelect}
          />
        </FieldRow>
      </div>
    </>
  );
}

// ─── Preview Promotion ────────────────────────────────────────────────────────

const TYPE_LABEL: Record<string, string> = {
  toast: "bg-blue-500/15 text-blue-400",
  modal: "bg-purple-500/15 text-purple-400",
  banner: "bg-yellow-500/15 text-yellow-400",
};

export function PreviewPromotionButton({ promo }: { promo: Awaited<ReturnType<typeof getPromotions>>[0] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="whitespace-nowrap rounded-lg bg-secondary/80 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        Preview
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="relative w-full max-w-[600px] overflow-hidden rounded-[28px] border border-border/70 bg-[#090714] shadow-2xl">
              <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-white/20" />
                  <span className="text-xs font-semibold text-white/40">Lobby Preview</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${TYPE_LABEL[promo.type] ?? "bg-secondary text-muted-foreground"}`}>
                    {promo.type}
                  </span>
                  <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] text-white/35 capitalize">
                    {promo.show_frequency}
                  </span>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="p-4">
                {/* Pass no-op onCtaClick so the button renders but doesn't need finance context */}
                {promo.type === "banner" && (
                  <PromotionBannerCard
                    promo={promo}
                    onCtaClick={promo.cta_action ? () => {} : undefined}
                  />
                )}
                {promo.type === "toast" && (
                  <PromotionToastCard
                    promo={promo}
                    onCtaClick={promo.cta_action ? () => {} : undefined}
                  />
                )}
                {promo.type === "modal" && (
                  <div>
                    <PromotionModalCard
                      promo={promo}
                      onCtaClick={promo.cta_action ? () => {} : undefined}
                    />
                    <button className="mt-3 w-full rounded-xl border border-white/10 bg-white/5 py-2.5 text-sm font-medium text-white/60">
                      Dismiss
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

// ─── Create Promotion (two-step: template picker → form) ─────────────────────

export function CreatePromotionButton() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"pick" | "form">("pick");
  const [template, setTemplate] = useState<Template | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function handleSelectTemplate(t: Template) {
    setTemplate(t);
    setStep("form");
  }

  function handleClose() {
    setOpen(false);
    setTimeout(() => { setStep("pick"); setTemplate(null); setError(""); }, 150);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const fd = new FormData(e.currentTarget);

    const ctaSelect = fd.get("cta_action_select") as string;
    const ctaCustomUrl = (fd.get("cta_custom_url") as string | null)?.trim() ?? "";
    const ctaAction = ctaSelect === "url:"
      ? (ctaCustomUrl ? `url:${ctaCustomUrl}` : null)
      : (ctaSelect || null);
    const ctaLabelRaw = (fd.get("cta_label") as string | null)?.trim() || null;

    const input: CreatePromotionInput = {
      title: fd.get("title") as string,
      description: fd.get("description") as string || undefined,
      type: fd.get("type") as string,
      image_url: fd.get("image_url") as string || undefined,
      content: fd.get("content") as string || undefined,
      bg_color: fd.get("bg_color") as string || undefined,
      show_frequency: fd.get("show_frequency") as string,
      cta_action: ctaAction,
      cta_label: ctaLabelRaw,
    };

    if (!input.title.trim()) return setError("Title is required.");

    setLoading(true);
    try {
      await createPromotion(input);
      handleClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create promotion.");
    } finally {
      setLoading(false);
    }
  }

  const modalTitle =
    step === "pick"
      ? "Choose a Template"
      : template?.id === "custom"
        ? "New Promotion"
        : `New Promotion — ${template?.name ?? ""}`;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
      >
        + New Promotion
      </button>

      {open && (
        <Modal title={modalTitle} onClose={handleClose}>
          {step === "pick" ? (
            <TemplatePickerStep onSelect={handleSelectTemplate} />
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <button
                type="button"
                onClick={() => setStep("pick")}
                className="text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                ← Back to templates
              </button>

              <PromotionFormFields defaults={template?.defaults} />

              {error && <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>}

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={handleClose} className="flex-1 rounded-xl border border-border/70 bg-card py-2 text-sm text-muted-foreground transition-colors hover:bg-accent">
                  Cancel
                </button>
                <button type="submit" disabled={loading} className="flex-1 rounded-xl bg-primary py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80 disabled:opacity-50">
                  {loading ? "Creating…" : "Create Promotion"}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}

// ─── Edit Promotion ───────────────────────────────────────────────────────────

export function EditPromotionButton({ promo }: { promo: Awaited<ReturnType<typeof getPromotions>>[0] }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const fd = new FormData(e.currentTarget);

    const ctaSelect = fd.get("cta_action_select") as string;
    const ctaCustomUrl = (fd.get("cta_custom_url") as string | null)?.trim() ?? "";
    const ctaAction = ctaSelect === "url:"
      ? (ctaCustomUrl ? `url:${ctaCustomUrl}` : null)
      : (ctaSelect || null);
    const ctaLabelRaw = (fd.get("cta_label") as string | null)?.trim() || null;

    const input = {
      id: promo.id,
      title: fd.get("title") as string,
      description: fd.get("description") as string || undefined,
      type: fd.get("type") as string,
      image_url: fd.get("image_url") as string || undefined,
      content: fd.get("content") as string || undefined,
      bg_color: fd.get("bg_color") as string || undefined,
      show_frequency: fd.get("show_frequency") as string,
      cta_action: ctaAction,
      cta_label: ctaLabelRaw,
    };

    if (!input.title.trim()) return setError("Title is required.");

    setLoading(true);
    try {
      await updatePromotion(input);
      setOpen(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="whitespace-nowrap rounded-lg bg-primary/15 px-3 py-1.5 text-xs text-primary transition-colors hover:bg-primary/25"
      >
        Edit
      </button>

      {open && (
        <Modal title="Edit Promotion" onClose={() => setOpen(false)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <PromotionFormFields defaults={promo} />

            {error && <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>}

            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setOpen(false)} className="flex-1 rounded-xl border border-border/70 bg-card py-2 text-sm text-muted-foreground transition-colors hover:bg-accent">
                Cancel
              </button>
              <button type="submit" disabled={loading} className="flex-1 rounded-xl bg-primary py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80 disabled:opacity-50">
                {loading ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

// ─── Toggle Promotion ─────────────────────────────────────────────────────────

export function TogglePromotionButton({ id, isActive }: { id: string; isActive: boolean }) {
  const [loading, setLoading] = useState(false);

  return (
    <button
      disabled={loading}
      onClick={async () => {
        if (!confirm(`${isActive ? "Disable" : "Enable"} this promotion?`)) return;
        setLoading(true);
        try { await togglePromotion(id, !isActive); }
        catch (e: unknown) { alert(e instanceof Error ? e.message : "Failed"); }
        finally { setLoading(false); }
      }}
      className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs transition-colors disabled:opacity-50 ${isActive
        ? "bg-yellow-500/15 text-yellow-400 hover:bg-yellow-500/25"
        : "bg-green-500/15 text-green-400 hover:bg-green-500/25"
        }`}
    >
      {loading ? "…" : isActive ? "Disable" : "Enable"}
    </button>
  );
}

// ─── Delete Promotion ─────────────────────────────────────────────────────────

export function DeletePromotionButton({ id, title }: { id: string; title: string }) {
  const [loading, setLoading] = useState(false);

  return (
    <button
      disabled={loading}
      onClick={async () => {
        if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
        setLoading(true);
        try { await deletePromotion(id); }
        catch (e: unknown) { alert(e instanceof Error ? e.message : "Failed"); }
        finally { setLoading(false); }
      }}
      className="whitespace-nowrap rounded-lg bg-red-500/15 px-3 py-1.5 text-xs text-red-400 transition-colors hover:bg-red-500/25 disabled:opacity-50"
    >
      {loading ? "…" : "Delete"}
    </button>
  );
}

// ─── Add Promotion Player ─────────────────────────────────────────────────────

export function AddPromotionPlayerButton() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [foundUser, setFoundUser] = useState<{ id: string; username: string; display_name: string | null } | null>(null);
  const [searchError, setSearchError] = useState("");
  const [error, setError] = useState("");
  const usernameRef = useRef<HTMLInputElement>(null);

  async function handleSearch() {
    const username = usernameRef.current?.value.trim();
    if (!username) return;
    setSearching(true);
    setSearchError("");
    setFoundUser(null);
    try {
      const user = await findUserByUsername(username);
      if (!user) setSearchError("No player found with that username.");
      else setFoundUser({ ...user, username: user.username ?? "" });
    } catch {
      setSearchError("Search failed.");
    } finally {
      setSearching(false);
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!foundUser) return setError("Search and confirm a player first.");
    setError("");
    const fd = new FormData(e.currentTarget);
    const boost = parseFloat(fd.get("win_boost") as string);
    if (isNaN(boost) || boost < 0 || boost > 100) return setError("Win boost must be 0–100.");
    const notes = fd.get("notes") as string;

    setLoading(true);
    try {
      await addPromotionPlayer(foundUser.id, boost, notes);
      setOpen(false);
      setFoundUser(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add player.");
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setOpen(false);
    setFoundUser(null);
    setSearchError("");
    setError("");
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
      >
        + Add Player
      </button>

      {open && (
        <Modal title="Add Promotion Player" onClose={handleClose}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <FieldRow label="Find Player by Username" required>
              <div className="flex gap-2">
                <input ref={usernameRef} placeholder="e.g. username" className={inputCls} />
                <button
                  type="button"
                  onClick={handleSearch}
                  disabled={searching}
                  className="shrink-0 rounded-xl border border-border/70 bg-card px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-accent disabled:opacity-50"
                >
                  {searching ? "…" : "Search"}
                </button>
              </div>
              {searchError && <p className="mt-1 text-xs text-red-400">{searchError}</p>}
            </FieldRow>

            {foundUser && (
              <div className="rounded-xl border border-green-500/30 bg-green-500/10 px-3 py-2.5">
                <p className="text-xs font-semibold text-green-400">Player found</p>
                <p className="mt-0.5 text-sm font-medium">{foundUser.username}</p>
                {foundUser.display_name && <p className="text-xs text-muted-foreground">{foundUser.display_name}</p>}
              </div>
            )}

            <FieldRow label="Win Probability Boost (%)" required>
              <input name="win_boost" type="number" min="0" max="100" step="0.5" defaultValue="5" className={inputCls} />
            </FieldRow>

            <FieldRow label="Notes">
              <textarea name="notes" rows={2} placeholder="e.g. For Q1 ad campaign" className={textareaCls} />
            </FieldRow>

            {error && <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>}

            <div className="flex gap-2 pt-1">
              <button type="button" onClick={handleClose} className="flex-1 rounded-xl border border-border/70 bg-card py-2 text-sm text-muted-foreground transition-colors hover:bg-accent">
                Cancel
              </button>
              <button type="submit" disabled={loading || !foundUser} className="flex-1 rounded-xl bg-primary py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80 disabled:opacity-50">
                {loading ? "Adding…" : "Add Player"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

// ─── Edit Promotion Player ────────────────────────────────────────────────────

export function EditPromotionPlayerButton({
  id,
  currentBoost,
  currentNotes,
}: {
  id: string;
  currentBoost: number;
  currentNotes: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const fd = new FormData(e.currentTarget);
    const boost = parseFloat(fd.get("win_boost") as string);
    if (isNaN(boost) || boost < 0 || boost > 100) return setError("Win boost must be 0–100.");
    const notes = fd.get("notes") as string;

    setLoading(true);
    try {
      await updatePromotionPlayer(id, boost, notes);
      setOpen(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="whitespace-nowrap rounded-lg bg-primary/15 px-3 py-1.5 text-xs text-primary transition-colors hover:bg-primary/25"
      >
        Edit
      </button>

      {open && (
        <Modal title="Edit Promotion Player" onClose={() => setOpen(false)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <FieldRow label="Win Probability Boost (%)" required>
              <input name="win_boost" type="number" min="0" max="100" step="0.5" defaultValue={currentBoost} className={inputCls} />
            </FieldRow>

            <FieldRow label="Notes">
              <textarea name="notes" rows={2} defaultValue={currentNotes} className={textareaCls} />
            </FieldRow>

            {error && <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>}

            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setOpen(false)} className="flex-1 rounded-xl border border-border/70 bg-card py-2 text-sm text-muted-foreground transition-colors hover:bg-accent">
                Cancel
              </button>
              <button type="submit" disabled={loading} className="flex-1 rounded-xl bg-primary py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80 disabled:opacity-50">
                {loading ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

// ─── Toggle Promotion Player ──────────────────────────────────────────────────

export function TogglePromotionPlayerButton({ id, isActive }: { id: string; isActive: boolean }) {
  const [loading, setLoading] = useState(false);

  return (
    <button
      disabled={loading}
      onClick={async () => {
        if (!confirm(`${isActive ? "Deactivate" : "Activate"} this promotion player?`)) return;
        setLoading(true);
        try { await togglePromotionPlayer(id, !isActive); }
        catch (e: unknown) { alert(e instanceof Error ? e.message : "Failed"); }
        finally { setLoading(false); }
      }}
      className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs transition-colors disabled:opacity-50 ${isActive
        ? "bg-yellow-500/15 text-yellow-400 hover:bg-yellow-500/25"
        : "bg-green-500/15 text-green-400 hover:bg-green-500/25"
        }`}
    >
      {loading ? "…" : isActive ? "Deactivate" : "Activate"}
    </button>
  );
}

// ─── Remove Promotion Player ──────────────────────────────────────────────────

export function RemovePromotionPlayerButton({ id, username }: { id: string; username: string }) {
  const [loading, setLoading] = useState(false);

  return (
    <button
      disabled={loading}
      onClick={async () => {
        if (!confirm(`Remove ${username} from the promotion pool?`)) return;
        setLoading(true);
        try { await removePromotionPlayer(id); }
        catch (e: unknown) { alert(e instanceof Error ? e.message : "Failed"); }
        finally { setLoading(false); }
      }}
      className="whitespace-nowrap rounded-lg bg-red-500/15 px-3 py-1.5 text-xs text-red-400 transition-colors hover:bg-red-500/25 disabled:opacity-50"
    >
      {loading ? "…" : "Remove"}
    </button>
  );
}

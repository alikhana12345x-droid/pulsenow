"use client";

import { useState, type FormEvent } from "react";
import {
  updateGame,
  setGameStatus,
  setGameFeatured,
  type GameAdminInput,
} from "@/lib/actions/game-admin";
import type { getAdminGames } from "@/lib/actions/game-admin";
import type { GameStatus } from "@/lib/games-catalogue";

type Game = Awaited<ReturnType<typeof getAdminGames>>[0];

const STATUS_OPTIONS: { value: GameStatus; label: string }[] = [
  { value: "live", label: "Live" },
  { value: "coming_soon", label: "Coming Soon" },
  { value: "maintenance", label: "Maintenance" },
  { value: "hidden", label: "Hidden" },
];

// ─── Shared UI helpers (match tier-actions styling) ───────────────────────────

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[24px] border border-border/70 bg-bp-mid shadow-2xl">
          <div className="sticky top-0 flex items-center justify-between border-b border-border/60 bg-bp-mid px-6 py-4">
            <h2 className="text-lg font-bold">{title}</h2>
            <button onClick={onClose} className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
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

function FieldRow({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground/60">{hint}</p>}
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-border/70 bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50";

function parseGameForm(fd: FormData, game: Game): GameAdminInput {
  const str = (k: string) => (fd.get(k) as string ?? "").trim();
  const nullable = (k: string) => { const v = str(k); return v.length ? v : null; };
  return {
    id: game.id,
    title: str("title"),
    subtitle: str("subtitle"),
    emoji: str("emoji"),
    gradient: str("gradient"),
    glow: nullable("glow"),
    payout_label: nullable("payout_label"),
    badge: nullable("badge"),
    sort_order: parseInt(str("sort_order"), 10) || 0,
    status: str("status") as GameStatus,
    featured: fd.get("featured") === "on",
    card_image_url: nullable("card_image_url"),
    loading_image_url: nullable("loading_image_url"),
    banner_image_url: nullable("banner_image_url"),
  };
}

// ─── Edit Game (modal) ────────────────────────────────────────────────────────

export function EditGameButton({ game }: { game: Game }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const input = parseGameForm(new FormData(e.currentTarget), game);
    if (!input.title) return setError("Title is required.");
    setLoading(true);
    try {
      await updateGame(input);
      setOpen(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save.");
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
        <Modal title={`Edit · ${game.title}`} onClose={() => setOpen(false)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="rounded-xl border border-border/50 bg-card/50 px-3 py-2 text-[11px] text-muted-foreground">
              Slug <span className="font-mono text-foreground/70">{game.slug}</span> · game_type{" "}
              <span className="font-mono text-foreground/70">{game.game_type}</span> (code-defined, not editable)
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FieldRow label="Title"><input name="title" defaultValue={game.title} className={inputCls} required /></FieldRow>
              <FieldRow label="Emoji"><input name="emoji" defaultValue={game.emoji} className={inputCls} /></FieldRow>
            </div>

            <FieldRow label="Subtitle"><input name="subtitle" defaultValue={game.subtitle} className={inputCls} /></FieldRow>

            <div className="grid grid-cols-2 gap-3">
              <FieldRow label="Badge" hint="e.g. NEW, LIVE"><input name="badge" defaultValue={game.badge ?? ""} className={inputCls} /></FieldRow>
              <FieldRow label="Payout label" hint="e.g. Up to 1000×"><input name="payout_label" defaultValue={game.payout_label ?? ""} className={inputCls} /></FieldRow>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FieldRow label="Status">
                <select name="status" defaultValue={game.status} className={inputCls}>
                  {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </FieldRow>
              <FieldRow label="Sort order"><input name="sort_order" type="number" min="0" step="1" defaultValue={game.sort_order} className={inputCls} /></FieldRow>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input name="featured" type="checkbox" defaultChecked={game.featured} className="h-4 w-4 rounded border-border/70" />
              Featured (shows as a big hero card in the lobby — any number of games can be featured at once, stacked by sort order)
            </label>

            <FieldRow label="Gradient" hint="Tailwind classes, e.g. from-cyan-600 via-sky-700 to-blue-950">
              <input name="gradient" defaultValue={game.gradient} className={inputCls} />
            </FieldRow>
            <FieldRow label="Glow" hint="rgba(...) used behind the card art">
              <input name="glow" defaultValue={game.glow ?? ""} className={inputCls} />
            </FieldRow>

            <div className="space-y-3 rounded-xl border border-border/50 bg-card/40 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Images (optional — paste a URL or /public path)</p>
              <FieldRow label="Card image" hint="Overrides the coded SVG card art if set">
                <input name="card_image_url" defaultValue={game.card_image_url ?? ""} placeholder="/brand/… or https://…" className={inputCls} />
              </FieldRow>
              <FieldRow label="Loading image"><input name="loading_image_url" defaultValue={game.loading_image_url ?? ""} placeholder="/brand/loading/…" className={inputCls} /></FieldRow>
              <FieldRow label="Banner image" hint="3:1 promo banner"><input name="banner_image_url" defaultValue={game.banner_image_url ?? ""} className={inputCls} /></FieldRow>
            </div>

            {error && <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>}

            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setOpen(false)} className="flex-1 rounded-xl border border-border/70 bg-card py-2 text-sm text-muted-foreground transition-colors hover:bg-accent">Cancel</button>
              <button type="submit" disabled={loading} className="flex-1 rounded-xl bg-primary py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80 disabled:opacity-50">{loading ? "Saving…" : "Save Changes"}</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

// ─── Inline status dropdown ───────────────────────────────────────────────────

export function StatusSelect({ id, status }: { id: string; status: string }) {
  const [loading, setLoading] = useState(false);
  const [val, setVal] = useState(status);

  const color =
    val === "live" ? "text-green-400 border-green-500/40"
      : val === "maintenance" ? "text-yellow-400 border-yellow-500/40"
        : val === "coming_soon" ? "text-sky-400 border-sky-500/40"
          : "text-muted-foreground border-border/70";

  return (
    <select
      value={val}
      disabled={loading}
      onChange={async (e) => {
        const next = e.target.value;
        const prev = val;
        setVal(next);
        setLoading(true);
        try {
          await setGameStatus(id, next);
        } catch (err: unknown) {
          alert(err instanceof Error ? err.message : "Failed");
          setVal(prev);
        } finally {
          setLoading(false);
        }
      }}
      className={`rounded-lg border bg-card px-2 py-1 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50 ${color}`}
    >
      {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value} className="text-foreground">{o.label}</option>)}
    </select>
  );
}

// ─── Inline featured toggle ───────────────────────────────────────────────────
// Multiple games can be featured at once — this only toggles its own row.
// Displays from the prop (no local mirror) so it stays correct after revalidate.

export function FeaturedToggle({ id, featured }: { id: string; featured: boolean }) {
  const [loading, setLoading] = useState(false);

  return (
    <button
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        try {
          await setGameFeatured(id, !featured);
        } catch (err: unknown) {
          alert(err instanceof Error ? err.message : "Failed");
        } finally {
          setLoading(false);
        }
      }}
      className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs transition-colors disabled:opacity-50 ${
        featured
          ? "bg-bp-accent/15 text-bp-accent hover:bg-bp-accent/25"
          : "bg-secondary text-muted-foreground hover:bg-accent"
      }`}
    >
      {loading ? "…" : featured ? "★ Featured" : "☆ Feature"}
    </button>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { roundAt, type SharedRound } from "@/lib/skyrise-sequence";
import { ACCENT_GRADIENT, SignalCard, SignalTile } from "./signal-chrome";

type BetRound = {
  id: string;
  crashAt: number | null;
  status: string;
  stale: boolean;
  createdAt: string;
};

// What the readout is locked onto. A "bet" round is a real wager the server
// decided; a "spectator" round is the shared clock-derived one every idle tab
// is flying. The readout shows the crash point either way — which kind it is
// stays off screen.
type Shown =
  | { kind: "bet"; round: BetRound }
  | { kind: "spectator"; round: SharedRound };

const POLL_MS = 400;
const CLOCK_MS = 100;
// Every Run Scan runs the loader for at least this long before revealing. Without
// it, re-scanning a round already in flight re-renders the identical number and
// looks like the button did nothing.
const SCAN_MS = 900;

export function PeekViewer({ slug }: { slug: string }) {
  const [shown, setShown] = useState<Shown | null>(null);
  const [live, setLive] = useState<boolean | null>(null);
  const [dropped, setDropped] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const scanTimerRef = useRef(0);
  // Bumped by the clock ticker purely to re-render the live readout.
  const [, setClockTick] = useState(0);
  // Clock tiles render only after mount: the server and the browser would
  // otherwise format two different instants and trip a hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const pendingBetRef = useRef<BetRound | null>(null);
  const shownRef = useRef<Shown | null>(null);
  // server clock − browser clock, taken from the feed. The spectator sequence is
  // a function of wall-clock time, so the monitor has to read the same clock the
  // game does or it lands on the wrong round.
  const skewRef = useRef(0);
  const serverNow = useCallback(() => Date.now() + skewRef.current, []);

  // Reveal is manual, always. Nothing here advances the readout on its own —
  // what is on screen stays until the next Run Scan.
  const reveal = useCallback(() => {
    window.clearTimeout(scanTimerRef.current);
    shownRef.current = null;
    setShown(null);
    setDropped(null);
    setScanning(true);

    scanTimerRef.current = window.setTimeout(() => {
      // Resolved when the scan finishes rather than when it started, so a round
      // that ended during those 900 ms isn't what gets shown.
      const bet = pendingBetRef.current;
      // Prefer a real wager when one is in the air: it is what that player is
      // actually looking at. Otherwise show the shared spectator round.
      const next: Shown = bet
        ? { kind: "bet", round: bet }
        : { kind: "spectator", round: roundAt(serverNow()) };
      shownRef.current = next;
      setShown(next);
      setScanning(false);
    }, SCAN_MS);
  }, [serverNow]);

  useEffect(() => () => window.clearTimeout(scanTimerRef.current), []);

  // ── Feed poll: real wagers ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    let timer = 0;

    const tick = async () => {
      try {
        const current = shownRef.current;
        const watch = current?.kind === "bet" ? current.round.id : null;
        const res = await fetch(
          `/api/x/${slug}/feed${watch ? `?watch=${watch}` : ""}`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error(String(res.status));

        const data = await res.json();
        if (cancelled) return;

        if (typeof data.now === "number") skewRef.current = data.now - Date.now();
        setLive(true);
        pendingBetRef.current = data.pending ?? null;

        // A watched wager that vanished, or one still "pending" long past when a
        // real flight would have ended because the player closed the tab. Either
        // way the number is dead — clear it rather than leaving it looking live.
        if (watch && (data.watchedMissing || data.watched?.stale)) {
          shownRef.current = null;
          setShown(null);
          setDropped(
            data.watchedMissing
              ? "That round's record is gone."
              : "Round abandoned — player left mid-flight.",
          );
        }
      } catch {
        if (!cancelled) setLive(false);
      }
      if (!cancelled) timer = window.setTimeout(tick, POLL_MS);
    };

    tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [slug]);

  // Drives the clock tiles and the queued→launched hand-off. Spectator rounds
  // need no fetch at all — they are a pure function of the shared clock.
  useEffect(() => {
    const id = window.setInterval(() => setClockTick((n) => n + 1), CLOCK_MS);
    return () => window.clearInterval(id);
  }, []);

  // ── Derived readout ───────────────────────────────────────────────────────
  const now = serverNow();
  const clockRound = mounted ? roundAt(now) : null;

  // `queued` means the scanned round exists but hasn't launched yet — the
  // betting window is still draining. The crash point is withheld behind the
  // loader until the plane is actually in the air.
  let crashAt: number | null = null;
  let queued = false;
  if (shown?.kind === "spectator") {
    crashAt = shown.round.crashAt;
    queued = now < shown.round.flightAt;
  } else if (shown?.kind === "bet") {
    crashAt = shown.round.crashAt;
  }

  const statusLabel =
    live == null ? "CONNECTING" : live ? "ONLINE" : "RECONNECTING";

  return (
    <SignalCard>
      {/* ── Header ── */}
      <header className="relative mb-6 text-center">
        <h1
          className="text-[30px] font-extrabold leading-none tracking-[0.02em] text-[#35ffb0] sm:text-[34px]"
          style={{
            fontFamily: "var(--font-orbitron), ui-monospace, monospace",
            textShadow: "0 0 26px rgba(43,247,163,0.45)",
          }}
        >
          Aviator Signal
        </h1>
        <p className="mt-3 text-[15px] text-white/45">Round Scan Engine</p>
      </header>

      {/* ── Info tiles ── */}
      <div className="grid grid-cols-2 gap-3">
        <SignalTile
          label="Date"
          value={mounted ? new Date(now).toLocaleDateString() : "—"}
        />
        <SignalTile
          label="Time"
          value={mounted ? new Date(now).toLocaleTimeString() : "—"}
        />
        <SignalTile
          label="Round"
          value={clockRound ? `#${clockRound.roundNumber}` : "—"}
        />
        <SignalTile label="Status" value={statusLabel} accent />
      </div>

      {/* ── Readout: the crash point, and nothing else ── */}
      <div className="relative mt-3 flex min-h-[190px] items-center justify-center overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.015] px-5 py-7 text-center">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at 50% 55%, rgba(43,247,163,0.13) 0%, transparent 68%)",
          }}
        />
        <div className="relative w-full">
          {scanning || (shown && queued) ? (
            <ScanningLoader />
          ) : !shown ? (
            <IdlePlaceholder />
          ) : (
            <div
              className="text-[58px] font-extrabold leading-none tabular-nums sm:text-[66px]"
              style={{
                fontFamily: "var(--font-orbitron), ui-monospace, monospace",
                color: "#35ffb0",
                textShadow: "0 0 34px rgba(43,247,163,0.55)",
              }}
            >
              {crashAt?.toFixed(2) ?? "—"}
            </div>
          )}
        </div>
      </div>

      {dropped ? (
        <p className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.08] px-3 py-2 text-center text-[10px] font-bold uppercase tracking-[0.15em] text-amber-300/80">
          {dropped}
        </p>
      ) : null}

      {/* ── Action ── */}
      <button
        type="button"
        onClick={reveal}
        disabled={scanning}
        className="mt-4 w-full rounded-2xl py-4 text-[15px] font-black uppercase tracking-[0.14em] text-[#04150f] transition active:scale-[0.985] disabled:opacity-60"
        style={{
          background: ACCENT_GRADIENT,
          boxShadow: "0 0 34px rgba(43,247,163,0.22)",
        }}
      >
        {scanning ? "Scanning…" : "Run Scan"}
      </button>
    </SignalCard>
  );
}

/** Idle state: a pulsing question mark with a slow sweep across it. */
function IdlePlaceholder() {
  return (
    <div className="flex flex-col items-center py-1">
      <div className="relative">
        <div
          className="text-[64px] font-extrabold leading-none text-[#2bf7a3]/25"
          style={{
            fontFamily: "var(--font-orbitron), ui-monospace, monospace",
            textShadow: "0 0 30px rgba(43,247,163,0.22)",
            animation: "sig-idle 2.4s ease-in-out infinite",
          }}
        >
          ?
        </div>
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-[-40px] top-0 h-full"
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, rgba(43,247,163,0.22) 50%, transparent 100%)",
            animation: "sig-sweep 2.8s ease-in-out infinite",
          }}
        />
      </div>
      <div className="mt-4 text-[10px] font-black uppercase tracking-[0.26em] text-white/25">
        Awaiting scan
      </div>
    </div>
  );
}

/** Shown while the scanned round is still queued and has not launched. */
function ScanningLoader() {
  return (
    <div className="flex flex-col items-center py-1">
      <div
        className="h-[58px] w-[58px] rounded-full border-[3px] border-white/[0.07] border-t-[#2bf7a3]"
        style={{
          animation: "sig-spin 0.9s linear infinite",
          boxShadow: "0 0 26px rgba(43,247,163,0.22)",
        }}
      />
      <div className="mt-5 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.26em] text-white/30">
        Scanning
        <span className="inline-flex gap-[3px]">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-[3px] w-[3px] rounded-full bg-[#2bf7a3]"
              style={{ animation: `sig-pulse 1.2s ease-in-out ${i * 0.18}s infinite` }}
            />
          ))}
        </span>
      </div>
    </div>
  );
}

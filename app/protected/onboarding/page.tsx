"use client";

import { useState } from "react";
import { CheckCircle, Sparkles, Trophy, Gift } from "lucide-react";

const inputCls = "w-full bg-white/[0.03] border border-white/[0.07] rounded-[12px] px-4 py-3 text-sm text-bp-text placeholder:text-white/25 focus:outline-none focus:border-bp-accent/50 transition-colors";

export default function OnboardingPage() {
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername]       = useState("");
  const [error, setError]             = useState<string | null>(null);
  const [loading, setLoading]         = useState(false);
  const [done, setDone]               = useState(false);
  const [skipped, setSkipped]         = useState<string | null>(null);

  const save = async (payload: Record<string, unknown>) => {
    setLoading(true);
    setError(null);

    try {
      const res  = await fetch("/api/auth/onboarding", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Something went wrong."); return; }

      if (payload.skip) setSkipped(data.displayName ?? null);
      setDone(true);
      // Hard navigation, not router.push: the client Router Cache still holds
      // the entry for this route from the pre-profile redirect (proxy bounced
      // /protected → /protected/onboarding when display_name was empty). A soft
      // push would hit that cache, resolve to this very page, and leave the
      // component mounted on the "done" screen forever. A full load re-runs the
      // proxy with the freshly saved profile.
      setTimeout(() => window.location.replace("/"), payload.skip ? 2200 : 1500);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) { setError("Please enter your display name."); return; }
    void save({ displayName: displayName.trim(), username: username.trim() });
  };

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "#090714" }}>
        <div className="text-center space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-bp-win/30 bg-bp-win/10">
            <CheckCircle className="h-8 w-8 text-bp-win" />
          </div>
          <p className="text-xl font-black text-bp-text">Welcome aboard!</p>
          {skipped ? (
            <p className="text-sm text-white/45">
              We picked <span className="font-bold text-bp-accent">{skipped}</span> for you —
              change it any time in your profile.
            </p>
          ) : (
            <p className="text-sm text-white/45">Taking you to the lobby…</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "#090714" }}>
      <div className="w-full max-w-sm">

        {/* Header */}
        <div className="mb-6 text-center space-y-3">
          <div className="flex justify-center gap-2 mb-4">
            <span className="grid h-10 w-10 place-items-center rounded-full border border-bp-accent/40 bg-bp-accent text-[#1b1305] shadow-[0_0_18px_rgba(242,154,11,0.35)]">
              <Sparkles className="h-5 w-5" />
            </span>
            <span className="grid h-10 w-10 place-items-center rounded-full border border-bp-win/40 bg-bp-win text-[#031b19] shadow-[0_0_18px_rgba(94,234,212,0.25)]">
              <Gift className="h-5 w-5" />
            </span>
            <span className="grid h-10 w-10 place-items-center rounded-full border border-sky-300/40 bg-sky-300 text-[#041421] shadow-[0_0_18px_rgba(125,211,252,0.25)]">
              <Trophy className="h-5 w-5" />
            </span>
          </div>
          <h1 className="text-[28px] font-black tracking-tight text-bp-text">Welcome to PulseNow</h1>
          <p className="text-sm text-white/45">Set up your profile to get started. You can change these later.</p>
        </div>

        <div className="overflow-hidden rounded-[22px] border border-bp-accent/20 bg-bp-mid/80 shadow-[0_24px_80px_rgba(0,0,0,0.55),0_0_54px_rgba(242,154,11,0.12)] backdrop-blur-xl">
          <div className="h-1 bg-gradient-to-r from-bp-accent via-bp-win to-sky-400" />
          <form onSubmit={handleSubmit} className="p-6 space-y-4">

            <div className="space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Display name <span className="text-bp-lose">*</span></p>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="How you appear to others"
                maxLength={40}
                className={inputCls}
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">
                Username <span className="text-white/25 normal-case tracking-normal font-normal">(optional)</span>
              </p>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                placeholder="player_name"
                maxLength={20}
                className={inputCls}
              />
              <p className="text-[10px] text-white/30">Lowercase letters, numbers, underscores only.</p>
            </div>

            {error && (
              <p className="rounded-[10px] border border-bp-lose/20 px-3 py-2.5 text-xs font-semibold text-bp-lose"
                style={{ background: "rgba(255,93,115,0.07)" }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !displayName.trim()}
              className="w-full h-12 rounded-[12px] bg-bp-accent text-[#1b1305] text-sm font-black uppercase tracking-wider shadow-[0_4px_18px_rgba(242,154,11,0.35)] hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              {loading ? "Saving…" : "Enter the lobby"}
            </button>

            <button
              type="button"
              onClick={() => void save({ skip: true })}
              disabled={loading}
              className="w-full text-xs text-white/30 hover:text-white/55 transition-colors disabled:opacity-40"
            >
              Skip — pick a name for me
            </button>

          </form>
        </div>

      </div>
    </div>
  );
}

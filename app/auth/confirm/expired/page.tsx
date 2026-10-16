"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AuthPageShell } from "@/components/auth-page-shell";
import { AlertTriangle, Clock, Send, CheckCircle } from "lucide-react";
import Link from "next/link";

export default function ExpiredPage() {
  const [message, setMessage]   = useState("This link has expired or is no longer valid.");
  const [email, setEmail]       = useState("");
  const [sending, setSending]   = useState(false);
  const [sent, setSent]         = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    const hash   = window.location.hash.slice(1);
    const params = new URLSearchParams(hash);
    const desc   = params.get("error_description");
    const code   = params.get("error_code");

    if (code === "otp_expired" || desc?.toLowerCase().includes("expired")) {
      setMessage("Your verification link has expired. Enter your email below to get a fresh one.");
    } else if (desc) {
      setMessage(desc.replace(/\+/g, " "));
    }
  }, []);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setSending(true);
    setSendError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm?next=/protected/onboarding`,
      },
    });

    setSending(false);

    if (error) {
      setSendError(error.message);
    } else {
      setSent(true);
    }
  };

  return (
    <AuthPageShell
      eyebrow="Link Expired"
      title="Verification failed."
      description="The link you clicked is no longer valid. Request a new one below."
      stats={[["Expired", "Link"], ["Request", "New"], ["Verify", "Again"]]}
      feed={["Link expired", "Token invalid", "Try again"]}
      actionHref="/auth/login"
      actionLabel="Login"
    >
      <div className="overflow-hidden rounded-[22px] border border-bp-lose/20 bg-bp-mid/80 shadow-[0_24px_80px_rgba(0,0,0,0.55),0_0_54px_rgba(255,93,115,0.12)] backdrop-blur-xl">
        <div className="h-1 bg-gradient-to-r from-bp-lose via-bp-accent to-sky-400" />
        <div className="p-6 space-y-5">

          <div className="flex items-center justify-between">
            <div className="inline-flex items-center gap-2 rounded-full border border-bp-lose/20 bg-bp-lose/10 px-3 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-bp-lose shadow-[0_0_12px_rgba(255,93,115,0.8)]" />
              <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-bp-lose">Link Expired</span>
            </div>
            <span className="grid h-10 w-10 place-items-center rounded-full border border-bp-lose/30 bg-bp-lose/15 text-bp-lose">
              <Clock className="h-5 w-5" />
            </span>
          </div>

          <div>
            <h2 className="text-[26px] font-black leading-none tracking-tight text-bp-text">Verification failed</h2>
            <p className="mt-3 rounded-[10px] border border-bp-lose/20 px-4 py-3 text-sm text-bp-lose/90 leading-relaxed"
              style={{ background: "rgba(255,93,115,0.07)" }}>
              <AlertTriangle className="inline h-3.5 w-3.5 mr-1.5 -mt-0.5" />
              {message}
            </p>
          </div>

          {sent ? (
            <div className="rounded-[12px] border border-bp-win/25 px-4 py-4 text-sm text-bp-win flex items-start gap-3"
              style={{ background: "rgba(94,234,212,0.07)" }}>
              <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>New verification email sent! Check your inbox and click the link to confirm your account.</span>
            </div>
          ) : (
            <form onSubmit={handleResend} className="space-y-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/40">
                Resend verification email
              </p>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="w-full rounded-[12px] border border-white/[0.07] bg-white/[0.03] px-4 py-3 text-sm text-bp-text placeholder:text-white/25 focus:outline-none focus:border-bp-accent/50 transition-colors"
              />
              {sendError && (
                <p className="rounded-[10px] border border-bp-lose/20 px-3 py-2 text-xs text-bp-lose"
                  style={{ background: "rgba(255,93,115,0.07)" }}>
                  {sendError}
                </p>
              )}
              <button
                type="submit"
                disabled={sending || !email.trim()}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-[12px] bg-bp-accent text-[#1b1305] text-sm font-black uppercase tracking-wider shadow-[0_4px_18px_rgba(242,154,11,0.35)] hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
                {sending ? "Sending…" : "Send new link"}
              </button>
            </form>
          )}

          <Link
            href="/auth/login"
            className="flex h-10 w-full items-center justify-center rounded-[12px] border border-white/[0.08] text-sm font-semibold text-white/50 hover:text-white/80 hover:border-white/[0.15] transition-colors"
            style={{ background: "rgba(255,255,255,0.03)" }}
          >
            Already confirmed? Log in
          </Link>

        </div>
      </div>
    </AuthPageShell>
  );
}

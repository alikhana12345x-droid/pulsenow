"use client";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { AuthFormHooks } from "./types";

const RESEND_COOLDOWN_S = 60;

// Supabase's "Email OTP Length" (Authentication → Providers → Email) is a
// dashboard setting that can be 6, 7 or 8. Accept the whole range instead of
// hard-coding 6 — a shorter maxLength silently truncates the pasted code and
// every verify then fails with "invalid".
const OTP_MIN_LENGTH = 6;
const OTP_MAX_LENGTH = 8;
const OTP_PATTERN = new RegExp(`^\\d{${OTP_MIN_LENGTH},${OTP_MAX_LENGTH}}$`);

/** Which OTP email the code came from — both flows are code-only, no links. */
export type OtpPurpose = "signup" | "recovery";

const COPY: Record<
  OtpPurpose,
  { badge: string; title: string; locked: string; unlocked: string }
> = {
  signup: {
    badge: "Code Sent",
    title: "Verify your email",
    locked: "Enter it below to activate your account.",
    unlocked: "Enter the email you signed up with and the code we sent you.",
  },
  recovery: {
    badge: "Reset Code",
    title: "Enter reset code",
    locked: "Enter it below to choose a new password.",
    unlocked: "Enter your email and the reset code we sent you.",
  },
};

/**
 * Email verification by numeric OTP, for both the sign-up confirmation and the
 * password-reset codes. The email normally arrives as a prop (set by the
 * sign-up / forgot-password form through the modal provider); when the card is
 * reached without one (deep link / page refresh) it asks for the email so the
 * user can resend a code and continue.
 */
export function VerifyOtpCard({
  email: initialEmail = "",
  purpose = "signup",
  onSuccess,
  onSwitchView,
}: AuthFormHooks & { email?: string; purpose?: OtpPurpose }) {
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const router = useRouter();

  const emailLocked = Boolean(initialEmail);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    const token = code.trim();
    if (!OTP_PATTERN.test(token)) {
      setError(
        `Enter the ${OTP_MIN_LENGTH}-${OTP_MAX_LENGTH} digit code from your email.`,
      );
      return;
    }
    if (!email.trim()) {
      setError("Enter the email you signed up with.");
      return;
    }

    const supabase = createClient();
    setIsVerifying(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token,
        type: purpose,
      });
      if (error) throw error;

      // Recovery: the code only opens a session — the new password is set in
      // the next step (UpdatePasswordForm).
      if (purpose === "recovery") {
        if (onSuccess) onSuccess({ view: "update-password", email: email.trim() });
        else {
          router.push("/auth/update-password");
          router.refresh();
        }
        return;
      }

      // Same post-confirmation steps as the old link flow (/auth/confirm):
      // keep only this session, then create the profile + wallet rows.
      await supabase.auth.signOut({ scope: "others" });
      await fetch("/api/auth/setup-profile", { method: "POST" });

      if (onSuccess) onSuccess({});
      else {
        router.push("/protected");
        router.refresh();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Verification failed";
      setError(
        /expired|invalid/i.test(msg)
          ? "That code is invalid or has expired. Request a new one below."
          : msg,
      );
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    setError(null);
    setNotice(null);
    if (!email.trim()) {
      setError("Enter the email you signed up with.");
      return;
    }

    const supabase = createClient();
    setIsResending(true);
    try {
      // `auth.resend` has no "recovery" type — a new reset code is issued by
      // asking for the reset email again.
      const { error } =
        purpose === "recovery"
          ? await supabase.auth.resetPasswordForEmail(email.trim())
          : await supabase.auth.resend({ type: "signup", email: email.trim() });
      if (error) throw error;
      setNotice("A new code is on its way — check your inbox.");
      setCooldown(RESEND_COOLDOWN_S);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend the code");
    } finally {
      setIsResending(false);
    }
  };

  return (
    <Card className="overflow-hidden rounded-[22px] border-bp-accent/20 bg-bp-mid/82 text-bp-text shadow-[0_24px_80px_rgba(0,0,0,0.55),0_0_54px_rgba(242,154,11,0.2)] backdrop-blur-xl">
      <div className="h-1 bg-gradient-to-r from-bp-accent via-bp-win to-sky-400" />
      <CardHeader className="space-y-4 p-6 pb-4">
        <div className="flex items-center justify-between gap-3">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-bp-win/20 bg-bp-win/10 px-3 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-bp-win shadow-[0_0_12px_rgba(94,234,212,0.9)]" />
            <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-bp-win">
              {COPY[purpose].badge}
            </span>
          </div>
          <span className="grid h-10 w-10 place-items-center rounded-full border border-bp-accent/30 bg-bp-accent/15 text-bp-accent">
            <ShieldCheck className="h-5 w-5" />
          </span>
        </div>
        <CardTitle className="text-[30px] font-black leading-none tracking-tight">
          {COPY[purpose].title}
        </CardTitle>
        <CardDescription className="text-sm leading-6 text-white/45">
          {emailLocked ? (
            <>
              We sent a code to{" "}
              <span className="font-semibold text-white/70">{email}</span>.{" "}
              {COPY[purpose].locked}
            </>
          ) : (
            COPY[purpose].unlocked
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6 pt-2">
        <form onSubmit={handleVerify}>
          <div className="flex flex-col gap-4">
            {!emailLocked && (
              <div className="grid gap-2">
                <Label
                  htmlFor="otp-email"
                  className="text-xs font-bold uppercase tracking-[0.18em] text-white/42"
                >
                  Email
                </Label>
                <Input
                  id="otp-email"
                  type="email"
                  placeholder="you@example.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-12 rounded-xl border-white/[0.08] bg-white/[0.045] px-4 text-bp-text shadow-none placeholder:text-white/22 focus-visible:ring-bp-accent"
                />
              </div>
            )}

            <div className="grid gap-2">
              <Label
                htmlFor="otp-code"
                className="text-xs font-bold uppercase tracking-[0.18em] text-white/42"
              >
                Verification code
              </Label>
              <Input
                id="otp-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                maxLength={OTP_MAX_LENGTH}
                required
                value={code}
                onChange={(e) =>
                  setCode(
                    e.target.value.replace(/\D/g, "").slice(0, OTP_MAX_LENGTH),
                  )
                }
                className="h-14 rounded-xl border-white/[0.08] bg-white/[0.045] px-4 text-center text-2xl font-black tracking-[0.35em] text-bp-text shadow-none placeholder:text-white/15 focus-visible:ring-bp-accent"
              />
            </div>

            {error && (
              <p className="rounded-xl border border-bp-lose/20 bg-bp-lose/10 px-3 py-2 text-sm text-bp-lose">
                {error}
              </p>
            )}
            {notice && (
              <p className="rounded-xl border border-bp-win/20 bg-bp-win/10 px-3 py-2 text-sm text-bp-win">
                {notice}
              </p>
            )}

            <Button
              type="submit"
              className="mt-1 h-12 w-full rounded-xl bg-gradient-to-b from-bp-accent to-[#c97e08] text-[15px] font-black uppercase tracking-[0.08em] text-[#1b1305] shadow-[0_8px_26px_rgba(242,154,11,0.35)] transition-all hover:scale-[1.01] hover:from-[#ffad1f] hover:to-bp-accent active:scale-[0.99]"
              disabled={isVerifying}
            >
              {isVerifying ? "Verifying..." : "Verify & Continue"}
            </Button>
          </div>
        </form>

        <div className="mt-5 flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={handleResend}
            disabled={isResending || cooldown > 0}
            className="font-bold text-bp-accent underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:text-white/25 disabled:no-underline"
          >
            {cooldown > 0
              ? `Resend code in ${cooldown}s`
              : isResending
                ? "Sending..."
                : "Resend code"}
          </button>
          <button
            type="button"
            onClick={() => onSwitchView?.("login")}
            className="text-white/45 underline-offset-4 hover:text-white/70 hover:underline"
          >
            Back to login
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

"use client";

import { cn } from "@/lib/utils";
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
import { Eye, EyeOff, Gift, Sparkles, Trophy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AuthFormHooks, AuthView } from "@/components/auth/types";
import { GOOGLE_AUTH_ENABLED, startOAuthRedirect } from "@/lib/auth/oauth";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="mr-2 h-4 w-4 shrink-0" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

type SignUpFormProps = React.ComponentPropsWithoutRef<"div"> &
  AuthFormHooks & {
    initialReferralCode?: string;
  };

export function SignUpForm({
  className,
  initialReferralCode = "",
  onSwitchView,
  onSuccess,
  nextPath,
  ...props
}: SignUpFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [referralCode, setReferralCode] = useState(initialReferralCode);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showRepeatPassword, setShowRepeatPassword] = useState(false);
  const router = useRouter();

  const switchTo = (view: AuthView, href: string) => {
    if (onSwitchView) onSwitchView(view);
    else router.push(href);
  };

  const handleGoogleSignIn = async () => {
    const supabase = createClient();
    setError(null);
    setIsGoogleLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          // `signInWithOAuth` has no `options.data`, so the referral code rides
          // along in the intent cookie instead of user metadata.
          redirectTo: startOAuthRedirect({
            next: nextPath,
            ref: referralCode,
          }),
          // Always let the user choose an account. Without this Google silently
          // reuses whichever account the browser is already signed into, which
          // looks like a hang when it isn't the one the user wanted.
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) throw error;
      // supabase-js navigates to `data.url` itself. No URL means the provider
      // never got as far as issuing one — surface it instead of leaving the
      // button spinning on "Redirecting..." forever.
      if (!data?.url) {
        throw new Error("Google sign-in is unavailable right now. Try email instead.");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not start Google sign-in",
      );
      setIsGoogleLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    if (password !== repeatPassword) {
      setError("Passwords do not match");
      setIsLoading(false);
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      setIsLoading(false);
      return;
    }

    try {
      // The server creates the user pre-confirmed (no OTP email), rejecting
      // duplicate emails; then we sign in with the same credentials.
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password, referralCode }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error ?? "Could not create account.");

      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;

      await fetch("/api/auth/setup-profile", { method: "POST" });
      if (onSuccess) onSuccess({});
      else {
        router.push("/protected");
        router.refresh();
      }
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="overflow-hidden rounded-[22px] border-bp-accent/20 bg-bp-mid/82 text-bp-text shadow-[0_24px_80px_rgba(0,0,0,0.55),0_0_54px_rgba(242,154,11,0.2)] backdrop-blur-xl">
        <div className="h-1 bg-gradient-to-r from-bp-accent via-bp-win to-sky-400" />
        <CardHeader className="space-y-4 p-6 pb-4">
          <div className="flex items-center justify-between gap-3">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-bp-accent/20 bg-bp-accent/10 px-3 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-bp-win shadow-[0_0_12px_rgba(94,234,212,0.9)]" />
              <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-bp-accent">
                New Player
              </span>
            </div>
            <div className="flex -space-x-2">
              <span className="grid h-8 w-8 place-items-center rounded-full border border-bp-accent/40 bg-bp-accent text-[#1b1305] shadow-[0_0_18px_rgba(242,154,11,0.35)]">
                <Sparkles className="h-4 w-4" />
              </span>
              <span className="grid h-8 w-8 place-items-center rounded-full border border-bp-win/40 bg-bp-win text-[#031b19] shadow-[0_0_18px_rgba(94,234,212,0.25)]">
                <Gift className="h-4 w-4" />
              </span>
              <span className="grid h-8 w-8 place-items-center rounded-full border border-sky-300/40 bg-sky-300 text-[#041421] shadow-[0_0_18px_rgba(125,211,252,0.25)]">
                <Trophy className="h-4 w-4" />
              </span>
            </div>
          </div>
          <CardTitle className="text-[30px] font-black leading-none tracking-tight">
            Create account
          </CardTitle>
          <CardDescription className="text-sm leading-6 text-white/45">
            Set up your secure entry and claim your place at the table.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 pt-2">
          <form onSubmit={handleSignUp}>
            <div className="flex flex-col gap-4">
              <div className="grid gap-2">
                <Label
                  htmlFor="email"
                  className="text-xs font-bold uppercase tracking-[0.18em] text-white/42"
                >
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-12 rounded-xl border-white/[0.08] bg-white/[0.045] px-4 text-bp-text shadow-none placeholder:text-white/22 focus-visible:ring-bp-accent"
                />
              </div>

              <div className="grid gap-2">
                <Label
                  htmlFor="password"
                  className="text-xs font-bold uppercase tracking-[0.18em] text-white/42"
                >
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Min. 8 characters"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-12 rounded-xl border-white/[0.08] bg-white/[0.045] px-4 pr-11 text-bp-text shadow-none placeholder:text-white/22 focus-visible:ring-bp-accent"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 transition-colors hover:text-white/70"
                    tabIndex={-1}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="grid gap-2">
                <Label
                  htmlFor="repeat-password"
                  className="text-xs font-bold uppercase tracking-[0.18em] text-white/42"
                >
                  Confirm password
                </Label>
                <div className="relative">
                  <Input
                    id="repeat-password"
                    type={showRepeatPassword ? "text" : "password"}
                    required
                    value={repeatPassword}
                    onChange={(e) => setRepeatPassword(e.target.value)}
                    className="h-12 rounded-xl border-white/[0.08] bg-white/[0.045] px-4 pr-11 text-bp-text shadow-none focus-visible:ring-bp-accent"
                  />
                  <button
                    type="button"
                    onClick={() => setShowRepeatPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 transition-colors hover:text-white/70"
                    tabIndex={-1}
                    aria-label={showRepeatPassword ? "Hide password" : "Show password"}
                  >
                    {showRepeatPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="grid gap-2">
                <Label
                  htmlFor="referral-code"
                  className="text-xs font-bold uppercase tracking-[0.18em] text-white/42"
                >
                  Referral code{" "}
                  <span className="font-semibold normal-case tracking-normal text-white/24">
                    (optional)
                  </span>
                </Label>
                <Input
                  id="referral-code"
                  type="text"
                  placeholder="Enter code"
                  value={referralCode}
                  onChange={(e) => setReferralCode(e.target.value)}
                  className="h-12 rounded-xl border-white/[0.08] bg-white/[0.045] px-4 text-bp-text shadow-none placeholder:text-white/22 focus-visible:ring-bp-accent"
                />
              </div>

              {error && (
                <p className="rounded-xl border border-bp-lose/20 bg-bp-lose/10 px-3 py-2 text-sm text-bp-lose">
                  {error}
                </p>
              )}

              <Button
                type="submit"
                className="mt-1 h-12 w-full rounded-xl bg-gradient-to-b from-bp-accent to-[#c97e08] text-[15px] font-black uppercase tracking-[0.08em] text-[#1b1305] shadow-[0_8px_26px_rgba(242,154,11,0.35)] transition-all hover:scale-[1.01] hover:from-[#ffad1f] hover:to-bp-accent active:scale-[0.99]"
                disabled={isLoading}
              >
                {isLoading ? "Creating..." : "Create Account"}
              </Button>
            </div>

            <div className="mt-5 text-center text-sm text-white/45">
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => switchTo("login", "/auth/login")}
                className="font-bold text-bp-accent underline-offset-4 hover:underline"
              >
                Log in
              </button>
            </div>
          </form>

          {GOOGLE_AUTH_ENABLED && (
          <>
          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-white/[0.08]" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-[#1e1a0e] px-3 text-[11px] font-semibold uppercase tracking-widest text-white/30">
                or
              </span>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="h-12 w-full rounded-xl border-white/[0.08] bg-white/[0.045] font-semibold text-bp-text transition-all hover:bg-white/[0.08] hover:text-bp-text"
            onClick={handleGoogleSignIn}
            disabled={isGoogleLoading}
          >
            <GoogleIcon />
            {isGoogleLoading ? "Redirecting..." : "Continue with Google"}
          </Button>
          </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

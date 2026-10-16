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
import { MailCheck, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AuthFormHooks, AuthView } from "@/components/auth/types";

export function ForgotPasswordForm({
  className,
  onSwitchView,
  onSuccess,
  ...props
}: React.ComponentPropsWithoutRef<"div"> & AuthFormHooks) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const switchTo = (view: AuthView, href: string) => {
    if (onSwitchView) onSwitchView(view);
    else router.push(href);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    try {
      // OTP-only recovery: the "Reset password" email delivers a numeric code
      // ({{ .Token }}) verified in the next view, so there is no link and no
      // `redirectTo` to allow-list.
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw error;
      if (onSuccess) onSuccess({ view: "verify-recovery", email });
      else setSuccess(true);
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      {success ? (
        <Card className="overflow-hidden rounded-[22px] border-bp-accent/20 bg-bp-mid/82 text-bp-text shadow-[0_24px_80px_rgba(0,0,0,0.55),0_0_54px_rgba(242,154,11,0.2)] backdrop-blur-xl">
          <div className="h-1 bg-gradient-to-r from-bp-accent via-bp-win to-sky-400" />
          <CardHeader className="space-y-4 p-6 pb-4">
            <div className="flex items-center justify-between gap-3">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-bp-win/20 bg-bp-win/10 px-3 py-1">
                <span className="h-1.5 w-1.5 rounded-full bg-bp-win shadow-[0_0_12px_rgba(94,234,212,0.9)]" />
                <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-bp-win">
                  Code Sent
                </span>
              </div>
              <span className="grid h-10 w-10 place-items-center rounded-full border border-bp-accent/30 bg-bp-accent/15 text-bp-accent">
                <MailCheck className="h-5 w-5" />
              </span>
            </div>
            <CardTitle className="text-[30px] font-black leading-none tracking-tight">
              Check your email
            </CardTitle>
            <CardDescription className="text-sm leading-6 text-white/45">
              Your reset code is on the way.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 pt-2">
            <p className="rounded-xl border border-white/[0.06] bg-white/[0.035] p-4 text-sm leading-6 text-white/50">
              If you registered using your email and password, you will receive
              a reset code by email. Enter it on the next step to choose a new
              password.
            </p>
            <div className="mt-5 text-center text-sm text-white/45">
              Got the code?{" "}
              <button
                type="button"
                onClick={() =>
                  switchTo("verify-recovery", "/?auth=verify-recovery")
                }
                className="font-bold text-bp-accent underline-offset-4 hover:underline"
              >
                Enter it now
              </button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden rounded-[22px] border-bp-accent/20 bg-bp-mid/82 text-bp-text shadow-[0_24px_80px_rgba(0,0,0,0.55),0_0_54px_rgba(242,154,11,0.2)] backdrop-blur-xl">
          <div className="h-1 bg-gradient-to-r from-bp-accent via-bp-win to-sky-400" />
          <CardHeader className="space-y-4 p-6 pb-4">
            <div className="flex items-center justify-between gap-3">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-bp-accent/20 bg-bp-accent/10 px-3 py-1">
                <span className="h-1.5 w-1.5 rounded-full bg-bp-win shadow-[0_0_12px_rgba(94,234,212,0.9)]" />
                <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-bp-accent">
                  Recovery
                </span>
              </div>
              <span className="grid h-10 w-10 place-items-center rounded-full border border-bp-accent/30 bg-bp-accent/15 text-bp-accent">
                <RotateCcw className="h-5 w-5" />
              </span>
            </div>
            <CardTitle className="text-[30px] font-black leading-none tracking-tight">
              Reset password
            </CardTitle>
            <CardDescription className="text-sm leading-6 text-white/45">
              Enter your email and we will send a reset code.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 pt-2">
            <form onSubmit={handleForgotPassword}>
              <div className="flex flex-col gap-6">
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
                    placeholder="m@example.com"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
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
                  className="h-12 w-full rounded-xl bg-gradient-to-b from-bp-accent to-[#c97e08] text-[15px] font-black uppercase tracking-[0.08em] text-[#1b1305] shadow-[0_8px_26px_rgba(242,154,11,0.35)] transition-all hover:scale-[1.01] hover:from-[#ffad1f] hover:to-bp-accent active:scale-[0.99]"
                  disabled={isLoading}
                >
                  {isLoading ? "Sending..." : "Send Reset Code"}
                </Button>
              </div>
              <div className="mt-5 text-center text-sm text-white/45">
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => switchTo("login", "/auth/login")}
                  className="font-bold text-bp-accent underline-offset-4 hover:underline"
                >
                  Login
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

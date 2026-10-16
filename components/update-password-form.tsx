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
import { KeyRound, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AuthFormHooks } from "@/components/auth/types";

export function UpdatePasswordForm({
  className,
  onSuccess,
  ...props
}: React.ComponentPropsWithoutRef<"div"> & Pick<AuthFormHooks, "onSuccess">) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    if (password !== confirmPassword) {
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
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      if (onSuccess) onSuccess({});
      else router.push("/protected");
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
                New Key
              </span>
            </div>
            <span className="grid h-10 w-10 place-items-center rounded-full border border-bp-accent/30 bg-bp-accent/15 text-bp-accent">
              <KeyRound className="h-5 w-5" />
            </span>
          </div>
          <CardTitle className="text-[30px] font-black leading-none tracking-tight">
            New password
          </CardTitle>
          <CardDescription className="text-sm leading-6 text-white/45">
            Enter and confirm your new secure password.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 pt-2">
          <form onSubmit={handleUpdatePassword}>
            <div className="flex flex-col gap-4">
              <div className="grid gap-2">
                <Label
                  htmlFor="password"
                  className="text-xs font-bold uppercase tracking-[0.18em] text-white/42"
                >
                  New password
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Min. 8 characters"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-12 rounded-xl border-white/[0.08] bg-white/[0.045] px-4 text-bp-text shadow-none placeholder:text-white/22 focus-visible:ring-bp-accent"
                />
              </div>
              <div className="grid gap-2">
                <Label
                  htmlFor="confirm-password"
                  className="text-xs font-bold uppercase tracking-[0.18em] text-white/42"
                >
                  Confirm new password
                </Label>
                <Input
                  id="confirm-password"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="h-12 rounded-xl border-white/[0.08] bg-white/[0.045] px-4 text-bp-text shadow-none focus-visible:ring-bp-accent"
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
                {isLoading ? "Saving..." : "Save Password"}
              </Button>
            </div>
            <div className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-bp-win/15 bg-bp-win/5 px-3 py-2 text-[11px] font-semibold text-bp-win/80">
              <ShieldCheck className="h-3.5 w-3.5" />
              Encrypted account recovery
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

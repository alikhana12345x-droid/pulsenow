import { AuthPageShell } from "@/components/auth-page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, RotateCcw } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

async function ErrorContent({
  searchParams,
}: {
  searchParams: Promise<{ error: string }>;
}) {
  const params = await searchParams;

  return (
    <>
      {params?.error ? (
        <p className="rounded-xl border border-bp-lose/20 bg-bp-lose/10 px-3 py-2 text-sm text-bp-lose">
          Code error: {params.error}
        </p>
      ) : (
        <p className="rounded-xl border border-bp-lose/20 bg-bp-lose/10 px-3 py-2 text-sm text-bp-lose">
          An unspecified error occurred.
        </p>
      )}
    </>
  );
}

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ error: string }>;
}) {
  return (
    <AuthPageShell
      eyebrow="Entry Interrupted"
      title="The table paused."
      description="Something blocked the secure auth flow. Try again or return to login."
      stats={[
        ["Hold", "Session"],
        ["Check", "Link"],
        ["Retry", "Entry"],
      ]}
      feed={["Flow paused", "Link check", "Retry ready"]}
      actionHref="/auth/login"
      actionLabel="Login"
    >
      <Card className="overflow-hidden rounded-[22px] border-bp-lose/20 bg-bp-mid/82 text-bp-text shadow-[0_24px_80px_rgba(0,0,0,0.55),0_0_54px_rgba(255,93,115,0.14)] backdrop-blur-xl">
        <div className="h-1 bg-gradient-to-r from-bp-lose via-bp-accent to-sky-400" />
        <CardHeader className="space-y-4 p-6 pb-4">
          <div className="flex items-center justify-between gap-3">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-bp-lose/20 bg-bp-lose/10 px-3 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-bp-lose shadow-[0_0_12px_rgba(255,93,115,0.8)]" />
              <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-bp-lose">
                Auth Error
              </span>
            </div>
            <span className="grid h-10 w-10 place-items-center rounded-full border border-bp-lose/30 bg-bp-lose/15 text-bp-lose">
              <AlertTriangle className="h-5 w-5" />
            </span>
          </div>
          <CardTitle className="text-[30px] font-black leading-none tracking-tight">
            Something went wrong
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 pt-2">
          <Suspense>
            <ErrorContent searchParams={searchParams} />
          </Suspense>
          <Button
            asChild
            className="mt-5 h-12 w-full rounded-xl bg-gradient-to-b from-bp-accent to-[#c97e08] text-[15px] font-black uppercase tracking-[0.08em] text-[#1b1305] shadow-[0_8px_26px_rgba(242,154,11,0.35)] transition-all hover:scale-[1.01] hover:from-[#ffad1f] hover:to-bp-accent active:scale-[0.99]"
          >
            <Link href="/auth/login">
              <RotateCcw className="h-4 w-4" />
              Try Again
            </Link>
          </Button>
        </CardContent>
      </Card>
    </AuthPageShell>
  );
}

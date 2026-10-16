"use client";

import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AuthDialog } from "./auth-dialog";
import { VerifyOtpCard } from "./verify-otp-card";
import type { AuthView } from "./types";
import { LoginForm } from "@/components/login-form";
import { SignUpForm } from "@/components/sign-up-form";
import { ForgotPasswordForm } from "@/components/forgot-password-form";
import { UpdatePasswordForm } from "@/components/update-password-form";

interface OpenAuthOptions {
  ref?: string;
  next?: string;
}

interface AuthModalContextValue {
  openAuth: (view: AuthView, opts?: OpenAuthOptions) => void;
  closeAuth: () => void;
}

const AuthModalContext = createContext<AuthModalContextValue | null>(null);

const AUTH_PARAM_VIEWS: Record<string, AuthView> = {
  login: "login",
  signup: "signup",
  forgot: "forgot",
  "verify-otp": "verify-otp",
  "verify-recovery": "verify-recovery",
  "update-password": "update-password",
  // Old deep links from the link-based confirmation flow
  "check-email": "verify-otp",
};

// Only ever navigate to in-app paths after auth. Rejects absolute and
// protocol-relative URLs so a crafted `?next=https://evil.com` can't turn the
// post-login redirect into an open redirect.
function safeInternalPath(path: string | null): string | null {
  if (!path) return null;
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  return path;
}

export function AuthModalProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [view, setView] = useState<AuthView | null>(null);
  const [referralCode, setReferralCode] = useState("");
  const [nextPath, setNextPath] = useState<string | null>(null);
  // Email awaiting OTP verification — set when sign-up (or an unconfirmed
  // login) hands off to the verify-otp view.
  const [pendingEmail, setPendingEmail] = useState("");

  const openAuth = useCallback((next: AuthView, opts?: OpenAuthOptions) => {
    setReferralCode(opts?.ref ?? "");
    setNextPath(opts?.next ?? null);
    setView(next);
  }, []);

  const closeAuth = useCallback(() => {
    setView(null);
    setReferralCode("");
    setNextPath(null);
    setPendingEmail("");
  }, []);

  const handleSuccess = (opts: { redirectTo?: string; view?: AuthView; email?: string }) => {
    if (opts.view) {
      if (opts.email) setPendingEmail(opts.email);
      setView(opts.view);
      return;
    }
    const target = safeInternalPath(nextPath) || opts.redirectTo || "/protected";
    closeAuth();
    router.push(target);
    router.refresh();
  };

  // Password flows report back through `onSuccess`, but OAuth leaves the app,
  // so the forms need the destination to fold into the provider callback URL.
  const safeNext = safeInternalPath(nextPath) ?? undefined;

  let content: React.ReactNode = null;
  if (view === "login") {
    content = (
      <LoginForm
        onSwitchView={setView}
        onSuccess={handleSuccess}
        nextPath={safeNext}
      />
    );
  } else if (view === "signup") {
    content = (
      <SignUpForm
        initialReferralCode={referralCode}
        onSwitchView={setView}
        onSuccess={handleSuccess}
        nextPath={safeNext}
      />
    );
  } else if (view === "forgot") {
    content = (
      <ForgotPasswordForm onSwitchView={setView} onSuccess={handleSuccess} />
    );
  } else if (view === "verify-otp" || view === "verify-recovery") {
    content = (
      <VerifyOtpCard
        email={pendingEmail}
        purpose={view === "verify-recovery" ? "recovery" : "signup"}
        onSwitchView={setView}
        onSuccess={handleSuccess}
      />
    );
  } else if (view === "update-password") {
    content = <UpdatePasswordForm onSuccess={handleSuccess} />;
  }

  return (
    <AuthModalContext.Provider value={{ openAuth, closeAuth }}>
      {children}
      <Suspense fallback={null}>
        <AuthUrlSync onOpen={openAuth} />
      </Suspense>
      <AuthDialog open={view !== null} onClose={closeAuth} contentKey={view ?? undefined}>
        {content}
      </AuthDialog>
    </AuthModalContext.Provider>
  );
}

/**
 * Reads `?auth=login|signup|forgot|verify-otp|verify-recovery|update-password`
 * (plus `ref` / `next`) from the
 * URL on the landing page, opens the matching modal view, then strips those
 * control params so refresh / back behaves cleanly. Isolated in its own
 * Suspense boundary because `useSearchParams` requires one.
 */
function AuthUrlSync({
  onOpen,
}: {
  onOpen: (view: AuthView, opts?: OpenAuthOptions) => void;
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const authParam = searchParams.get("auth");
    const view = authParam ? AUTH_PARAM_VIEWS[authParam] : undefined;
    if (!view) return;

    onOpen(view, {
      ref: searchParams.get("ref") ?? undefined,
      next: searchParams.get("next") ?? undefined,
    });

    const rest = new URLSearchParams(searchParams.toString());
    rest.delete("auth");
    rest.delete("ref");
    rest.delete("next");
    const qs = rest.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [searchParams, pathname, router, onOpen]);

  return null;
}

export function useAuthModal() {
  const context = useContext(AuthModalContext);
  if (!context) {
    throw new Error("useAuthModal must be used within AuthModalProvider");
  }
  return context;
}

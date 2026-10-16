"use client";

import { useAuthModal } from "./auth-modal-provider";
import type { AuthView } from "./types";

/**
 * Button styled like a link that opens the auth modal — for use inside server
 * components (e.g. the legal layout footer) where a hook can't be called.
 */
export function AuthLink({
  view,
  className,
  children,
}: {
  view: AuthView;
  className?: string;
  children: React.ReactNode;
}) {
  const { openAuth } = useAuthModal();
  return (
    <button type="button" onClick={() => openAuth(view)} className={className}>
      {children}
    </button>
  );
}

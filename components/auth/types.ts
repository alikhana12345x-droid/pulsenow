export type AuthView =
  | "login"
  | "signup"
  | "forgot"
  // Numeric code from the "Confirm signup" email
  | "verify-otp"
  // Numeric code from the "Reset password" email, then the new-password step
  | "verify-recovery"
  | "update-password";

/**
 * Optional hooks the AuthModalProvider passes into each auth form so they can
 * switch views / report success without navigating to a new page. When these
 * are absent (e.g. a form rendered standalone), the form falls back to
 * router navigation, so the components stay usable outside the modal.
 */
export interface AuthFormHooks {
  onSwitchView?: (view: AuthView) => void;
  onSuccess?: (opts: { redirectTo?: string; view?: AuthView; email?: string }) => void;
  /**
   * Where the user was headed before auth interrupted them (e.g. `/?game=mines`).
   * Password flows route through `onSuccess`, which already knows this, but OAuth
   * leaves the app entirely — the forms have to fold it into the provider's
   * `redirectTo` so `/auth/callback` can send the user back to the right place.
   */
  nextPath?: string;
}

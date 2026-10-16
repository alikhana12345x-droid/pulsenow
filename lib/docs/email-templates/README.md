# Supabase auth email setup

Paste-ready transactional email templates, plus the dashboard config that must be
fixed before they work in production.

**Every template is OTP-based** — a numeric `{{ .Token }}` the user types into the
in-app auth modal. No template contains a confirmation or reset link, so nothing
depends on link-scanner behaviour, the same-browser PKCE verifier, or the redirect
allow-list.

## 1. Templates

| File | Supabase template | Subject to set | Used by |
|------|-------------------|----------------|---------|
| [`confirm-signup.html`](./confirm-signup.html) | **Confirm signup** | `Confirm your email address` | sign-up (required) |
| [`reset-password.html`](./reset-password.html) | **Reset password** | `Your password reset code` | forgot password (required) |
| [`magic-link.html`](./magic-link.html) | **Magic Link** | `Your PulseNow sign-in code` | unused — paste anyway |
| [`email-change.html`](./email-change.html) | **Change Email Address** | `Confirm your new email address` | unused — paste anyway |
| [`reauthentication.html`](./reauthentication.html) | **Reauthentication** | `Your PulseNow confirmation code` | unused — paste anyway |

The last three flows don't exist in the app today. Pasting them anyway means that if
one is ever triggered (or a setting like *Secure password change* is switched on), the
user gets a PulseNow-branded code instead of Supabase's default link email.

**Where to paste:** Supabase Dashboard → **Authentication → Emails → Templates**, pick
the template, put the subject in the **Subject** field and the file's markup in the
**Message body** field. Save. Each file's leading HTML comment repeats which template
it belongs to.

### App-side flows these match

| Email | App step | Supabase call |
|-------|----------|---------------|
| Confirm signup | sign-up form → **verify-otp** card | `verifyOtp({ email, token, type: "signup" })` |
| Reset password | forgot-password form → **verify-recovery** card → **update-password** card | `resetPasswordForEmail(email)` → `verifyOtp({ … type: "recovery" })` → `updateUser({ password })` |

Both live in the auth modal ([`components/auth/auth-modal-provider.tsx`](../../../components/auth/auth-modal-provider.tsx));
the code entry is the shared [`VerifyOtpCard`](../../../components/auth/verify-otp-card.tsx)
with `purpose="signup" | "recovery"`. Resending a signup code uses `auth.resend`;
`auth.resend` has no `recovery` type, so a new reset code comes from calling
`resetPasswordForEmail` again.

Notes on the markup itself: table-based layout with fully inline styles (Gmail strips
`<style>`), email-safe font stack, no `min-height:100vh`, and `&copy;` / `&mdash;` /
`&rsquo;` entities rather than raw UTF-8 bytes so nothing mojibakes.

## 2. Dashboard config — REQUIRED

### a) Email OTP length — 6, 7 or 8 all work
Authentication → **Sign In / Providers → Email → Email OTP Length**. The app's code
input accepts `6`–`8` digits (`OTP_MIN_LENGTH` / `OTP_MAX_LENGTH` in
[`verify-otp-card.tsx`](../../../components/auth/verify-otp-card.tsx)), so this setting
needs no particular value — but if it is ever raised above `8`, widen those constants
or the input will silently truncate the pasted code and every verify will fail with
"invalid".

### b) Site URL must not be localhost
Authentication → **URL Configuration → Site URL**:

```
https://pulsenow.xyz
```

Anything Supabase builds relative to `{{ .SiteURL }}` (including the OAuth default
redirect) otherwise points at localhost in real emails.

### c) Redirect URLs allow-list
Authentication → **URL Configuration → Redirect URLs**. Supabase silently rejects any
`redirectTo` that isn't listed. Since the emails are code-only, **Google OAuth is the
only flow that still needs this**:

```
https://pulsenow.xyz/auth/callback
http://localhost:3000/**          ← local dev
```

A single wildcard `https://pulsenow.xyz/**` also works, and additionally covers the
legacy link targets (`/auth/confirm`, `/auth/update-password`) that the routes still
handle for any email sent before this switch.

## 3. Verify
From the **production domain**: sign up with a real address (expect a numeric code, no
link), then run a password reset (expect a code → new-password step). Neither
should produce an "invalid redirect URL" error, and no email should contain a button
or link.

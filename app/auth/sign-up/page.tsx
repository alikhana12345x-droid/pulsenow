import { redirect } from "next/navigation";

// Kept as a deep-link target (e.g. shared referral links `/auth/sign-up?ref=CODE`).
// Forwards to the landing page with the sign-up modal auto-opened, preserving
// the referral code.
export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<{ ref?: string }>;
}) {
  const ref = (await searchParams)?.ref;
  redirect("/?auth=signup" + (ref ? `&ref=${encodeURIComponent(ref)}` : ""));
}

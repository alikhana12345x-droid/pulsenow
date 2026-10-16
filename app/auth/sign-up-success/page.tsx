import { redirect } from "next/navigation";

// Kept as a deep-link target — forwards to the landing page with the
// OTP verification modal view auto-opened.
export default function Page() {
  redirect("/?auth=verify-otp");
}

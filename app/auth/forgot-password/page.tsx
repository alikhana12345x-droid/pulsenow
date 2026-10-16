import { redirect } from "next/navigation";

// Kept as a deep-link target — forwards to the landing page with the
// forgot-password modal auto-opened.
export default function Page() {
  redirect("/?auth=forgot");
}

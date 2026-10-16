import { redirect } from "next/navigation";

// Auth is now an in-app modal. This route is kept as a deep-link / bookmark /
// middleware-redirect target — it sends the user to the landing page with the
// login modal auto-opened.
export default function Page() {
  redirect("/?auth=login");
}

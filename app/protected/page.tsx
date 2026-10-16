import { redirect } from "next/navigation";

// The lobby moved to the public `/` route. Keep this path working for old
// bookmarks / deep links by forwarding to the new home.
export default function Page() {
  redirect("/");
}

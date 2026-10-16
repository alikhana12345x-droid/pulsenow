import { redirect } from "next/navigation";

// Games now open in-place on the lobby (`/?game=…`). Kept as a deep-link stub.
export default function Page() {
  redirect("/?game=coinflip");
}

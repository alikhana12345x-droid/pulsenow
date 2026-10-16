import { Suspense } from "react";
import { GamesContent } from "./games-content";
import AdminLoading from "../loading";

export default function AdminGamesPage() {
  return (
    <Suspense fallback={<AdminLoading />}>
      <GamesContent />
    </Suspense>
  );
}

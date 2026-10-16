import { Suspense } from "react";
import { PromotionsContent } from "./promotions-content";
import AdminLoading from "../loading";

export default function AdminPromotionsPage() {
  return (
    <Suspense fallback={<AdminLoading />}>
      <PromotionsContent />
    </Suspense>
  );
}

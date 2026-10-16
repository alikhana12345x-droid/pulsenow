import { Suspense } from "react";
import { requireCapabilityPage } from "@/lib/auth/permissions";
import { getHousePayouts, getHouseFloatEstimate } from "@/lib/actions/house-payouts";
import { isSolidPayConfigured } from "@/lib/gateways/solidpay";
import { PayoutsClient } from "./payouts-client";
import AdminLoading from "../loading";

export default async function PayoutsPage() {
  await requireCapabilityPage("withdraw_house_funds");

  return (
    <Suspense fallback={<AdminLoading />}>
      <PayoutsContent />
    </Suspense>
  );
}

async function PayoutsContent() {
  const [payouts, float] = await Promise.all([getHousePayouts(), getHouseFloatEstimate()]);

  return (
    <PayoutsClient
      initialPayouts={payouts}
      float={float}
      gatewayReady={isSolidPayConfigured()}
    />
  );
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveWithdrawalMethods, getSolidPayAccount } from "@/lib/actions/payment-accounts";
import { getPaymentMode } from "@/lib/actions/platform-settings";
import { isSolidPayConfigured, SOLIDPAY_GATEWAYS } from "@/lib/gateways/solidpay";

// Returns the payment mode and the methods the platform can actually pay out
// to right now:
//   manual → the method types derived from active withdrawal-enabled accounts
//   auto   → the wallets SolidPay can send to
// Crypto is intentionally absent in auto mode: there is no automated on-chain
// dispatch, so those payouts must stay on the manual/admin path.
export async function GET() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const mode = await getPaymentMode();

  if (mode === "manual") {
    return NextResponse.json({ mode, methods: await getActiveWithdrawalMethods() });
  }

  const solidPay = await getSolidPayAccount("withdrawal");
  const methods =
    solidPay && isSolidPayConfigured()
      ? SOLIDPAY_GATEWAYS.map((gateway) => ({ gateway, logo: null }))
      : [];

  return NextResponse.json({ mode, methods });
}

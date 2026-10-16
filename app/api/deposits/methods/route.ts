import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getActiveCryptoDepositGateways,
  getActiveDepositMethods,
  getSolidPayAccount,
} from "@/lib/actions/payment-accounts";
import { getPaymentMode } from "@/lib/actions/platform-settings";
import {
  isSolidPayConfigured,
  resolveChannel,
  channelNeedsAccount,
  SOLIDPAY_GATEWAYS,
} from "@/lib/gateways/solidpay";
import type { PaymentAccountCredentials } from "@/lib/actions/payment-accounts";

// Returns the current payment mode plus the methods the player can actually
// use right now:
//   manual → the display-only accounts to pay into (number/name/logo/notes)
//   auto   → the gateway ids that have a live route behind them
// No gateway secrets are ever included — see getActiveDepositMethods.
export async function GET() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const mode = await getPaymentMode();

  if (mode === "manual") {
    return NextResponse.json({ mode, accounts: await getActiveDepositMethods(), gateways: [] });
  }

  // Auto: SolidPay covers the fiat wallets, crypto keeps its own accounts.
  // `requiresAccount` tells the sheet whether to ask for a wallet number — the
  // hosted cashier collects it itself, so asking twice is pure friction.
  const solidPay = await getSolidPayAccount("deposit");
  const creds = (solidPay?.credentials ?? {}) as PaymentAccountCredentials;

  const gateways = [
    ...(solidPay && isSolidPayConfigured()
      ? SOLIDPAY_GATEWAYS.map((gateway) => ({
          gateway,
          requiresAccount: channelNeedsAccount(resolveChannel(gateway, creds)),
        }))
      : []),
    ...(await getActiveCryptoDepositGateways()).map((gateway) => ({
      gateway,
      requiresAccount: false,
    })),
  ];

  return NextResponse.json({ mode, accounts: [], gateways });
}

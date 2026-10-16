import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deposits } from "@/lib/supabase/schema";
import { eq } from "drizzle-orm";
import { classifyOrderState, orderNoToRowId } from "@/lib/gateways/solidpay";
import { readNotification } from "@/lib/gateways/solidpay-callback";
import { settleDepositSuccess, settleDepositFailure, touchDepositMeta } from "@/lib/finance/settlement";

/**
 * SolidPay collection (payIn) notification.
 *
 * Register as payIn_notify_url in the SolidPay backend (Home → Merchant
 * Setting) and/or let each payIn request carry it:
 *   https://<your-domain>/api/webhooks/solidpay/payin
 *
 * SolidPay retries until the body is exactly "ok", so every handled outcome —
 * including duplicates — answers "ok". Only genuinely unprocessable payloads
 * return an error status so a retry can still recover.
 */
const TAG = "solidpay/payin";

export async function POST(req: NextRequest) {
  const read = await readNotification(req, TAG);
  if (!read.ok) {
    return NextResponse.json({ error: read.reason }, { status: read.status });
  }

  const data = read.data;
  const orderNo = String(data.orderNo ?? "").trim();
  const businessNo = data.businessNo ? String(data.businessNo) : null;
  const state = data.orderState;

  if (!orderNo) return NextResponse.json({ error: "missing orderNo" }, { status: 400 });

  const depositId = await resolveDepositId(orderNo);
  if (!depositId) {
    // Nothing to settle and a retry will not change that.
    console.warn(`[${TAG}] no deposit for orderNo ${orderNo}`);
    return new NextResponse("ok", { headers: { "Content-Type": "text/plain" } });
  }

  const outcome = classifyOrderState(state);
  const meta = { provider: "solidpay", business_no: businessNo, order_state: String(state ?? "") };

  try {
    if (outcome === "success") {
      const result = await settleDepositSuccess(depositId, {
        gatewayRef: businessNo ?? orderNo,
        description: `SolidPay deposit ${businessNo ?? orderNo}`,
        meta,
      });
      console.info(`[${TAG}] ${orderNo} success → ${result}`);
    } else if (outcome === "failed" || outcome === "reversed") {
      const reason = String(data.msg ?? "").trim() || (outcome === "reversed" ? "Payment reversed by provider" : "Payment failed");
      const result = await settleDepositFailure(depositId, reason, { meta });
      console.info(`[${TAG}] ${orderNo} ${outcome} → ${result}`);
    } else {
      // Still in flight — record progress, settle on a later notification.
      await touchDepositMeta(depositId, meta);
    }
  } catch (err) {
    // Ask for a retry rather than swallowing a settlement failure.
    console.error(`[${TAG}] settlement error for ${orderNo}`, err);
    return NextResponse.json({ error: "settlement failed" }, { status: 500 });
  }

  return new NextResponse("ok", { headers: { "Content-Type": "text/plain" } });
}

/**
 * orderNo is the deposit id in hex. Falls back to gateway_ref so an order
 * placed under a different scheme (or replayed by hand) still resolves.
 */
async function resolveDepositId(orderNo: string): Promise<string | null> {
  const fromHex = orderNoToRowId(orderNo);
  if (fromHex) {
    const [row] = await db
      .select({ id: deposits.id })
      .from(deposits)
      .where(eq(deposits.id, fromHex))
      .limit(1);
    if (row) return row.id;
  }

  const [byRef] = await db
    .select({ id: deposits.id })
    .from(deposits)
    .where(eq(deposits.gateway_ref, orderNo))
    .limit(1);
  return byRef?.id ?? null;
}

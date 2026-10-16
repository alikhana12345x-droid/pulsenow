import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withdrawals, house_payouts } from "@/lib/supabase/schema";
import { eq } from "drizzle-orm";
import { classifyOrderState, orderNoToRowId } from "@/lib/gateways/solidpay";
import { readNotification } from "@/lib/gateways/solidpay-callback";
import {
  settleWithdrawalSuccess,
  holdWithdrawalForManualPayout,
  settleHousePayoutSuccess,
  settleHousePayoutFailure,
  touchWithdrawalMeta,
} from "@/lib/finance/settlement";

/**
 * SolidPay payout (payOut) notification.
 *
 * Register as payOut_notify_url in the SolidPay backend:
 *   https://<your-domain>/api/webhooks/solidpay/payout
 *
 * Unlike collections, payouts notify on success AND failure. A player payout
 * that fails (or is later reversed) is not refunded: the balance stays deducted
 * and the withdrawal moves to the Finance desk for an admin to pay by hand or
 * reject. SolidPay retries until the body is exactly "ok".
 */
const TAG = "solidpay/payout";

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

  // The same endpoint carries player payouts and the house's own profit
  // withdrawals — they live in different tables, so resolve against both.
  const target = await resolvePayout(orderNo);
  if (!target) {
    console.warn(`[${TAG}] no payout for orderNo ${orderNo}`);
    return new NextResponse("ok", { headers: { "Content-Type": "text/plain" } });
  }

  const outcome = classifyOrderState(state);
  const meta = { provider: "solidpay", business_no: businessNo, order_state: String(state ?? "") };
  const isHouse = target.kind === "house";

  try {
    if (outcome === "success") {
      const result = isHouse
        ? await settleHousePayoutSuccess(target.id, { gatewayRef: businessNo ?? orderNo, meta })
        : await settleWithdrawalSuccess(target.id, { gatewayRef: businessNo ?? orderNo, meta });
      console.info(`[${TAG}] ${target.kind} ${orderNo} success → ${result}`);
    } else if (outcome === "failed" || outcome === "reversed") {
      // `msg` carries the provider's reason and is only present on failures.
      const reason =
        String(data.msg ?? "").trim() ||
        (outcome === "reversed" ? "Payout reversed by provider" : "Payout rejected by provider");
      const result = isHouse
        ? await settleHousePayoutFailure(target.id, reason, { meta })
        : await holdWithdrawalForManualPayout(target.id, reason, { meta });
      console.info(`[${TAG}] ${target.kind} ${orderNo} ${outcome} → ${result}`);
    } else if (!isHouse) {
      await touchWithdrawalMeta(target.id, meta);
    }
  } catch (err) {
    console.error(`[${TAG}] settlement error for ${orderNo}`, err);
    return NextResponse.json({ error: "settlement failed" }, { status: 500 });
  }

  return new NextResponse("ok", { headers: { "Content-Type": "text/plain" } });
}

type PayoutTarget = { kind: "player" | "house"; id: string };

async function resolvePayout(orderNo: string): Promise<PayoutTarget | null> {
  const withdrawalId = await resolveWithdrawalId(orderNo);
  if (withdrawalId) return { kind: "player", id: withdrawalId };

  const housePayoutId = await resolveHousePayoutId(orderNo);
  return housePayoutId ? { kind: "house", id: housePayoutId } : null;
}

async function resolveWithdrawalId(orderNo: string): Promise<string | null> {
  const fromHex = orderNoToRowId(orderNo);
  if (fromHex) {
    const [row] = await db
      .select({ id: withdrawals.id })
      .from(withdrawals)
      .where(eq(withdrawals.id, fromHex))
      .limit(1);
    if (row) return row.id;
  }

  const [byRef] = await db
    .select({ id: withdrawals.id })
    .from(withdrawals)
    .where(eq(withdrawals.gateway_ref, orderNo))
    .limit(1);
  return byRef?.id ?? null;
}

async function resolveHousePayoutId(orderNo: string): Promise<string | null> {
  const fromHex = orderNoToRowId(orderNo);
  if (fromHex) {
    const [row] = await db
      .select({ id: house_payouts.id })
      .from(house_payouts)
      .where(eq(house_payouts.id, fromHex))
      .limit(1);
    if (row) return row.id;
  }

  const [byRef] = await db
    .select({ id: house_payouts.id })
    .from(house_payouts)
    .where(eq(house_payouts.gateway_ref, orderNo))
    .limit(1);
  return byRef?.id ?? null;
}

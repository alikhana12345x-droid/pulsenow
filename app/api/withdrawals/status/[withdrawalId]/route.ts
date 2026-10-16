import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { withdrawals } from "@/lib/supabase/schema";
import { and, eq } from "drizzle-orm";
import { reconcileSolidPayWithdrawal } from "@/lib/finance/solidpay-reconcile";
import { describePayoutFailure } from "@/lib/gateways/solidpay";

/**
 * Payout callbacks arrive for both outcomes, but a dropped notification would
 * otherwise leave a withdrawal "processing" forever. The client's poll doubles
 * as reconciliation — kept sparse, since SolidPay rate-limits bursts.
 */
const RECONCILE_AFTER_MS = 10_000;
const RECONCILE_INTERVAL_MS = 25_000;

const lastQueryAt = new Map<string, number>();

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ withdrawalId: string }> }
) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { withdrawalId } = await params;

  const [row] = await db
    .select({
      id:               withdrawals.id,
      status:           withdrawals.status,
      amount:           withdrawals.amount,
      rejection_reason: withdrawals.rejection_reason,
      created_at:       withdrawals.created_at,
    })
    .from(withdrawals)
    .where(
      and(
        eq(withdrawals.id, withdrawalId),
        eq(withdrawals.user_id, auth.claims.sub as string)
      )
    )
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let status = row.status;
  let reason = row.rejection_reason ?? null;

  if (status === "processing" && shouldQuery(row.id, row.created_at)) {
    const result = await reconcileSolidPayWithdrawal(row.id);
    if (result.changed) {
      status = result.status;
      reason = result.reason;
      lastQueryAt.delete(row.id);
    }
  }

  // "rejected" carries a reason an admin wrote for this player, so it is shown
  // as-is. "failed" carries the provider's integrator-facing text, which is
  // translated before it ever reaches a customer. The raw text stays on the row
  // for the admin desk either way.
  const playerReason =
    status === "failed" ? describePayoutFailure(reason).player : reason;

  return NextResponse.json({ status, amount: row.amount, rejection_reason: playerReason });
}

function shouldQuery(id: string, createdAt: Date): boolean {
  if (Date.now() - new Date(createdAt).getTime() < RECONCILE_AFTER_MS) return false;

  const last = lastQueryAt.get(id) ?? 0;
  if (Date.now() - last < RECONCILE_INTERVAL_MS) return false;

  lastQueryAt.set(id, Date.now());
  return true;
}

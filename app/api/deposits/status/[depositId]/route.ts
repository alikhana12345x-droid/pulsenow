import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { deposits } from "@/lib/supabase/schema";
import { eq, and } from "drizzle-orm";
import { reconcileSolidPayDeposit } from "@/lib/finance/solidpay-reconcile";

/**
 * SolidPay only sends collection callbacks for *successful* orders, so a
 * declined or abandoned payment would sit pending forever on the webhook
 * alone. The client already polls this endpoint every few seconds, so it
 * doubles as the reconciliation loop.
 *
 * Queries stay sparse — SolidPay throttles bursts hard and the webhook is the
 * primary path.
 */
const RECONCILE_AFTER_MS = 15_000;
const RECONCILE_INTERVAL_MS = 20_000;

// Per-instance throttle so a fast poll can't turn into a query flood.
const lastQueryAt = new Map<string, number>();

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ depositId: string }> }
) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { depositId } = await params;

  const [deposit] = await db
    .select({
      id: deposits.id,
      status: deposits.status,
      amount: deposits.amount,
      created_at: deposits.created_at,
    })
    .from(deposits)
    .where(and(eq(deposits.id, depositId), eq(deposits.user_id, auth.claims.sub as string)))
    .limit(1);

  if (!deposit) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let status = deposit.status;

  if (status === "pending" && shouldQuery(deposit.id, deposit.created_at)) {
    const result = await reconcileSolidPayDeposit(deposit.id);
    status = result.status;
    if (result.changed) lastQueryAt.delete(deposit.id);
  }

  return NextResponse.json({ status, amount: deposit.amount });
}

function shouldQuery(id: string, createdAt: Date): boolean {
  if (Date.now() - new Date(createdAt).getTime() < RECONCILE_AFTER_MS) return false;

  const last = lastQueryAt.get(id) ?? 0;
  if (Date.now() - last < RECONCILE_INTERVAL_MS) return false;

  lastQueryAt.set(id, Date.now());
  return true;
}

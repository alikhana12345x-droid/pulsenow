"use server";

import { db } from "@/lib/db";
import { withdrawals } from "@/lib/supabase/schema";
import { eq, desc } from "drizzle-orm";

export async function getUserWithdrawals(userId: string) {
  return db
    .select()
    .from(withdrawals)
    .where(eq(withdrawals.user_id, userId))
    .orderBy(desc(withdrawals.created_at))
    .limit(20);
}

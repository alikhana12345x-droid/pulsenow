import { NextRequest, NextResponse } from "next/server";
import { and, count, eq, ilike, or, sql } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { bets, profiles, wallets } from "@/lib/supabase/schema";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ players: [] });

  const rows = await db
    .select({
      id:           profiles.id,
      username:     profiles.username,
      display_name: profiles.display_name,
      avatar_url:   profiles.avatar_url,
      role:         profiles.role,
      kyc_status:   profiles.kyc_status,
      is_banned:    profiles.is_banned,
      created_at:   profiles.created_at,
    })
    .from(profiles)
    .where(
      and(
        eq(profiles.role, "player"),
        or(
          ilike(profiles.username, `%${q}%`),
          sql`${profiles.id}::text ILIKE ${q + "%"}`,
        ),
      ),
    )
    .limit(12);

  if (rows.length === 0) return NextResponse.json({ players: [] });

  const enriched = await Promise.all(
    rows.map(async (p) => {
      const [walletRes, betCountRes] = await Promise.allSettled([
        db
          .select()
          .from(wallets)
          .where(eq(wallets.user_id, p.id))
          .limit(1)
          .then((r) => r[0] ?? null),
        db
          .select({ c: count() })
          .from(bets)
          .where(eq(bets.user_id, p.id))
          .then((r) => Number(r[0]?.c ?? 0)),
      ]);
      return {
        ...p,
        created_at: p.created_at.toISOString(),
        wallet: walletRes.status === "fulfilled" ? walletRes.value : null,
        betCount: betCountRes.status === "fulfilled" ? betCountRes.value : 0,
      };
    }),
  );

  return NextResponse.json({ players: enriched });
}

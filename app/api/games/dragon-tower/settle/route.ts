import { NextRequest, NextResponse } from "next/server";
import { settleDragonTowerRound } from "@/lib/actions/games";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await settleDragonTowerRound(body);
    return NextResponse.json(result);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Something went wrong";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

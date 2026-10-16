import type { NextRequest } from "next/server";
import { verifyNotifySign } from "./solidpay";

/**
 * Shared parsing/authentication for SolidPay async notifications.
 *
 * The signature is the real gate — it needs the API key, which only SolidPay
 * and this server hold. The documented source IP (52.74.200.89) is checked as
 * defence in depth but only rejects when SOLID_PAY_ENFORCE_CALLBACK_IP is on,
 * because a tunnel or proxy that rewrites the client IP would otherwise drop
 * genuine payment callbacks.
 */

export type NotificationRead =
  | { ok: true; data: Record<string, unknown>; raw: string }
  | { ok: false; status: number; reason: string; raw: string };

function clientIp(req: NextRequest): string | null {
  // Netlify sets this from the TCP connection itself; unlike X-Forwarded-For,
  // the caller can't prepend a value to it.
  const netlify = req.headers.get("x-nf-client-connection-ip");
  if (netlify) return netlify.trim();
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return req.headers.get("x-real-ip")?.trim() || null;
}

function ipAllowed(ip: string | null): boolean {
  const allow = (process.env.SOLID_PAY_CALLBACK_IPS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!allow.length || !ip) return true;
  return allow.includes(ip);
}

export async function readNotification(req: NextRequest, tag: string): Promise<NotificationRead> {
  const raw = (await req.text()).trim();

  const ip = clientIp(req);
  if (!ipAllowed(ip)) {
    const enforce = process.env.SOLID_PAY_ENFORCE_CALLBACK_IP === "true";
    console.warn(`[${tag}] callback from unexpected IP ${ip}${enforce ? " — rejected" : " — allowed (enforcement off)"}`);
    if (enforce) return { ok: false, status: 403, reason: "IP not allowed", raw };
  }

  if (!raw) return { ok: false, status: 400, reason: "empty body", raw };

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return { ok: false, status: 400, reason: "body is not JSON", raw };
  }

  // Documented envelope is { code, msg, data: {...} }; a flat body is accepted
  // too so a payload shape change cannot silently drop a settlement.
  const envelope = payload as { data?: unknown };
  const data = (
    envelope && typeof envelope === "object" && envelope.data && typeof envelope.data === "object"
      ? envelope.data
      : payload
  ) as Record<string, unknown>;

  if (!data || typeof data !== "object") {
    return { ok: false, status: 400, reason: "missing data object", raw };
  }

  if (!verifyNotifySign(data)) {
    console.warn(`[${tag}] signature mismatch`, raw.slice(0, 300));
    return { ok: false, status: 401, reason: "invalid signature", raw };
  }

  return { ok: true, data, raw };
}

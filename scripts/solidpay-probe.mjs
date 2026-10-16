// Read-only credential check against the live SolidPay API.
//
//   node scripts/solidpay-probe.mjs
//
// Queries an order number that cannot exist. A reply of "OrderNo not exist"
// means the base URL, merchant number, signature and API key are all accepted —
// nothing is created and no money moves. A signature/merchant error means the
// credentials in .env.local are wrong.
//
// Signing is written out inline on purpose: this probe tests the *credentials*,
// so it must not depend on the app's own implementation being correct.
import pkg from "@next/env";
const { loadEnvConfig } = pkg;
loadEnvConfig(process.cwd());

import crypto from "crypto";

const BASE = (process.env.SOLID_PAY_BASE_URL ?? "https://soliapi.xyz").replace(/\/+$/, "");
const KEY = process.env.SOLID_PAY_API_KEY ?? "";
const MERCH = process.env.SOLID_PAY_MERCHANT_NO ?? "";
const PROXY_SECRET = process.env.SOLID_PAY_PROXY_SECRET ?? "";

if (!KEY || !MERCH) {
  console.error("SOLID_PAY_API_KEY / SOLID_PAY_MERCHANT_NO missing from .env.local");
  process.exit(1);
}

const sign = (params) =>
  crypto
    .createHash("md5")
    .update(
      Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join("&") + KEY,
      "utf8"
    )
    .digest("hex");

async function probe(path) {
  const params = { merchNo: MERCH, orderNo: "probe0000000000000000000000test" };
  const body = { ...params, sign: sign(params) };
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(PROXY_SECRET ? { "X-Proxy-Secret": PROXY_SECRET } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    const text = (await res.text()).trim();
    console.log(`${path} → HTTP ${res.status} ${text.slice(0, 300) || "(empty body)"}`);
  } catch (err) {
    console.log(`${path} → request failed: ${err.message}`);
  }
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

console.log(`base=${BASE} merchNo=${MERCH} apiKey=${KEY.slice(0, 4)}…${KEY.slice(-4)}\n`);

// Spaced out — SolidPay throttles bursts with {"code":2058,"msg":"API Rate limited!"}.
await probe("/api/payIn/query");
await pause(4000);
await probe("/api/payOut/query");

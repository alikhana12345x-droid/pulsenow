import crypto from "crypto";

/**
 * SolidPay (soliapi.xyz) — PKR aggregator used in "auto" payment mode.
 * Covers collection (payIn) and payout on behalf (payOut) for JazzCash,
 * Easypaisa and local banks.
 *
 * Docs: https://www.showdoc.com.cn/2598842441501259 (access password 666888)
 *
 * Signing: sort every parameter lexicographically, join as `k=v` with "&", then
 * md5(source + api_key) with NO separator before the key. Only the fields
 * inside `data` participate for async notifications.
 */

const BASE_URL = (process.env.SOLID_PAY_BASE_URL ?? "https://soliapi.xyz").replace(/\/+$/, "");
const API_KEY = process.env.SOLID_PAY_API_KEY ?? "";
const MERCH_NO = process.env.SOLID_PAY_MERCHANT_NO ?? "";
const TIMEOUT_MS = 20_000;

/**
 * Vercel has no static outbound IP, so payOut (IP-whitelisted by SolidPay) goes
 * through a fixed-IP proxy — SOLID_PAY_BASE_URL points at it. The proxy only
 * forwards requests carrying this secret. See infra/solidpay-proxy/README.md.
 */
const PROXY_SECRET = process.env.SOLID_PAY_PROXY_SECRET ?? "";
const REQUEST_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  ...(PROXY_SECRET ? { "X-Proxy-Secret": PROXY_SECRET } : {}),
};

export type SolidPayChannel = "Jazzcash" | "Easypaisa" | "Jazzcash_Direct" | "Easypaisa_Direct";

/** Player-facing gateway id → the collection channels SolidPay accepts. */
export const CHANNELS_BY_GATEWAY: Record<string, { hosted: SolidPayChannel; direct: SolidPayChannel }> = {
  jazzcash: { hosted: "Jazzcash", direct: "Jazzcash_Direct" },
  easypaisa: { hosted: "Easypaisa", direct: "Easypaisa_Direct" },
};

/** Gateways this provider can serve — everything else stays on its own rails. */
export const SOLIDPAY_GATEWAYS = Object.keys(CHANNELS_BY_GATEWAY);

/**
 * The payment_accounts.gateway value for the SolidPay routing row. It is an
 * aggregator, not a wallet the player pays into directly, so it must never
 * surface as a selectable method on the manual checkout.
 */
export const SOLIDPAY_GATEWAY_ID = "solidpay";

/**
 * Hosted checkout unless the admin explicitly picked the direct channel.
 * Unknown values fall back to hosted — the safer default.
 */
export function resolveChannel(
  gateway: string,
  creds: { jazzcash_channel?: string; easypaisa_channel?: string }
): SolidPayChannel {
  const options = CHANNELS_BY_GATEWAY[gateway];
  const configured = gateway === "jazzcash" ? creds.jazzcash_channel : creds.easypaisa_channel;
  return configured === options.direct ? options.direct : options.hosted;
}

/**
 * Only the direct channels need the player's wallet number up front. The
 * hosted cashier collects it on its own page, so asking for it twice is just
 * friction.
 */
export function channelNeedsAccount(channel: SolidPayChannel): boolean {
  return channel.endsWith("_Direct");
}

export function isSolidPayConfigured(): boolean {
  return Boolean(API_KEY && MERCH_NO);
}

export function solidPayMerchNo(override?: string | null): string {
  const trimmed = typeof override === "string" ? override.trim() : "";
  return trimmed || MERCH_NO;
}

/**
 * Callback URL SolidPay should post to. Falls back to null when APP_BASE_URL is
 * unset — the notify URLs saved in the merchant backend are then used instead.
 */
export function solidPayNotifyUrl(kind: "payin" | "payout"): string | null {
  const base = (process.env.APP_BASE_URL ?? "").trim().replace(/\/+$/, "");
  if (!base) return null;
  return `${base}/api/webhooks/solidpay/${kind}`;
}

// ── Order state ──────────────────────────────────────────────────────────────
// 0 initialization · 1 success · 2 fail · 3 processing
// 4 closed/rejected · 5 refunded (reversed) · 6 payment in progress
export type OrderOutcome = "success" | "failed" | "reversed" | "pending";

export function classifyOrderState(state: unknown): OrderOutcome {
  switch (String(state ?? "").trim()) {
    case "1":
      return "success";
    case "2":
    case "4":
      return "failed";
    case "5":
      return "reversed";
    default:
      // 0 / 3 / 6 / anything unrecognised — never assume failure.
      return "pending";
  }
}

// ── Signing ──────────────────────────────────────────────────────────────────

function md5(input: string): string {
  return crypto.createHash("md5").update(input, "utf8").digest("hex");
}

function signSource(params: Record<string, unknown>, dropEmpty = false): string {
  return Object.keys(params)
    .filter((k) => k !== "sign")
    .filter((k) => params[k] !== undefined && params[k] !== null)
    .filter((k) => !dropEmpty || String(params[k]) !== "")
    .sort()
    .map((k) => `${k}=${String(params[k])}`)
    .join("&");
}

export function signParams(params: Record<string, unknown>): string {
  return md5(signSource(params) + API_KEY);
}

/**
 * Verify an async notification. The docs warn against hard-coding the field
 * list, so every key present in `data` is signed dynamically. Some payloads
 * carry empty-valued fields that the sender omitted when signing, so a
 * mismatch is retried without them before a genuine callback is rejected.
 */
export function verifyNotifySign(data: Record<string, unknown>): boolean {
  const provided = String(data?.sign ?? "").trim().toLowerCase();
  if (!provided || !API_KEY) return false;
  if (md5(signSource(data) + API_KEY) === provided) return true;
  return md5(signSource(data, true) + API_KEY) === provided;
}

// ── Transport ────────────────────────────────────────────────────────────────

/**
 * A timeout, an empty body or malformed JSON does NOT mean the order failed —
 * the docs are emphatic about this. Only a well-formed JSON with code != 0 is a
 * definitive failure; everything else is "unknown" and must be treated as still
 * processing, then resolved by a later query.
 */
export type SolidPayResult<T> =
  | { outcome: "ok"; data: T; msg: string }
  | { outcome: "failed"; msg: string }
  | { outcome: "unknown"; msg: string };

/**
 * Throttling comes back as a normal non-zero code (`{"code":2058,"msg":"API
 * Rate limited!"}`) even though nothing was processed. Treating that as a
 * definitive failure would fail live deposits and refund live payouts, so it is
 * retried and then reported as "unknown".
 */
const RETRYABLE_CODES = new Set([2058]);
const RETRYABLE_MSG = /rate limit|too many request|please try again|system busy/i;
/** "Order already exists" — proof a retried request did land the first time. */
const DUPLICATE_MSG = /already exist|duplicate|repeat(ed)? order/i;

const RETRY_BACKOFF_MS = [1_500, 4_000];

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function post<T>(path: string, params: Record<string, string>): Promise<SolidPayResult<T>> {
  const body = JSON.stringify({ ...params, sign: signParams(params) });
  let attempt = 0;

  for (;;) {
    const result = await postOnce<T>(path, body, attempt > 0);
    const retryable = result.outcome === "unknown" && result.msg.startsWith("retryable:");

    if (!retryable || attempt >= RETRY_BACKOFF_MS.length) {
      return retryable ? { outcome: "unknown", msg: result.msg.replace("retryable: ", "") } : result;
    }

    await wait(RETRY_BACKOFF_MS[attempt]);
    attempt += 1;
  }
}

async function postOnce<T>(
  path: string,
  body: string,
  isRetry: boolean
): Promise<SolidPayResult<T>> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: REQUEST_HEADERS,
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (err) {
    return { outcome: "unknown", msg: err instanceof Error ? err.message : "network error" };
  }

  const text = (await res.text()).trim();
  if (!text) return { outcome: "unknown", msg: `empty response (HTTP ${res.status})` };

  let json: { code?: unknown; msg?: unknown; data?: unknown };
  try {
    json = JSON.parse(text);
  } catch {
    return { outcome: "unknown", msg: `non-JSON response (HTTP ${res.status}): ${text.slice(0, 160)}` };
  }

  if (json?.code === undefined || json?.code === null) {
    return { outcome: "unknown", msg: `response missing code (HTTP ${res.status})` };
  }

  const code = Number(json.code);
  const msg = String(json.msg ?? `code ${json.code}`);

  if (code !== 0) {
    if (RETRYABLE_CODES.has(code) || RETRYABLE_MSG.test(msg)) {
      return { outcome: "unknown", msg: `retryable: ${msg}` };
    }
    // A duplicate-order rejection on a retry means the first attempt did get
    // through: the order is live, so it must not be written off as failed.
    if (isRetry && DUPLICATE_MSG.test(msg)) {
      return { outcome: "unknown", msg: `order already accepted on an earlier attempt (${msg})` };
    }
    return { outcome: "failed", msg };
  }

  return { outcome: "ok", data: (json.data ?? {}) as T, msg };
}

/**
 * The docs write the collection inquiry as `/api/payInQuery`, but that path
 * 404s on the live host — `/api/payIn/query` is the one that answers. The
 * documented spelling is kept as a fallback in case they align them later.
 */
async function postWithFallback<T>(
  paths: [string, string],
  params: Record<string, string>
): Promise<SolidPayResult<T>> {
  const first = await post<T>(paths[0], params);
  if (first.outcome !== "unknown") return first;
  const second = await post<T>(paths[1], params);
  return second.outcome === "unknown" ? first : second;
}

// ── Collection (deposits) ────────────────────────────────────────────────────

export interface PayInData {
  amount?: string;
  orderNo?: string;
  merchNo?: string;
  currency?: string;
  code_url?: string;
  sign?: string;
}

export async function payIn(input: {
  orderNo: string;
  amount: number;
  channel: SolidPayChannel;
  merchNo?: string | null;
  currency?: string;
  /** Player's wallet number — required by the *_Direct channels. */
  payAccount?: string | null;
  notifyUrl?: string | null;
}): Promise<SolidPayResult<PayInData>> {
  const params: Record<string, string> = {
    amount: input.amount.toFixed(2),
    currency: input.currency ?? "PKR",
    merchNo: solidPayMerchNo(input.merchNo),
    orderNo: input.orderNo,
    outChannel: input.channel,
  };
  if (input.payAccount) params.payAccount = input.payAccount;
  if (input.notifyUrl) params.notifyUrl = input.notifyUrl;

  return post<PayInData>("/api/payIn", params);
}

export interface OrderQueryData {
  amount?: string;
  orderNo?: string;
  merchNo?: string;
  businessNo?: string;
  orderState?: string;
  msg?: string;
  sign?: string;
}

export async function payInQuery(
  orderNo: string,
  merchNo?: string | null
): Promise<SolidPayResult<OrderQueryData>> {
  return postWithFallback<OrderQueryData>(["/api/payIn/query", "/api/payInQuery"], {
    merchNo: solidPayMerchNo(merchNo),
    orderNo,
  });
}

// ── Payout on behalf (withdrawals) ───────────────────────────────────────────

export interface PayOutData {
  amount?: string;
  orderNo?: string;
  merchNo?: string;
  orderState?: string;
}

export async function payOut(input: {
  orderNo: string;
  amount: number;
  /** Payee name — required by SolidPay. */
  acctName: string;
  /** "JAZZCASH" | "EASYPAISA" | numeric bank code. */
  acctCode: string;
  /** Wallet number or bank account number. */
  acctNo: string;
  /** Mandatory when paying out to a bank account (03xx format). */
  mobile?: string | null;
  merchNo?: string | null;
  currency?: string;
  notifyUrl?: string | null;
}): Promise<SolidPayResult<PayOutData>> {
  const params: Record<string, string> = {
    acctCode: input.acctCode,
    acctName: input.acctName,
    acctNo: input.acctNo,
    amount: input.amount.toFixed(2),
    currency: input.currency ?? "PKR",
    merchNo: solidPayMerchNo(input.merchNo),
    orderNo: input.orderNo,
  };
  if (input.mobile) params.mobile = input.mobile;
  if (input.notifyUrl) params.notifyUrl = input.notifyUrl;

  return post<PayOutData>("/api/payOut", params);
}

export async function payOutQuery(
  orderNo: string,
  merchNo?: string | null
): Promise<SolidPayResult<OrderQueryData>> {
  return postWithFallback<OrderQueryData>(["/api/payOut/query", "/api/payOutQuery"], {
    merchNo: solidPayMerchNo(merchNo),
    orderNo,
  });
}

// ── Failure messages ─────────────────────────────────────────────────────────

export type PayoutFailure = {
  /** Safe to show a player. Never the provider's raw text. */
  player: string;
  /** True only when correcting their own input would actually fix it. */
  playerFixable: boolean;
};

const NAME_PROBLEM = /acct.?name|account.?name|holder|payee|name.*(mismatch|error|invalid|wrong)/i;
const ACCOUNT_PROBLEM = /acct.?no|account.?(no|number)|card.?(no|number)|not exist|invalid account|wrong account/i;

/**
 * Translate a provider rejection into something a player should read.
 *
 * The raw text is written for integrators, not customers — "IP error",
 * "API Rate limited!", sometimes Chinese — and most of it describes problems on
 * our side or the provider's. Telling a player to "check your details" when
 * their details were fine is how support queues fill up, so only genuine
 * input problems say that. The raw text still goes to the logs, the row's
 * metadata and the admin desk.
 */
export function describePayoutFailure(raw: string | null | undefined): PayoutFailure {
  const msg = String(raw ?? "").trim();

  if (NAME_PROBLEM.test(msg)) {
    return {
      player:
        "The account holder name didn't match that account. Check it matches your wallet exactly, then try again.",
      playerFixable: true,
    };
  }

  if (ACCOUNT_PROBLEM.test(msg)) {
    return {
      player: "That account number wasn't accepted. Double-check it and try again.",
      playerFixable: true,
    };
  }

  return {
    player:
      "We couldn't complete this payout right now. Your balance has been restored — please try again shortly, or contact support if it keeps happening.",
    playerFixable: false,
  };
}

/**
 * A query that definitively says "no such order" — the docs single this out as
 * the one response that proves the order was never created.
 */
export function isOrderNotFound(result: SolidPayResult<unknown>): boolean {
  return result.outcome === "failed" && /orderno not exist/i.test(result.msg);
}

/**
 * SolidPay addresses Pakistani wallets in local 03xx form (see the payOut
 * examples), so international prefixes are folded back before sending.
 */
export function normalizePkMobile(input: string): string {
  const digits = input.replace(/[^\d]/g, "");
  if (digits.startsWith("92")) return `0${digits.slice(2)}`;
  if (digits.startsWith("0")) return digits;
  if (digits.length === 10) return `0${digits}`;
  return digits;
}

// ── Order numbers ────────────────────────────────────────────────────────────
// orderNo is String(10,35) and a dashed UUID is 36 chars, so the hex form of
// our row id is used — still unique, still reversible, and 32 chars long.

export function toOrderNo(rowId: string): string {
  return rowId.replace(/-/g, "").toLowerCase();
}

export function orderNoToRowId(orderNo: string): string | null {
  const hex = orderNo.trim().toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) return null;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

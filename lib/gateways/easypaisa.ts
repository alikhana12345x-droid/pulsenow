import crypto from "crypto";

export interface EasypaisaCredentials {
  store_id: string;
  hash_key: string;
  sandbox?: boolean;
}

const API_URL = {
  sandbox: "https://easypaisasandbox.pk/easypaisaop/api/v1/payment/initPushTxn",
  prod:    "https://easypaisa.com.pk/easypaisaop/api/v1/payment/initPushTxn",
};

function computeHash(params: Record<string, string>, key: string): string {
  const str = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join("&");
  return crypto.createHmac("sha256", Buffer.from(key)).update(str).digest("hex");
}

export async function initiateEasypaisa(
  creds: EasypaisaCredentials,
  customerPhone: string,
  amountPKR: number,
  orderId: string
) {
  const params: Record<string, string> = {
    orderId,
    storeId:           creds.store_id,
    transactionAmount: amountPKR.toFixed(2),
    transactionType:   "MA",
    mobileAccountNo:   customerPhone,
    emailAddress:      "",
  };
  params.merchantHashedReq = computeHash(params, creds.hash_key);

  const url = creds.sandbox ? API_URL.sandbox : API_URL.prod;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  const data = await res.json();
  if (data.responseCode !== "0000" && data.responseCode !== "0001") {
    throw new Error(data.responseDesc ?? "Easypaisa initiation failed");
  }

  return { txnRef: orderId, externalRef: data.transactionId ?? orderId };
}

export async function payoutMobileAccount(
  creds: EasypaisaCredentials,
  recipientPhone: string,
  amountPKR: number,
  withdrawalId: string
): Promise<{ txnRef: string; externalRef: string }> {
  const orderId = withdrawalId.replace(/-/g, "").slice(0, 20);
  const params: Record<string, string> = {
    orderId,
    storeId:           creds.store_id,
    transactionAmount: amountPKR.toFixed(2),
    transactionType:   "MA",
    mobileAccountNo:   recipientPhone,
    emailAddress:      "",
  };
  params.merchantHashedReq = computeHash(params, creds.hash_key);

  const disbursementUrl = creds.sandbox
    ? "https://easypaisasandbox.pk/easypaisaop/api/v1/disbursement/sendMoney"
    : "https://easypaisa.com.pk/easypaisaop/api/v1/disbursement/sendMoney";

  const res = await fetch(disbursementUrl, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(params),
  });

  const data = await res.json();
  if (data.responseCode !== "0000") {
    throw new Error(data.responseDesc ?? "Easypaisa payout failed");
  }

  return { txnRef: orderId, externalRef: data.transactionId ?? orderId };
}

export function verifyEasypaisaWebhook(
  payload: Record<string, string>,
  key: string
): boolean {
  const { merchantHashedReq, ...rest } = payload;
  return computeHash(rest, key) === merchantHashedReq;
}

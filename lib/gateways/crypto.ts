import crypto from "crypto";

export interface CryptoCredentials {
  wallet_address: string;
  network: string;          // TRC20, ERC20, BEP20
  webhook_secret?: string;  // HMAC secret from Tatum.io / Moralis
}

/** Verify Tatum.io-style webhook signature (x-payload-hash header) */
export function verifyCryptoWebhook(
  rawBody: string,
  signature: string,
  secret: string
): boolean {
  const expected = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
  return expected === signature;
}

/**
 * Generate a Tatum.io subscription request body.
 * Call this after saving a crypto payment_account to auto-subscribe.
 * POST https://api.tatum.io/v3/subscription with x-api-key header.
 */
export function tatumSubscriptionBody(
  address: string,
  network: string,
  webhookUrl: string
) {
  const chain = network === "TRC20" ? "TRON" : network === "BEP20" ? "BSC" : "ETH";
  return {
    type: "ADDRESS_TRANSACTION",
    attr: {
      address,
      chain,
      url: webhookUrl,
    },
  };
}

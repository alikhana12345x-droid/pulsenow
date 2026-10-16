import crypto from "crypto";

export interface JazzCashCredentials {
  merchant_id: string;
  password: string;
  integrity_salt: string;
  sandbox?: boolean;
}

const API_URL = {
  sandbox: "https://sandbox.jazzcash.com.pk/ApplicationAPI/API/2.0/Purchase/DoMWalletTransaction",
  prod:    "https://payments.jazzcash.com.pk/ApplicationAPI/API/2.0/Purchase/DoMWalletTransaction",
};

function txnDateTime(): string {
  return new Date().toISOString().replace(/[-T:.Z]/g, "").slice(0, 14);
}

function secureHash(params: Record<string, string>, salt: string): string {
  const sorted = Object.keys(params).sort().map((k) => params[k]).join("&");
  return crypto.createHmac("sha256", salt).update(`${salt}&${sorted}`).digest("hex").toUpperCase();
}

export function newTxnRef(): string {
  return `T${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

export async function initiateJazzCash(
  creds: JazzCashCredentials,
  customerMSISDN: string,
  amountPKR: number,
  billRef: string        // depositId used as bill reference for webhook matching
) {
  const txnRef = newTxnRef();
  const params: Record<string, string> = {
    pp_Version:       "2.0",
    pp_TxnType:       "MWALLET",
    pp_Language:      "EN",
    pp_MerchantID:    creds.merchant_id,
    pp_Password:      creds.password,
    pp_TxnRefNo:      txnRef,
    pp_Amount:        String(Math.round(amountPKR * 100)), // paisa
    pp_TxnCurrency:   "PKR",
    pp_TxnDateTime:   txnDateTime(),
    pp_BillReference: billRef,
    pp_Description:   "PulseNow deposit",
    pp_TxnExpiryDateTime: txnDateTime(),
    pp_MSISDN:        customerMSISDN.replace(/^0/, "92"),  // 03xx → 923xx
    pp_MerchantMPIN:  "",
    pp_SubMerchantID: "",
    ppmpf_1:          "",
    ppmpf_2:          "",
    ppmpf_3:          "",
    ppmpf_4:          "",
    ppmpf_5:          "",
  };
  params.pp_SecureHash = secureHash(params, creds.integrity_salt);

  const url = creds.sandbox ? API_URL.sandbox : API_URL.prod;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  const data = await res.json();
  // "000" = approved/pending, "121" = initiated
  if (!["000", "121"].includes(data.pp_ResponseCode)) {
    throw new Error(data.pp_ResponseMessage ?? "JazzCash initiation failed");
  }

  return { txnRef, externalRef: data.pp_TxnRefNo ?? txnRef };
}

export async function payoutMobileWallet(
  creds: JazzCashCredentials,
  recipientMSISDN: string,
  amountPKR: number,
  withdrawalId: string
): Promise<{ txnRef: string; externalRef: string }> {
  const txnRef = newTxnRef();
  const params: Record<string, string> = {
    pp_Version:           "2.0",
    pp_TxnType:           "MWALLET",
    pp_Language:          "EN",
    pp_MerchantID:        creds.merchant_id,
    pp_Password:          creds.password,
    pp_TxnRefNo:          txnRef,
    pp_Amount:            String(Math.round(amountPKR * 100)),
    pp_TxnCurrency:       "PKR",
    pp_TxnDateTime:       txnDateTime(),
    pp_BillReference:     withdrawalId,
    pp_Description:       "PulseNow withdrawal",
    pp_TxnExpiryDateTime: txnDateTime(),
    pp_MSISDN:            recipientMSISDN.replace(/^0/, "92"),
    pp_MerchantMPIN:      "",
    pp_SubMerchantID:     "",
  };
  params.pp_SecureHash = secureHash(params, creds.integrity_salt);

  const url = creds.sandbox ? API_URL.sandbox : API_URL.prod;
  const res = await fetch(url, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(params),
  });

  const data = await res.json();
  if (!["000", "121"].includes(data.pp_ResponseCode)) {
    throw new Error(data.pp_ResponseMessage ?? "JazzCash payout failed");
  }

  return { txnRef, externalRef: data.pp_TxnRefNo ?? txnRef };
}

export function verifyJazzCashIPN(
  params: Record<string, string>,
  salt: string
): boolean {
  const { pp_SecureHash, ...rest } = params;
  return secureHash(rest, salt) === pp_SecureHash;
}

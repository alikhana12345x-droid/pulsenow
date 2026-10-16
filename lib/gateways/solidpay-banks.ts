/**
 * SolidPay payout destinations (`acctCode`).
 *
 * Mobile wallets use the literal strings below; banks use the numeric codes
 * from the provider's "New bank code (this is the one used for integration)"
 * table. Bank payouts additionally require `mobile` (03xx format).
 *
 * Source: lib/docs/payment/payment_on_behalf.md
 */

export const WALLET_ACCT_CODES: Record<string, string> = {
  jazzcash: "JAZZCASH",
  easypaisa: "EASYPAISA",
};

export const SOLIDPAY_BANKS: { code: string; name: string }[] = [
  { code: "20", name: "ABHI FINANCE SERVICES LIMITED" },
  { code: "23", name: "AFT" },
  { code: "13", name: "AFT IBFT" },
  { code: "96", name: "Advans" },
  { code: "28", name: "Al Meezan Investment Management Limited" },
  { code: "46", name: "AlHabib" },
  { code: "72", name: "Albarka" },
  { code: "43", name: "Alfalah" },
  { code: "48", name: "Allied" },
  { code: "76", name: "Apna" },
  { code: "47", name: "Askari" },
  { code: "87", name: "BOK" },
  { code: "105", name: "BYKEA" },
  { code: "44", name: "BankIslami" },
  { code: "67", name: "Burj" },
  { code: "15", name: "Central Directorate of National Savings" },
  { code: "27", name: "Central Directorate of National Savings (CDNS)" },
  { code: "122", name: "Central Directorate of National Savings (CDNS) – 1IBFT IMD Addition" },
  { code: "57", name: "Citi" },
  { code: "56", name: "DubaiIslamic" },
  { code: "110", name: "EZ wage" },
  { code: "86", name: "FINCA" },
  { code: "97", name: "FINJA" },
  { code: "90", name: "FWBL" },
  { code: "52", name: "Faysal" },
  { code: "92", name: "First Microfinance Bank" },
  { code: "49", name: "HBL" },
  { code: "102", name: "HBL ASSET MANAGEMENT" },
  { code: "118", name: "Habib Metro Bank – Bulk 1IBFT" },
  { code: "77", name: "HabibMetro" },
  { code: "113", name: "Humrah Financial Services" },
  { code: "95", name: "ICBC" },
  { code: "75", name: "JS" },
  { code: "51", name: "KASB" },
  { code: "94", name: "KBL" },
  { code: "22", name: "KEENU" },
  { code: "24", name: "KEENU Bank" },
  { code: "14", name: "KEENU – IMD and 1IBFT Screen Addition" },
  { code: "115", name: "Keenu1" },
  { code: "79", name: "MCB" },
  { code: "100", name: "MCB-Arif Habib" },
  { code: "91", name: "MIB" },
  { code: "66", name: "Meezan" },
  { code: "10", name: "MobilinkBank Pakistan" },
  { code: "99", name: "NAYAPAY" },
  { code: "89", name: "NBP" },
  { code: "98", name: "NBP Fund Management Limited" },
  { code: "93", name: "NBP1" },
  { code: "65", name: "NIB" },
  { code: "88", name: "NRSP" },
  { code: "109", name: "National Bank" },
  { code: "114", name: "Numbers Private Limited" },
  { code: "55", name: "PayMax" },
  { code: "104", name: "PayMax1" },
  { code: "45", name: "PunjabBank" },
  { code: "11", name: "SADAPAY" },
  { code: "64", name: "SCB" },
  { code: "50", name: "SEEDCREED Financial Services Limited" },
  { code: "30", name: "SIMPAISA" },
  { code: "83", name: "SIND" },
  { code: "71", name: "Samba" },
  { code: "68", name: "Silk" },
  { code: "73", name: "SindhBank" },
  { code: "61", name: "Soneri" },
  { code: "58", name: "Summit" },
  { code: "12", name: "TAG" },
  { code: "103", name: "TezPAy" },
  { code: "60", name: "UBL" },
  { code: "85", name: "UPaisa" },
  { code: "70", name: "Waseela" },
  { code: "1", name: "Waseela bank" },
  { code: "101", name: "ZTBL1" },
  { code: "42", name: "Zarai Taraqiati Bank" },
];

const BANK_CODES = new Set(SOLIDPAY_BANKS.map((b) => b.code));

export function isBankCode(code: string): boolean {
  return BANK_CODES.has(code.trim());
}

export function bankName(code: string): string | null {
  return SOLIDPAY_BANKS.find((b) => b.code === code.trim())?.name ?? null;
}

/**
 * Resolve a withdrawal method to the `acctCode` SolidPay expects. Accepts the
 * wallet ids used across the app ("jazzcash"/"easypaisa") or a raw bank code so
 * bank payouts can be enabled later without touching the gateway client.
 */
export function resolveAcctCode(method: string): string | null {
  const key = method.trim().toLowerCase();
  if (WALLET_ACCT_CODES[key]) return WALLET_ACCT_CODES[key];
  const bank = key.startsWith("bank_") ? key.slice(5) : key;
  return isBankCode(bank) ? bank : null;
}

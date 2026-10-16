/**
 * The mark shown beside a payment method's name in the deposit and withdraw
 * sheets. An account's own uploaded logo wins; otherwise each gateway falls back
 * to a default in public/brand/payments. The JazzCash and Easypaisa tiles are
 * each provider's official symbol (2025 JazzCash mark, Easypaisa "e") on white.
 */
const DEFAULT_LOGOS: Record<string, string> = {
  jazzcash: "/brand/payments/jazzcash.png",
  easypaisa: "/brand/payments/easypaisa.png",
  crypto_usdt: "/brand/payments/usdt.svg",
  crypto_eth: "/brand/payments/eth.svg",
};

/** The default logo file for a gateway, e.g. for drawing it onto a receipt image. */
export function paymentLogoSrc(gateway: string | null | undefined) {
  return (gateway && DEFAULT_LOGOS[gateway]) || null;
}

const LABELS: Record<string, string> = {
  jazzcash: "JazzCash",
  easypaisa: "Easypaisa",
  crypto_usdt: "USDT",
  crypto_eth: "ETH",
  solidpay: "SolidPay",
};

/** How a gateway / withdrawal method is written for people, e.g. "jazzcash" → "JazzCash". */
export function paymentMethodLabel(gateway: string | null | undefined) {
  if (!gateway) return "—";
  return LABELS[gateway] ?? gateway.charAt(0).toUpperCase() + gateway.slice(1);
}

export function PaymentMethodLogo({
  gateway,
  label,
  src,
  size = 36,
}: {
  gateway: string;
  /** Initials come from this when the gateway has no logo at all. */
  label: string;
  /** A per-account logo uploaded by an admin; takes precedence over the default. */
  src?: string | null;
  size?: number;
}) {
  const url = src || DEFAULT_LOGOS[gateway];
  const box = { width: size, height: size, borderRadius: Math.round(size * 0.25) };

  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" width={size} height={size} className="shrink-0 object-cover" style={box} />
  ) : (
    <span
      className="flex shrink-0 items-center justify-center border border-bp-accent/25 bg-bp-accent/10 font-black text-bp-accent"
      style={{ ...box, fontSize: Math.max(9, Math.round(size * 0.3)) }}
    >
      {label.slice(0, 2).toUpperCase()}
    </span>
  );
}

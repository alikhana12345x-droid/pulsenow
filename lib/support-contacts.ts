/**
 * Support contact channels an admin sets under Settings and players see on the
 * Support page. Every channel starts blank; a blank channel is simply not shown.
 *
 * Client-safe (no server imports) so the admin form and the server action
 * validate with the same rules.
 */

export type SupportContacts = {
  email: string;
  phone: string;
  whatsapp: string;
  telegram: string;
};

export type SupportChannel = keyof SupportContacts;

export const SUPPORT_CONTACTS_KEY = "support_contacts";

export const EMPTY_SUPPORT_CONTACTS: SupportContacts = {
  email: "",
  phone: "",
  whatsapp: "",
  telegram: "",
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TELEGRAM_PATTERN = /^[A-Za-z0-9_]{5,32}$/;

/** Accepts "@handle", "handle" or a t.me link, and returns the bare handle. */
function telegramHandle(value: string) {
  return value
    .trim()
    .replace(/^(https?:\/\/)?(www\.)?(t|telegram)\.me\//i, "")
    .replace(/^@/, "")
    .replace(/\/+$/, "");
}

function digitCount(value: string) {
  return value.replace(/\D/g, "").length;
}

/**
 * Trim and normalise each channel, returning per-channel errors for anything
 * that wouldn't make a working link. Blank is always valid.
 */
export function normalizeSupportContacts(input: Partial<SupportContacts>): {
  contacts: SupportContacts;
  errors: Partial<Record<SupportChannel, string>>;
} {
  const email = (input.email ?? "").trim();
  const phone = (input.phone ?? "").trim();
  const whatsapp = (input.whatsapp ?? "").trim();
  const telegramRaw = (input.telegram ?? "").trim();
  const telegram = telegramRaw ? telegramHandle(telegramRaw) : "";

  const errors: Partial<Record<SupportChannel, string>> = {};
  if (email && !EMAIL_PATTERN.test(email)) errors.email = "Enter a valid email address";
  for (const [key, value] of [["phone", phone], ["whatsapp", whatsapp]] as const) {
    if (!value) continue;
    if (!/^\+?[\d\s()-]+$/.test(value) || digitCount(value) < 7 || digitCount(value) > 15) {
      errors[key] = "Enter a phone number with country code, e.g. +92 300 1234567";
    }
  }
  if (telegram && !TELEGRAM_PATTERN.test(telegram)) {
    errors.telegram = "Enter a Telegram username like @PulseNowSupport";
  }

  return { contacts: { email, phone, whatsapp, telegram }, errors };
}

/** What a stored value looks like when it's read back — tolerant of missing keys. */
export function readSupportContacts(value: unknown): SupportContacts {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const str = (k: SupportChannel) => (typeof v[k] === "string" ? (v[k] as string) : "");
  return { email: str("email"), phone: str("phone"), whatsapp: str("whatsapp"), telegram: str("telegram") };
}

/** The label and link the Support page shows for a filled-in channel. */
export function supportChannelLink(channel: SupportChannel, value: string) {
  switch (channel) {
    case "email":
      return { display: value, href: `mailto:${value}` };
    case "phone":
      return { display: value, href: `tel:${value.replace(/[^\d+]/g, "")}` };
    case "whatsapp":
      return { display: value, href: `https://wa.me/${value.replace(/\D/g, "")}` };
    case "telegram":
      return { display: `@${value}`, href: `https://t.me/${value}` };
  }
}

"use client";

import { useEffect, useId, useState } from "react";
import { Download, Loader2, MessageCircle, Share2 } from "lucide-react";
import { Modal } from "../admin-modal";
import { paymentLogoSrc, paymentMethodLabel } from "@/components/payment-method-logo";
import { renderReceipt, type ReceiptOutcome } from "./payment-receipt";
import { APP_TIME_ZONE } from "@/lib/time";

/** Everything the payment-status dialog shows, flattened on the server. */
export type ShareableWithdrawal = {
  id: string;
  amount: string;
  currency: string;
  method: string;
  destination: string;
  status: string;
  rejectionReason: string | null;
  gatewayRef: string | null;
  held: boolean;
  accountName: string | null;
  /** The desk's own note (e.g. why a gateway payout failed) — never on the receipt. */
  deskNote: string | null;
  createdAt: string;
  processedAt: string | null;
  player: { name: string; username: string | null; phone: string | null };
};

type Outcome = "paid" | "declined" | "processing" | "held";

const OUTCOME: Record<Outcome, { label: string; badge: string }> = {
  paid: { label: "Paid", badge: "border-green-500/30 bg-green-500/15 text-green-400" },
  declined: { label: "Declined", badge: "border-red-500/30 bg-red-500/15 text-red-400" },
  processing: { label: "Processing", badge: "border-yellow-500/30 bg-yellow-500/15 text-yellow-400" },
  held: { label: "Held", badge: "border-orange-500/30 bg-orange-500/15 text-orange-400" },
};

function outcomeOf(w: ShareableWithdrawal): Outcome {
  if (w.status === "completed") return "paid";
  if (w.status === "rejected" || w.status === "failed") return "declined";
  return w.held ? "held" : "processing";
}

/** The reference a player can quote back; the Finance search understands it. */
export function paymentReference(id: string) {
  return `WD-${id.slice(0, 8).toUpperCase()}`;
}

function maskAccount(value: string) {
  const v = value.trim();
  return v.length > 8 ? `${v.slice(0, 4)}•••${v.slice(-4)}` : v;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-PK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: APP_TIME_ZONE,
  });
}

/** wa.me wants the full international number, digits only: 0300… → 92300…. */
function toWhatsAppNumber(input: string) {
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = `92${digits.slice(1)}`;
  else if (digits.length === 10 && digits.startsWith("3")) digits = `92${digits}`;
  return digits;
}

/** Wallet withdrawals go to a mobile number, which is usually the player's WhatsApp too. */
function defaultNumber(w: ShareableWithdrawal) {
  if (w.player.phone) return w.player.phone;
  return w.method === "jazzcash" || w.method === "easypaisa" ? w.destination : "";
}

export function WithdrawalShareButton({
  withdrawal,
  withLabel = false,
}: {
  withdrawal: ShareableWithdrawal;
  /** Cards have room for a word next to the icon; table rows don't. */
  withLabel?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Payment status — send the receipt on WhatsApp"
        aria-label="Payment status — send the receipt on WhatsApp"
        className={`inline-flex h-7 items-center justify-center gap-1.5 rounded-lg border border-border/70 text-muted-foreground transition-colors hover:border-[#25D366]/40 hover:bg-[#25D366]/10 hover:text-[#25D366] ${
          withLabel ? "px-2.5 text-xs" : "w-7"
        }`}
      >
        <MessageCircle className="h-3.5 w-3.5" />
        {withLabel && "Share"}
      </button>
      {open && <ShareDialog withdrawal={withdrawal} onClose={() => setOpen(false)} />}
    </>
  );
}

function ShareDialog({ withdrawal: w, onClose }: { withdrawal: ShareableWithdrawal; onClose: () => void }) {
  const id = useId();
  // Fixed when the dialog opens, so a save elsewhere can't change it mid-send.
  const [outcome] = useState(() => outcomeOf(w));
  const [number, setNumber] = useState(() => defaultNumber(w));
  const [image, setImage] = useState<{ blob: Blob; url: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const reference = paymentReference(w.id);
  const fileName = `pulsenow-${reference.toLowerCase()}.png`;
  const waNumber = toWhatsAppNumber(number);

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;

    // A held withdrawal is still open, so the player's receipt says "in process".
    const receiptOutcome: ReceiptOutcome = outcome === "held" ? "processing" : outcome;
    renderReceipt({
      outcome: receiptOutcome,
      amount: `${w.currency} ${Number(w.amount).toLocaleString("en-PK", { maximumFractionDigits: 2 })}`,
      methodLabel: paymentMethodLabel(w.method),
      methodLogo: paymentLogoSrc(w.method),
      account: maskAccount(w.destination),
      accountName: w.accountName,
      player: w.player.username ? `@${w.player.username}` : w.player.name,
      dateLabel: receiptOutcome === "paid" ? "Sent" : receiptOutcome === "declined" ? "Declined" : "Requested",
      date: fmtDate(receiptOutcome === "processing" ? w.createdAt : w.processedAt ?? w.createdAt),
      reference,
      reason: receiptOutcome === "declined" ? w.rejectionReason : null,
    })
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setImage({ blob, url });
      })
      .catch(() => !cancelled && setFailed(true));

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [outcome, reference, w]);

  const file = image ? new File([image.blob], fileName, { type: "image/png" }) : null;
  const canShareFile =
    !!file && typeof navigator !== "undefined" && !!navigator.canShare && navigator.canShare({ files: [file] });

  const download = () => {
    if (!image) return;
    const a = document.createElement("a");
    a.href = image.url;
    a.download = fileName;
    a.click();
  };

  // Phones (and Windows) hand the image straight to WhatsApp from the share sheet.
  const share = async () => {
    if (!file) return;
    try {
      await navigator.share({ files: [file], title: "Withdrawal receipt" });
    } catch {
      /* dismissed */
    }
  };

  // Desktop: copy the image, open the chat, paste. Where images can't be
  // copied, it's downloaded instead so it can be attached.
  const copyAndOpen = async () => {
    if (!image) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": image.blob })]);
      setNote("Receipt copied — paste it into the chat (Ctrl+V).");
    } catch {
      download();
      setNote("Receipt downloaded — attach it in the chat.");
    }
    window.open(`https://wa.me/${waNumber}`, "_blank", "noopener,noreferrer");
  };

  return (
    <Modal title="Payment status" size="lg" onClose={onClose}>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {w.currency} {Number(w.amount).toLocaleString("en-PK", { maximumFractionDigits: 2 })} ·{" "}
              {paymentMethodLabel(w.method)}
            </p>
            <p className="font-mono text-[11px] text-muted-foreground">{reference}</p>
          </div>
          <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${OUTCOME[outcome].badge}`}>
            {OUTCOME[outcome].label}
          </span>
        </div>

        {outcome === "held" && (
          <p className="rounded-xl border border-orange-500/20 bg-orange-500/5 px-3 py-2 text-[11px] text-orange-300">
            Held — never sent to the gateway. The receipt says it&apos;s in process and doesn&apos;t mention the hold.
          </p>
        )}
        {outcome === "processing" && w.deskNote && (
          <p className="rounded-xl border border-orange-500/20 bg-orange-500/5 px-3 py-2 text-[11px] text-orange-300">
            Desk note (not on the receipt): {w.deskNote}
          </p>
        )}

        {/* The receipt the player will get. */}
        <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-border/60 bg-black/20 p-2">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image.url} alt="Receipt preview" className="max-h-[44vh] w-auto rounded-lg" />
          ) : failed ? (
            <p className="text-xs text-red-400">Couldn&apos;t draw the receipt in this browser.</p>
          ) : (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          )}
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor={`${id}-number`} className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            WhatsApp
          </label>
          <input
            id={`${id}-number`}
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            inputMode="tel"
            autoComplete="off"
            placeholder="03xx xxxxxxx"
            className="min-w-0 flex-1 rounded-lg border border-border/70 bg-card px-2.5 py-1.5 font-mono text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <p className="-mt-1.5 text-[11px] text-muted-foreground/70">
          {waNumber ? `Chat with +${waNumber}.` : "No number — WhatsApp will ask which chat to open."}
        </p>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {canShareFile && (
            <button
              type="button"
              onClick={share}
              className="col-span-2 flex items-center justify-center gap-1.5 rounded-lg bg-[#25D366]/15 py-2 text-xs font-semibold text-[#25D366] transition-colors hover:bg-[#25D366]/25 sm:col-span-1"
            >
              <Share2 className="h-3.5 w-3.5" />
              Share
            </button>
          )}
          <button
            type="button"
            onClick={copyAndOpen}
            disabled={!image}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-colors disabled:opacity-50 ${
              canShareFile
                ? "border border-border/70 bg-card text-foreground hover:bg-accent"
                : "col-span-2 bg-[#25D366]/15 text-[#25D366] hover:bg-[#25D366]/25"
            }`}
          >
            <MessageCircle className="h-3.5 w-3.5" />
            Copy &amp; open WhatsApp
          </button>
          <button
            type="button"
            onClick={download}
            disabled={!image}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-border/70 bg-card py-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </button>
        </div>

        {note && <p className="text-center text-[11px] text-green-400">{note}</p>}
      </div>
    </Modal>
  );
}

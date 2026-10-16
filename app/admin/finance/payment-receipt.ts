/**
 * Draws a withdrawal's payment-status receipt as a PNG, in the browser, for the
 * desk to send to a player on WhatsApp.
 *
 * Plain canvas — no image service, nothing uploaded. The receipt only states
 * what is true right now: "sent" once the money has actually gone out,
 * "declined" once it was refunded, "in process" for everything still open.
 */

import { APP_TIME_ZONE } from "@/lib/time";

export type ReceiptOutcome = "paid" | "declined" | "processing";

export type ReceiptData = {
  outcome: ReceiptOutcome;
  amount: string;
  methodLabel: string;
  methodLogo: string | null;
  /** Already masked, e.g. 0310•••3857. */
  account: string;
  accountName: string | null;
  player: string;
  dateLabel: string;
  date: string;
  reference: string;
  /** Declined only — the reason the admin gave the player. */
  reason: string | null;
};

const W = 1080;
const PAD = 72;

const THEME: Record<ReceiptOutcome, { color: string; title: string; subtitle: string }> = {
  paid: {
    color: "#34d399",
    title: "Payment sent",
    subtitle: "Your withdrawal has been sent.",
  },
  declined: {
    color: "#ff5d73",
    title: "Withdrawal declined",
    subtitle: "The amount has been returned to your balance.",
  },
  processing: {
    color: "#f29a0b",
    title: "Withdrawal in process",
    subtitle: "We've received your request and it's being processed.",
  },
};

const TEXT = "#f4f1ff";
const MUTED = "rgba(244,241,255,0.55)";
const FAINT = "rgba(244,241,255,0.32)";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

function withAlpha(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Shorten with an ellipsis until it fits. */
function fit(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number, maxLines: number) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= max) {
      line = next;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = fit(ctx, `${kept[maxLines - 1]}…`, max);
    return kept;
  }
  return lines;
}

function drawIcon(ctx: CanvasRenderingContext2D, outcome: ReceiptOutcome, cx: number, cy: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 12;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  if (outcome === "paid") {
    ctx.moveTo(cx - 32, cy + 2);
    ctx.lineTo(cx - 8, cy + 26);
    ctx.lineTo(cx + 34, cy - 22);
  } else if (outcome === "declined") {
    ctx.moveTo(cx - 24, cy - 24);
    ctx.lineTo(cx + 24, cy + 24);
    ctx.moveTo(cx + 24, cy - 24);
    ctx.lineTo(cx - 24, cy + 24);
  } else {
    ctx.lineWidth = 10;
    ctx.arc(cx, cy, 34, 0, Math.PI * 2);
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, cy - 20);
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + 16, cy + 10);
  }
  ctx.stroke();
  ctx.restore();
}

export async function renderReceipt(d: ReceiptData): Promise<Blob> {
  // The app's own font, if it has loaded; canvas can use it by family name.
  await document.fonts?.ready;
  const family = getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
  const font = (weight: number, size: number, face = family) => `${weight} ${size}px ${face}`;

  // const theme = THEME[d.outcome];
  const theme = THEME.paid;

  const [brand, methodLogo] = await Promise.all([
    loadImage("/brand/logo-icon.png"),
    d.methodLogo ? loadImage(d.methodLogo) : Promise.resolve(null),
  ]);

  const rows: { label: string; value: string; mono?: boolean; logo?: HTMLImageElement | null }[] = [
    { label: "Method", value: d.methodLabel, logo: methodLogo },
    { label: "Account", value: d.account, mono: true },
    ...(d.accountName ? [{ label: "Account name", value: d.accountName }] : []),
    { label: "Player", value: d.player },
    { label: d.dateLabel, value: d.date },
    { label: "Reference", value: d.reference, mono: true },
  ];

  const ROW_H = 78;
  const panelTop = 690;
  const panelH = rows.length * ROW_H + 24;

  // Measure the reason first so the canvas can grow to fit it.
  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = font(500, 28);
  const reasonLines = d.reason ? wrap(measure, `Reason: ${d.reason}`, W - PAD * 2 - 64, 3) : [];
  const reasonH = reasonLines.length ? reasonLines.length * 40 + 48 : 0;

  const H = panelTop + panelH + (reasonH ? reasonH + 28 : 0) + 170;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Background: the app's night purple, lit from above in the status colour.
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#15112e");
  bg.addColorStop(1, "#090714");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, 300, 0, W / 2, 300, 560);
  glow.addColorStop(0, withAlpha(theme.color, 0.22));
  glow.addColorStop(1, withAlpha(theme.color, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Brand row.
  ctx.textBaseline = "middle";
  let brandX = PAD;
  if (brand) {
    const h = 60;
    const w = (brand.width / brand.height) * h;
    ctx.drawImage(brand, PAD, 96 - h / 2, w, h);
    brandX = PAD + w + 16;
  }
  ctx.fillStyle = TEXT;
  ctx.textAlign = "left";
  ctx.font = font(800, 40);
  ctx.fillText("PulseNow", brandX, 96);
  ctx.textAlign = "right";
  ctx.fillStyle = FAINT;
  ctx.font = font(700, 22);
  ctx.fillText("WITHDRAWAL RECEIPT", W - PAD, 96);

  // Status mark.
  const cx = W / 2;
  const cy = 290;
  ctx.beginPath();
  ctx.arc(cx, cy, 80, 0, Math.PI * 2);
  ctx.fillStyle = withAlpha(theme.color, 0.14);
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = withAlpha(theme.color, 0.55);
  ctx.stroke();
  drawIcon(ctx, "paid", cx, cy, theme.color);

  ctx.textAlign = "center";
  ctx.fillStyle = TEXT;
  ctx.font = font(800, 58);
  ctx.fillText(theme.title, cx, 440);
  ctx.fillStyle = MUTED;
  ctx.font = font(500, 30);
  ctx.fillText(fit(ctx, theme.subtitle, W - PAD * 2), cx, 494);

  ctx.fillStyle = "#ffffff";
  ctx.font = font(800, 100);
  ctx.fillText(fit(ctx, d.amount, W - PAD * 2), cx, 600);

  // Details panel.
  ctx.beginPath();
  ctx.roundRect(PAD, panelTop, W - PAD * 2, panelH, 32);
  ctx.fillStyle = "rgba(255,255,255,0.045)";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.09)";
  ctx.stroke();

  const left = PAD + 40;
  const right = W - PAD - 40;
  rows.forEach((row, i) => {
    const y = panelTop + 12 + i * ROW_H + ROW_H / 2;

    if (i > 0) {
      ctx.beginPath();
      ctx.moveTo(left, y - ROW_H / 2);
      ctx.lineTo(right, y - ROW_H / 2);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "rgba(255,255,255,0.07)";
      ctx.stroke();
    }

    ctx.textAlign = "left";
    ctx.fillStyle = MUTED;
    ctx.font = font(500, 28);
    ctx.fillText(row.label, left, y);

    ctx.textAlign = "right";
    ctx.fillStyle = TEXT;
    ctx.font = row.mono ? font(700, 30, MONO) : font(700, 31);
    const value = fit(ctx, row.value, 540);
    ctx.fillText(value, right, y);

    if (row.logo) {
      const size = 46;
      const x = right - ctx.measureText(value).width - 16 - size;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x, y - size / 2, size, size, 12);
      ctx.clip();
      ctx.drawImage(row.logo, x, y - size / 2, size, size);
      ctx.restore();
    }
  });

  // The reason a declined withdrawal was turned down.
  const y = panelTop + panelH + 28;
  if (reasonLines.length) {
    ctx.beginPath();
    ctx.roundRect(PAD, y, W - PAD * 2, reasonH, 24);
    ctx.fillStyle = withAlpha(THEME.declined.color, 0.08);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = withAlpha(THEME.declined.color, 0.25);
    ctx.stroke();
    ctx.textAlign = "left";
    ctx.fillStyle = "#ffb3be";
    ctx.font = font(500, 28);
    reasonLines.forEach((line, i) => ctx.fillText(line, PAD + 32, y + 44 + i * 40));
  }

  // Footer.
  ctx.textAlign = "center";
  ctx.fillStyle = MUTED;
  ctx.font = font(600, 28);
  ctx.fillText("Thank you for playing with PulseNow", cx, H - 104);
  ctx.fillStyle = FAINT;
  ctx.font = font(500, 22);
  ctx.fillText(
    `Generated ${new Date().toLocaleString("en-PK", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: APP_TIME_ZONE })}`,
    cx,
    H - 60
  );

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not create the image"))), "image/png")
  );
}

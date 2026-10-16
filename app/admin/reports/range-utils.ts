// Pure date-range utilities — no "use client", safe to import in server components.

export type Preset = "today" | "yesterday" | "7d" | "30d" | "month" | "custom";
export type Grain = "hour" | "day" | "week";

export interface ReportDateRange {
  from: string;
  to: string;
  grain: Grain;
  preset: Preset;
}

function toISO(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function presetToDates(preset: Preset): { from: string; to: string } {
  const now = new Date();
  const today = toISO(now);

  if (preset === "today") return { from: today, to: today };

  if (preset === "yesterday") {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    const s = toISO(y);
    return { from: s, to: s };
  }

  if (preset === "7d") {
    const f = new Date(now);
    f.setDate(f.getDate() - 6);
    return { from: toISO(f), to: today };
  }

  if (preset === "30d") {
    const f = new Date(now);
    f.setDate(f.getDate() - 29);
    return { from: toISO(f), to: today };
  }

  if (preset === "month") {
    const f = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: toISO(f), to: today };
  }

  return { from: today, to: today };
}

export function parseDateRange(params: URLSearchParams): ReportDateRange {
  const preset = (params.get("preset") as Preset) || "7d";
  const grain = (params.get("grain") as Grain) || "day";

  if (preset !== "custom") {
    const { from, to } = presetToDates(preset);
    return { from, to, grain, preset };
  }

  const now = new Date();
  const today = toISO(now);
  const from = params.get("from") || today;
  const to = params.get("to") || today;
  return { from, to, grain, preset };
}

export function toDateObjects(range: ReportDateRange): { from: Date; to: Date } {
  return {
    from: new Date(range.from + "T00:00:00.000Z"),
    to: new Date(range.to + "T23:59:59.999Z"),
  };
}

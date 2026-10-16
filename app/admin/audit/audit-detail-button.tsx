"use client";

import { Eye, X } from "lucide-react";
import { useState } from "react";

type AuditRecord = Record<string, unknown>;

export function AuditDetailButton({
  title,
  subtitle,
  record,
}: {
  title: string;
  subtitle: string;
  record: AuditRecord;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/70 text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
        title="View audit details"
      >
        <Eye className="h-4 w-4" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm">
          <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-border/70 bg-card shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-border/60 px-5 py-4">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/80">
                  Audit detail
                </p>
                <h2 className="mt-1 truncate text-lg font-bold">{title}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/70 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                {Object.entries(record).map(([key, value]) => (
                  <div
                    key={key}
                    className="rounded-xl border border-border/60 bg-background/50 p-3"
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      {formatKey(key)}
                    </p>
                    <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground">
                      {formatValue(value)}
                    </pre>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function formatKey(value: string) {
  return value.replaceAll("_", " ");
}

function formatValue(value: unknown) {
  if (value === undefined || value === null || value === "") return "-";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

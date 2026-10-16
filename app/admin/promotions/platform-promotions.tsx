import { getPromotions } from "@/lib/actions/promotions";
import {
  CreatePromotionButton,
  TogglePromotionButton,
  EditPromotionButton,
  DeletePromotionButton,
  PreviewPromotionButton,
} from "./promotion-actions";
import { APP_TIME_ZONE } from "@/lib/time";

const TYPE_COLORS: Record<string, string> = {
  toast:  "bg-blue-500/15 text-blue-400",
  modal:  "bg-purple-500/15 text-purple-400",
  banner: "bg-yellow-500/15 text-yellow-400",
};

function fmt(d: Date | string) {
  return new Date(d).toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric", timeZone: APP_TIME_ZONE });
}

export async function PlatformPromotions() {
  const promos = await getPromotions();

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{promos.length} promotion{promos.length !== 1 ? "s" : ""} total</p>
        <CreatePromotionButton />
      </div>

      {/* Preview grid — render visual cards for active promos */}
      {promos.some((p) => p.is_active) && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Live Previews</p>
          <div className="flex flex-wrap gap-3">
            {promos.filter((p) => p.is_active).map((p) => (
              <PromotionPreviewCard key={p.id} promo={p} />
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-[24px] border border-border/70 bg-card/80">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border/60">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Promotion</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Frequency</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Created</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {promos.map((p) => (
                <tr
                  key={p.id}
                  className={`border-b border-border/40 transition-colors last:border-0 hover:bg-accent/30 ${!p.is_active ? "opacity-60" : ""}`}
                >
                  {/* Title + description */}
                  <td className="px-4 py-3">
                    <div className="flex items-start gap-2.5">
                      {p.image_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.image_url}
                          alt=""
                          className="mt-0.5 h-8 w-8 shrink-0 rounded-lg object-cover"
                        />
                      )}
                      <div>
                        <p className="font-medium">{p.title}</p>
                        {p.description && (
                          <p className="mt-0.5 max-w-[260px] truncate text-xs text-muted-foreground">{p.description}</p>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Type badge */}
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${TYPE_COLORS[p.type] ?? "bg-secondary text-muted-foreground"}`}>
                      {p.type}
                    </span>
                  </td>

                  {/* Frequency */}
                  <td className="px-4 py-3 capitalize text-muted-foreground">{p.show_frequency}</td>

                  {/* Active badge */}
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${p.is_active ? "bg-green-500/20 text-green-400" : "bg-secondary text-muted-foreground"}`}>
                      {p.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>

                  <td className="px-4 py-3 text-muted-foreground">{fmt(p.created_at)}</td>

                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <PreviewPromotionButton promo={p} />
                      <EditPromotionButton promo={p} />
                      <TogglePromotionButton id={p.id} isActive={p.is_active} />
                      <DeletePromotionButton id={p.id} title={p.title} />
                    </div>
                  </td>
                </tr>
              ))}

              {promos.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center text-muted-foreground">
                    No promotions yet. Click &ldquo;New Promotion&rdquo; to create one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Small visual preview card ────────────────────────────────────────────────

function PromotionPreviewCard({ promo }: { promo: Awaited<ReturnType<typeof getPromotions>>[0] }) {
  const isBanner = promo.type === "banner";
  const isToast  = promo.type === "toast";

  if (isBanner) {
    return (
      <div
        className="flex h-12 w-64 items-center gap-3 overflow-hidden rounded-xl border border-border/60 px-3"
        style={{ backgroundColor: promo.bg_color ?? "#0d0b1e" }}
      >
        {promo.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={promo.image_url} alt="" className="h-8 w-8 shrink-0 rounded-lg object-cover" />
        )}
        <span className="truncate text-xs font-semibold text-bp-text">{promo.title}</span>
      </div>
    );
  }

  if (isToast) {
    return (
      <div
        className="flex w-56 items-start gap-2 overflow-hidden rounded-xl border border-border/60 p-3 shadow-lg"
        style={{ backgroundColor: promo.bg_color ?? "#0d0b1e" }}
      >
        {promo.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={promo.image_url} alt="" className="h-7 w-7 shrink-0 rounded-lg object-cover" />
        )}
        <div className="min-w-0">
          <p className="truncate text-xs font-bold text-bp-text">{promo.title}</p>
          {promo.content && (
            <p className="mt-0.5 line-clamp-2 text-[10px] text-bp-text/70">{promo.content}</p>
          )}
        </div>
      </div>
    );
  }

  // modal
  return (
    <div
      className="w-52 overflow-hidden rounded-xl border border-border/60 p-4 shadow-lg"
      style={{ backgroundColor: promo.bg_color ?? "#0d0b1e" }}
    >
      {promo.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={promo.image_url} alt="" className="mb-2 h-20 w-full rounded-lg object-cover" />
      )}
      <p className="text-xs font-bold text-bp-text">{promo.title}</p>
      {promo.content && (
        <p className="mt-1 line-clamp-3 text-[10px] text-bp-text/70">{promo.content}</p>
      )}
    </div>
  );
}

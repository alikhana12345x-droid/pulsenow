"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";

/**
 * The browsing controls every admin list shares — search, filter pills, a
 * sticky pagination bar — so Users, Finance and Audit look and behave alike.
 *
 * The presentational pieces take plain values and callbacks: the Users page
 * drives them from local state (it loads every account up front). Finance and
 * Audit are unbounded, so they filter and page on the server; the `Url*`
 * wrappers below keep that state in the query string instead.
 */

// ─── Presentational ───────────────────────────────────────────────────────────

export function SearchField({
  value,
  onChange,
  placeholder,
  label,
  busy = false,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  busy?: boolean;
  className?: string;
}) {
  return (
    <label className={`relative block min-w-0 ${className}`}>
      <span className="sr-only">{label}</span>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        className="w-full rounded-xl border border-border/70 bg-card py-1.5 pl-9 pr-9 text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
      {busy && (
        <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      )}
    </label>
  );
}

export type PillOption = { key: string; label: string; count?: number };

export function FilterPills({
  label,
  options,
  active,
  onSelect,
}: {
  label: string;
  options: PillOption[];
  active: string;
  onSelect: (key: string) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex w-full gap-1 overflow-x-auto rounded-full border border-border/70 bg-card/70 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:w-fit"
    >
      {options.map((o) => {
        const on = active === o.key;
        return (
          <button
            key={o.key}
            type="button"
            aria-pressed={on}
            onClick={() => onSelect(o.key)}
            className={`flex-1 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors sm:flex-none ${
              on ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            {o.label}
            {o.count !== undefined && (
              <span
                className={`ml-1.5 rounded-full px-1.5 py-px text-[10px] tabular-nums ${
                  on ? "bg-black/15" : "bg-muted text-muted-foreground"
                }`}
              >
                {o.count.toLocaleString("en-PK")}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Search first on phones, where it's the quickest way to a record; on wide
 * screens the filters take the left and search (plus any extras) the right.
 */
export function ListToolbar({ search, filters }: { search: ReactNode; filters?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row-reverse lg:items-center lg:justify-between">
      <div className="flex gap-2">{search}</div>
      {filters}
    </div>
  );
}

export function EmptyList({ message, onClear }: { message: string; onClear?: () => void }) {
  return (
    <div className="rounded-[24px] border border-border/70 bg-card/80 px-4 py-12 text-center text-sm text-muted-foreground">
      <p>{message}</p>
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          className="mt-3 rounded-lg bg-primary/15 px-3 py-1.5 text-xs text-primary transition-colors hover:bg-primary/25"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}

/** First, last and the pages around the current one, with gaps between runs. */
function pageList(current: number, count: number): (number | "gap")[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);

  const keep = [1, current - 1, current, current + 1, count]
    .filter((p) => p >= 1 && p <= count)
    .filter((p, i, all) => all.indexOf(p) === i)
    .sort((a, b) => a - b);

  return keep.flatMap((p, i) => (i > 0 && p - keep[i - 1] > 1 ? ["gap" as const, p] : [p]));
}

const pageBtn =
  "flex h-8 min-w-8 items-center justify-center rounded-lg border px-2 text-xs font-medium tabular-nums transition-colors disabled:pointer-events-none disabled:opacity-40";
const pageBtnIdle = "border-border/70 text-foreground hover:bg-accent";

/**
 * Sticks to the bottom of the viewport while the list scrolls past, and settles
 * under the last row once the end is reached — the controls are always in reach.
 */
export function PaginationBar({
  page,
  pageCount,
  pageSize,
  total,
  overall,
  sizes = [10, 20, 50, 100],
  onPage,
  onPageSize,
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  /** Unfiltered total, shown only while a search or filter is narrowing the list. */
  overall: number | null;
  sizes?: number[];
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);

  return (
    <div className="sticky bottom-3 z-10 flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-bp-mid/90 px-3 py-2 text-xs text-muted-foreground shadow-[0_8px_30px_rgba(0,0,0,0.45)] backdrop-blur sm:px-4 sm:text-sm">
      <p className="min-w-0 truncate">
        <span className="font-medium tabular-nums text-foreground">
          {start}–{end}
        </span>
        {" of "}
        <span className="font-medium tabular-nums text-foreground">{total.toLocaleString("en-PK")}</span>
        {overall !== null && (
          <span className="hidden sm:inline"> (filtered from {overall.toLocaleString("en-PK")})</span>
        )}
      </p>

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <select
          value={pageSize}
          onChange={(e) => onPageSize(Number(e.target.value))}
          aria-label="Rows per page"
          className="h-8 rounded-lg border border-border/70 bg-card px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          {sizes.map((size) => (
            <option key={size} value={size}>
              {size} / page
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
          className={`${pageBtn} ${pageBtnIdle}`}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {/* Numbered pages where there's room; a compact counter on phones. */}
        <div className="hidden items-center gap-1 sm:flex">
          {pageList(page, pageCount).map((p, i) =>
            p === "gap" ? (
              <span key={`gap-${i}`} className="px-1 text-muted-foreground/60">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => onPage(p)}
                aria-current={p === page ? "page" : undefined}
                className={`${pageBtn} ${
                  p === page ? "border-primary bg-primary text-primary-foreground" : pageBtnIdle
                }`}
              >
                {p}
              </button>
            )
          )}
        </div>
        <span className="px-1 font-medium tabular-nums text-foreground sm:hidden">
          {page} / {pageCount}
        </span>

        <button
          type="button"
          onClick={() => onPage(page + 1)}
          disabled={page >= pageCount}
          aria-label="Next page"
          className={`${pageBtn} ${pageBtnIdle}`}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ─── URL-driven (server-paged lists) ──────────────────────────────────────────

type Patch = Record<string, string | null>;

type ListNavValue = {
  pending: boolean;
  get: (key: string) => string;
  /** Change query params; any change other than the page itself starts over at page 1. */
  update: (patch: Patch) => void;
  listTop: React.RefObject<HTMLDivElement | null>;
};

const ListNavContext = createContext<ListNavValue | null>(null);

function useListNav() {
  const ctx = useContext(ListNavContext);
  if (!ctx) throw new Error("URL list controls must be used inside <ListNav>");
  return ctx;
}

/**
 * Owns the query-string state for one list. Navigations run in a transition,
 * so the current rows stay on screen (dimmed) until the server sends the next.
 */
export function ListNav({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const listTop = useRef<HTMLDivElement>(null);

  const update = useCallback(
    (patch: Patch) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      if (!("page" in patch)) next.delete("page");
      const qs = next.toString();
      startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    },
    [params, pathname, router]
  );

  const get = useCallback((key: string) => params.get(key) ?? "", [params]);

  return (
    <ListNavContext.Provider value={{ pending, get, update, listTop }}>
      <div className="space-y-4">{children}</div>
    </ListNavContext.Provider>
  );
}

/** The rows themselves: dimmed while the next page loads, and where page flips scroll back to. */
export function ListResults({ children }: { children: ReactNode }) {
  const { pending, listTop } = useListNav();
  return (
    <div
      ref={listTop}
      aria-busy={pending}
      className={`scroll-mt-28 transition-opacity md:scroll-mt-24 ${pending ? "pointer-events-none opacity-50" : ""}`}
    >
      {children}
    </div>
  );
}

const SEARCH_DEBOUNCE_MS = 350;

export function UrlSearch({
  placeholder,
  label,
  param = "q",
}: {
  placeholder: string;
  label: string;
  param?: string;
}) {
  const { get, update, pending } = useListNav();
  const urlValue = get(param);
  const [value, setValue] = useState(urlValue);
  const focused = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Follow the URL when it changes from elsewhere (Clear filters, a tab link),
  // but never while the admin is typing — a late response would eat keystrokes.
  useEffect(() => {
    if (!focused.current) setValue(urlValue);
  }, [urlValue]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (
    <div
      className="min-w-0 flex-1 lg:w-72 lg:flex-none"
      onFocus={() => (focused.current = true)}
      onBlur={() => (focused.current = false)}
    >
      <SearchField
        value={value}
        label={label}
        placeholder={placeholder}
        busy={pending}
        onChange={(next) => {
          setValue(next);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => update({ [param]: next.trim() || null }), SEARCH_DEBOUNCE_MS);
        }}
      />
    </div>
  );
}

/** Pills for one query param; the option keyed "" means the param is absent (All). */
export function UrlFilterPills({
  param,
  label,
  options,
}: {
  param: string;
  label: string;
  options: PillOption[];
}) {
  const { get, update } = useListNav();
  return (
    <FilterPills
      label={label}
      options={options}
      active={get(param)}
      onSelect={(key) => update({ [param]: key || null })}
    />
  );
}

/** A dropdown for a param with too many values for pills, e.g. audit actions. */
export function UrlSelectFilter({
  param,
  label,
  allLabel,
  options,
}: {
  param: string;
  label: string;
  allLabel: string;
  options: PillOption[];
}) {
  const { get, update } = useListNav();
  return (
    <select
      value={get(param)}
      onChange={(e) => update({ [param]: e.target.value || null })}
      aria-label={label}
      className="min-w-0 max-w-[45%] shrink-0 rounded-xl border border-border/70 bg-card px-2.5 py-1.5 text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 lg:max-w-none"
    >
      <option value="">{allLabel}</option>
      {options.map((o) => (
        <option key={o.key} value={o.key}>
          {o.label}
          {o.count !== undefined ? ` (${o.count.toLocaleString("en-PK")})` : ""}
        </option>
      ))}
    </select>
  );
}

export function UrlEmptyList({ message, narrowed }: { message: string; narrowed: boolean }) {
  const { update } = useListNav();
  return (
    <EmptyList
      message={message}
      // Clears every filter this list knows about; the tab itself is kept.
      onClear={narrowed ? () => update({ q: null, status: null, action: null, source: null }) : undefined}
    />
  );
}

export function UrlPagination({
  page,
  pageCount,
  pageSize,
  total,
  overall,
  sizes,
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  overall: number | null;
  sizes: number[];
}) {
  const { update, listTop } = useListNav();
  return (
    <PaginationBar
      page={page}
      pageCount={pageCount}
      pageSize={pageSize}
      total={total}
      overall={overall}
      sizes={sizes}
      onPage={(next) => {
        update({ page: next > 1 ? String(next) : null });
        // The bar stays on screen while the list scrolls, so after flipping
        // pages from far down, bring the first row back into view.
        const el = listTop.current;
        if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ behavior: "smooth", block: "start" });
      }}
      onPageSize={(size) => update({ size: String(size) })}
    />
  );
}
